// Gaming by Nomi — store server.
// Startup file for cPanel "Setup Node.js App" (Spaceship shared hosting).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const config = require('./config');
const store = require('./lib/store');
const auth = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0
  })
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// ---------- Helpers available in every template ----------
const money = (n) => config.currency + ' ' + Number(n || 0).toLocaleString('en-PK');
const discount = (p) =>
  p.comparePrice > p.price ? Math.round((1 - p.price / p.comparePrice) * 100) : 0;
const waLink = (text) =>
  'https://wa.me/' + config.whatsapp + (text ? '?text=' + encodeURIComponent(text) : '');

app.use((req, res, next) => {
  res.locals.config = config;
  res.locals.money = money;
  res.locals.discount = discount;
  res.locals.waLink = waLink;
  res.locals.path = req.path;
  res.locals.categories = store.categories.all();
  res.locals.pageTitle = '';
  res.locals.metaDescription = config.tagline;
  res.locals.year = new Date().getFullYear();
  next();
});

// Tiny in-memory rate limiter for public POST endpoints.
function rateLimit(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key) || { count: 0, start: now };
    if (now - entry.start > windowMs) {
      entry.count = 0;
      entry.start = now;
    }
    entry.count++;
    hits.set(key, entry);
    if (hits.size > 5000) hits.clear();
    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes.' });
    }
    next();
  };
}

const clean = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

// ---------- Storefront ----------
app.get('/', (req, res) => {
  const products = store.products.all();
  res.render('index', {
    pageTitle: 'Gaming Gear, Earbuds & Electronics in Pakistan',
    featured: products.filter((p) => p.featured).slice(0, 8),
    newest: products.filter((p) => p.isNew).slice(0, 8),
    heroProduct: products.find((p) => p.category === 'gaming-headsets' && p.featured)
  });
});

app.get('/shop', (req, res) => {
  let list = store.products.all();
  const q = clean(req.query.q, 80).toLowerCase();
  const category = clean(req.query.category, 60);
  const sort = clean(req.query.sort, 20) || 'featured';

  if (category) list = list.filter((p) => p.category === category);
  if (q) {
    list = list.filter((p) =>
      [p.name, p.brand, p.category, p.short].join(' ').toLowerCase().includes(q)
    );
  }
  if (req.query.sale) list = list.filter((p) => discount(p) > 0);

  const sorters = {
    featured: (a, b) => Number(b.featured) - Number(a.featured),
    newest: (a, b) => Number(b.isNew) - Number(a.isNew),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name)
  };
  list = [...list].sort(sorters[sort] || sorters.featured);

  const cat = category ? store.categories.bySlug(category) : null;
  res.render('shop', {
    pageTitle: cat ? cat.name : q ? `Search: ${q}` : 'Shop All Products',
    metaDescription: cat ? cat.blurb : 'Browse gaming headsets, earbuds, handsfree, mice, keyboards, controllers and more.',
    products: list,
    activeCategory: cat,
    q,
    sort
  });
});

app.get('/category/:slug', (req, res) => {
  res.redirect(301, '/shop?category=' + encodeURIComponent(req.params.slug));
});

app.get('/product/:slug', (req, res, next) => {
  const product = store.products.bySlug(req.params.slug);
  if (!product) return next();
  const related = store.products
    .all()
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);
  res.render('product', {
    pageTitle: product.name,
    metaDescription: product.short,
    product,
    category: store.categories.bySlug(product.category),
    related
  });
});

app.get('/cart', (req, res) => res.render('cart', { pageTitle: 'Your Bag' }));
app.get('/checkout', (req, res) => res.render('checkout', { pageTitle: 'Checkout' }));
app.get('/about', (req, res) => res.render('about', { pageTitle: 'About Us' }));
app.get('/contact', (req, res) =>
  res.render('contact', { pageTitle: 'Contact Us', sent: req.query.sent === '1' })
);

const policies = require('./data/policies.json');
app.get('/policies/:slug', (req, res, next) => {
  const page = policies[req.params.slug];
  if (!page) return next();
  res.render('policy', { pageTitle: page.title, page });
});

// ---------- JSON API used by the cart / checkout ----------
app.get('/api/products', (req, res) => {
  const ids = clean(req.query.ids, 2000).split(',').filter(Boolean);
  const list = store.products.all().filter((p) => !ids.length || ids.includes(p.id));
  res.json(
    list.map(({ id, slug, name, brand, price, comparePrice, image, inStock, category }) => ({
      id, slug, name, brand, price, comparePrice, image, inStock, category
    }))
  );
});

app.post('/api/orders', rateLimit(10, 10 * 60 * 1000), (req, res) => {
  const body = req.body || {};
  const customer = {
    name: clean(body.name, 80),
    phone: clean(body.phone, 20),
    email: clean(body.email, 120),
    city: clean(body.city, 60),
    address: clean(body.address, 300),
    notes: clean(body.notes, 500)
  };
  if (!customer.name || !customer.phone || !customer.city || !customer.address) {
    return res.status(400).json({ error: 'Please fill in your name, phone, city and address.' });
  }
  if (!/^[0-9+\-\s]{10,16}$/.test(customer.phone)) {
    return res.status(400).json({ error: 'Please enter a valid phone number.' });
  }

  // Never trust prices from the browser — rebuild the order from the catalog.
  const catalog = store.products.all();
  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, 50)
    .map((line) => {
      const p = catalog.find((x) => x.id === line.id);
      const qty = Math.min(Math.max(parseInt(line.qty, 10) || 0, 0), 20);
      return p && p.inStock && qty ? { id: p.id, name: p.name, price: p.price, qty } : null;
    })
    .filter(Boolean);
  if (!items.length) return res.status(400).json({ error: 'Your bag is empty.' });

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= config.freeShippingOver ? 0 : config.shippingFee;
  const order = {
    id: 'GBN-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase(),
    createdAt: new Date().toISOString(),
    status: 'new',
    payment: 'Cash on Delivery',
    customer,
    items,
    subtotal,
    shipping,
    total: subtotal + shipping
  };
  store.append('orders', order);

  const message = [
    `Assalam o Alaikum! New order ${order.id}`,
    '',
    ...items.map((i) => `• ${i.name} × ${i.qty} — ${money(i.price * i.qty)}`),
    '',
    `Subtotal: ${money(subtotal)}`,
    `Delivery: ${shipping ? money(shipping) : 'Free'}`,
    `Total: ${money(order.total)} (Cash on Delivery)`,
    '',
    `Name: ${customer.name}`,
    `Phone: ${customer.phone}`,
    `City: ${customer.city}`,
    `Address: ${customer.address}`,
    customer.notes ? `Notes: ${customer.notes}` : ''
  ]
    .filter((l, idx, arr) => l !== '' || arr[idx - 1] !== '')
    .join('\n');

  res.json({ ok: true, orderId: order.id, total: order.total, whatsapp: waLink(message) });
});

app.get('/order/:id', (req, res, next) => {
  const order = store.read('orders').find((o) => o.id === req.params.id);
  if (!order) return next();
  res.render('order-success', { pageTitle: 'Order Placed', order });
});

app.post('/contact', rateLimit(5, 10 * 60 * 1000), (req, res) => {
  const msg = {
    id: Date.now().toString(36),
    createdAt: new Date().toISOString(),
    name: clean(req.body.name, 80),
    email: clean(req.body.email, 120),
    phone: clean(req.body.phone, 20),
    message: clean(req.body.message, 2000)
  };
  if (!msg.name || !msg.message || (!msg.email && !msg.phone)) {
    return res.status(400).render('contact', {
      pageTitle: 'Contact Us',
      sent: false,
      error: 'Please add your name, a message and an email or phone number.',
      form: msg
    });
  }
  store.append('messages', msg);
  res.redirect('/contact?sent=1');
});

app.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/shop', '/about', '/contact', ...Object.keys(policies).map((s) => '/policies/' + s)]
    .concat(store.categories.all().map((c) => '/shop?category=' + c.slug))
    .concat(store.products.all().map((p) => '/product/' + p.slug));
  res.type('application/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((u) => `  <url><loc>${config.domain}${u.replace(/&/g, '&amp;')}</loc></url>`).join('\n') +
      '\n</urlset>'
  );
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api\nSitemap: ${config.domain}/sitemap.xml\n`);
});

// ---------- Admin panel ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype];
      cb(null, Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype))
});

const admin = express.Router();
admin.use((req, res, next) => {
  res.locals.layoutAdmin = true;
  res.setHeader('Cache-Control', 'no-store');
  next();
});

admin.get('/login', (req, res) => {
  if (auth.isAdmin(req)) return res.redirect('/admin');
  res.render('admin/login', { pageTitle: 'Admin Login', error: null });
});

admin.post('/login', rateLimit(10, 15 * 60 * 1000), (req, res) => {
  if (!auth.checkPassword(req.body.password)) {
    return res.status(401).render('admin/login', { pageTitle: 'Admin Login', error: 'Wrong password.' });
  }
  auth.login(res);
  res.redirect('/admin');
});

admin.post('/logout', (req, res) => {
  auth.logout(res);
  res.redirect('/admin/login');
});

admin.use(auth.requireAdmin);

admin.get('/', (req, res) => {
  const orders = store.read('orders');
  res.render('admin/dashboard', {
    pageTitle: 'Dashboard',
    products: store.products.all(),
    orders,
    messages: store.read('messages'),
    revenue: orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0),
    usingDefaultPassword: !process.env.ADMIN_PASSWORD
  });
});

function productFromForm(body, existing = {}) {
  const specs = {};
  clean(body.specs, 3000)
    .split('\n')
    .forEach((line) => {
      const i = line.indexOf(':');
      if (i > 0) specs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
  return {
    ...existing,
    name: clean(body.name, 140),
    brand: clean(body.brand, 60),
    category: clean(body.category, 60),
    price: Math.max(0, parseInt(body.price, 10) || 0),
    comparePrice: Math.max(0, parseInt(body.comparePrice, 10) || 0),
    inStock: body.inStock === 'on',
    featured: body.featured === 'on',
    isNew: body.isNew === 'on',
    short: clean(body.short, 200),
    description: clean(body.description, 5000),
    specs
  };
}

admin.get('/products/new', (req, res) => {
  res.render('admin/product-form', { pageTitle: 'Add Product', product: null, error: null });
});

admin.get('/products/:id', (req, res, next) => {
  const product = store.products.all().find((p) => p.id === req.params.id);
  if (!product) return next();
  res.render('admin/product-form', { pageTitle: 'Edit Product', product, error: null });
});

admin.post('/products/save', upload.single('imageFile'), (req, res) => {
  const list = store.products.all();
  const id = clean(req.body.id, 20);
  const idx = id ? list.findIndex((p) => p.id === id) : -1;
  const existing = idx >= 0 ? list[idx] : {};
  const product = productFromForm(req.body, existing);

  if (!product.name || !product.category || !product.price) {
    return res.status(400).render('admin/product-form', {
      pageTitle: idx >= 0 ? 'Edit Product' : 'Add Product',
      product: { ...product, id },
      error: 'Name, category and price are required.'
    });
  }

  if (req.file) product.image = '/uploads/' + req.file.filename;
  else if (clean(req.body.image, 300)) product.image = clean(req.body.image, 300);
  if (!product.image) {
    const cat = store.categories.bySlug(product.category);
    product.image = '/img/products/' + (cat ? cat.icon : 'accessory') + '.svg';
  }

  if (idx >= 0) {
    list[idx] = product;
  } else {
    const maxId = list.reduce((m, p) => Math.max(m, parseInt(String(p.id).slice(1), 10) || 0), 0);
    product.id = 'p' + String(maxId + 1).padStart(3, '0');
    let slug = store.slugify((product.brand ? product.brand + ' ' : '') + product.name);
    while (list.some((p) => p.slug === slug)) slug += '-' + crypto.randomBytes(2).toString('hex');
    product.slug = slug;
    list.unshift(product);
  }
  store.products.save(list);
  res.redirect('/admin#products');
});

admin.post('/products/:id/delete', (req, res) => {
  store.products.save(store.products.all().filter((p) => p.id !== req.params.id));
  res.redirect('/admin#products');
});

admin.post('/orders/:id/status', (req, res) => {
  const allowed = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const orders = store.read('orders');
  const order = orders.find((o) => o.id === req.params.id);
  if (order && allowed.includes(req.body.status)) {
    order.status = req.body.status;
    store.write('orders', orders);
  }
  res.redirect('/admin#orders');
});

app.use('/admin', admin);

// ---------- Errors ----------
app.use((req, res) => {
  res.status(404).render('404', { pageTitle: 'Page Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('404', { pageTitle: 'Something went wrong', serverError: true });
});

app.listen(PORT, () => {
  console.log(`${config.storeName} running on port ${PORT}`);
});
