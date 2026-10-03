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
const catImage = (c) => (c && c.image) || '/img/products/' + ((c && c.icon) || 'accessory') + '.svg';
// A product can be sold only while it is not marked sold out and, when its
// quantity is tracked, while some are left.
const tracksStock = (p) => typeof p.stock === 'number';
const available = (p) => Boolean(p.inStock) && (!tracksStock(p) || p.stock > 0);

app.use((req, res, next) => {
  res.locals.config = config;
  res.locals.money = money;
  res.locals.discount = discount;
  res.locals.waLink = waLink;
  res.locals.catImage = catImage;
  res.locals.tracksStock = tracksStock;
  res.locals.available = available;
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
    siteImages: store.site.images(),
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
    list.map((p) => ({
      id: p.id, slug: p.slug, name: p.name, brand: p.brand, price: p.price,
      comparePrice: p.comparePrice, image: p.image, category: p.category,
      inStock: available(p), stock: tracksStock(p) ? p.stock : null
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
      return p && available(p) && qty ? { id: p.id, name: p.name, price: p.price, qty } : null;
    })
    .filter(Boolean);
  if (!items.length) return res.status(400).json({ error: 'Your bag is empty.' });
  const short = items.find((i) => {
    const p = catalog.find((x) => x.id === i.id);
    return tracksStock(p) && i.qty > p.stock;
  });
  if (short) {
    const left = catalog.find((x) => x.id === short.id).stock;
    return res.status(400).json({ error: `Only ${left} left of ${short.name}. Please lower the quantity in your bag.` });
  }

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

  // Take the ordered quantities out of stock; a product that runs out is marked sold out.
  items.forEach((i) => {
    const p = catalog.find((x) => x.id === i.id);
    if (tracksStock(p)) {
      p.stock = Math.max(0, p.stock - i.qty);
      if (p.stock === 0) p.inStock = false;
    }
  });
  if (items.some((i) => tracksStock(catalog.find((x) => x.id === i.id)))) store.products.save(catalog);

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
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      cb(null, Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + IMAGE_TYPES[file.mimetype]);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype]))
});
const uploadedSrc = (file) => '/uploads/' + file.filename;
const isUpload = (src) => typeof src === 'string' && /^\/uploads\/[\w.-]+$/.test(src);

// Every place an image can be used, so the media library can show where a
// picture is used and clear those spots when it is deleted.
function imageUsage(src) {
  const used = [];
  store.products.all().forEach((p) => {
    if (p.image === src) used.push('Product: ' + p.name);
    else if ((p.gallery || []).includes(src)) used.push('Product gallery: ' + p.name);
  });
  store.categories.all().forEach((c) => {
    if (c.image === src) used.push('Category: ' + c.name);
  });
  const custom = store.site.custom();
  Object.keys(custom).forEach((k) => {
    if (custom[k] === src && store.site.keys[k]) used.push(store.site.keys[k].label);
  });
  return used;
}

// Removes an uploaded file from disk once nothing on the site points to it.
function deleteUploadIfUnused(src) {
  if (!isUpload(src) || imageUsage(src).length) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(src)), () => {});
}

function fallbackImage(categorySlug) {
  const cat = store.categories.bySlug(categorySlug);
  return '/img/products/' + (cat ? cat.icon : 'accessory') + '.svg';
}

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
  const products = store.products.all();
  res.render('admin/dashboard', {
    pageTitle: 'Dashboard',
    products,
    soldOut: products.filter((p) => !available(p)).length,
    orders,
    messages: store.read('messages'),
    revenue: orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0),
    usingDefaultPassword: !process.env.ADMIN_PASSWORD,
    flash: clean(req.query.msg, 200)
  });
});

// Empty means "quantity not tracked"; otherwise a whole number 0 or more.
function parseStock(value) {
  const v = clean(value, 10);
  if (v === '') return undefined;
  return Math.max(0, parseInt(v, 10) || 0);
}

function productFromForm(body, existing = {}) {
  const specs = {};
  clean(body.specs, 3000)
    .split('\n')
    .forEach((line) => {
      const i = line.indexOf(':');
      if (i > 0) specs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
  const product = {
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
  const stock = parseStock(body.stock);
  if (stock === undefined) delete product.stock;
  else product.stock = stock;
  return product;
}

const toList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

admin.get('/products/new', (req, res) => {
  res.render('admin/product-form', { pageTitle: 'Add Product', product: null, error: null });
});

admin.get('/products/:id', (req, res, next) => {
  const product = store.products.all().find((p) => p.id === req.params.id);
  if (!product) return next();
  res.render('admin/product-form', { pageTitle: 'Edit Product', product, error: null });
});

const productUpload = upload.fields([
  { name: 'imageFile', maxCount: 1 },
  { name: 'galleryFiles', maxCount: 12 }
]);

admin.post('/products/save', productUpload, (req, res) => {
  const files = req.files || {};
  const list = store.products.all();
  const id = clean(req.body.id, 20);
  const idx = id ? list.findIndex((p) => p.id === id) : -1;
  const existing = idx >= 0 ? list[idx] : {};
  const product = productFromForm(req.body, existing);

  if (!product.name || !product.category || !product.price) {
    // Throw away anything uploaded with the rejected form.
    [...(files.imageFile || []), ...(files.galleryFiles || [])].forEach((f) => deleteUploadIfUnused(uploadedSrc(f)));
    return res.status(400).render('admin/product-form', {
      pageTitle: idx >= 0 ? 'Edit Product' : 'Add Product',
      product: { ...product, id },
      error: 'Name, category and price are required.'
    });
  }

  const dropped = [];
  // Main picture: replace with a new upload, remove, or keep.
  if (files.imageFile && files.imageFile[0]) {
    dropped.push(product.image);
    product.image = uploadedSrc(files.imageFile[0]);
  } else if (req.body.removeImage === 'on') {
    dropped.push(product.image);
    product.image = '';
  }
  // Extra pictures: remove the ticked ones, then add new uploads.
  const remove = toList(req.body.removeGallery).filter((src) => (existing.gallery || []).includes(src));
  product.gallery = (existing.gallery || []).filter((src) => !remove.includes(src));
  dropped.push(...remove);
  product.gallery.push(...(files.galleryFiles || []).map(uploadedSrc));
  if (!product.gallery.length) delete product.gallery;

  if (!product.image || (product.image.startsWith('/img/products/') && existing.category !== product.category)) {
    product.image = fallbackImage(product.category);
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
  dropped.forEach(deleteUploadIfUnused);
  res.redirect('/admin?msg=' + encodeURIComponent('Saved ' + product.name) + '#products');
});

admin.post('/products/:id/delete', (req, res) => {
  const list = store.products.all();
  const product = list.find((p) => p.id === req.params.id);
  store.products.save(list.filter((p) => p.id !== req.params.id));
  if (product) [product.image, ...(product.gallery || [])].forEach(deleteUploadIfUnused);
  res.redirect('/admin#products');
});

// Quick actions from the products table. Each one changes a single product
// and returns to its row.
function updateProduct(req, res, change) {
  const list = store.products.all();
  const product = list.find((p) => p.id === req.params.id);
  if (!product) return res.redirect('/admin#products');
  const message = change(product);
  store.products.save(list);
  res.redirect('/admin?msg=' + encodeURIComponent(message || 'Updated ' + product.name) + '#p-' + product.id);
}

admin.post('/products/:id/quick', (req, res) => {
  updateProduct(req, res, (p) => {
    const price = parseInt(req.body.price, 10);
    if (price > 0) p.price = price;
    if (req.body.comparePrice !== undefined) p.comparePrice = Math.max(0, parseInt(req.body.comparePrice, 10) || 0);
    if (req.body.stock !== undefined) {
      const stock = parseStock(req.body.stock);
      if (stock === undefined) delete p.stock;
      else {
        if (stock > 0 && !(p.stock > 0)) p.inStock = true;
        if (stock === 0) p.inStock = false;
        p.stock = stock;
      }
    }
    return 'Saved price and quantity for ' + p.name;
  });
});

admin.post('/products/:id/description', (req, res) => {
  updateProduct(req, res, (p) => {
    p.short = clean(req.body.short, 200);
    p.description = clean(req.body.description, 5000);
    return 'Saved description for ' + p.name;
  });
});

admin.post('/products/:id/add-stock', (req, res) => {
  updateProduct(req, res, (p) => {
    const add = Math.min(Math.max(parseInt(req.body.qty, 10) || 0, 0), 100000);
    if (!add) return 'Enter how many to add';
    p.stock = (tracksStock(p) ? p.stock : 0) + add;
    p.inStock = true;
    return `Added ${add} to ${p.name} — ${p.stock} in stock`;
  });
});

admin.post('/products/:id/sold-out', (req, res) => {
  updateProduct(req, res, (p) => {
    if (req.body.state === 'in') {
      p.inStock = true;
      if (tracksStock(p) && p.stock === 0) {
        delete p.stock;
        return p.name + ' is back in stock (quantity not tracked — add quantity to track it)';
      }
      return p.name + ' is back in stock';
    }
    p.inStock = false;
    return p.name + ' marked as sold out';
  });
});

admin.post('/products/:id/image', upload.single('imageFile'), (req, res) => {
  const list = store.products.all();
  const product = list.find((p) => p.id === req.params.id);
  if (!product || !req.file) {
    if (req.file) deleteUploadIfUnused(uploadedSrc(req.file));
    return res.redirect('/admin?msg=' + encodeURIComponent('Choose a JPG, PNG, WEBP or GIF picture') + '#products');
  }
  const old = product.image;
  product.image = uploadedSrc(req.file);
  store.products.save(list);
  deleteUploadIfUnused(old);
  res.redirect('/admin?msg=' + encodeURIComponent('New picture saved for ' + product.name) + '#p-' + product.id);
});

admin.post('/products/:id/image/delete', (req, res) => {
  updateProduct(req, res, (p) => {
    const old = p.image;
    p.image = fallbackImage(p.category);
    setImmediate(() => deleteUploadIfUnused(old));
    return 'Picture removed from ' + p.name;
  });
});

// ---- Categories ----
admin.get('/categories', (req, res) => {
  res.render('admin/categories', {
    pageTitle: 'Categories',
    list: store.categories.all(),
    counts: store.products.all().reduce((m, p) => ((m[p.category] = (m[p.category] || 0) + 1), m), {}),
    flash: clean(req.query.msg, 200)
  });
});

admin.post('/categories/:slug', upload.single('imageFile'), (req, res) => {
  const list = store.categories.all();
  const cat = list.find((c) => c.slug === req.params.slug);
  if (!cat) {
    if (req.file) deleteUploadIfUnused(uploadedSrc(req.file));
    return res.redirect('/admin/categories');
  }
  const old = cat.image;
  cat.name = clean(req.body.name, 60) || cat.name;
  cat.blurb = clean(req.body.blurb, 200);
  if (req.file) cat.image = uploadedSrc(req.file);
  else if (req.body.removeImage === 'on') delete cat.image;
  store.categories.save(list);
  if (old !== cat.image) deleteUploadIfUnused(old);
  res.redirect('/admin/categories?msg=' + encodeURIComponent('Saved ' + cat.name) + '#c-' + cat.slug);
});

// ---- Site pictures & media library ----
admin.get('/media', (req, res) => {
  const files = fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
    .map((f) => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, f));
      const src = '/uploads/' + f;
      return { src, name: f, size: stat.size, time: stat.mtimeMs, usedBy: imageUsage(src) };
    })
    .sort((a, b) => b.time - a.time);
  res.render('admin/media', {
    pageTitle: 'Pictures',
    files,
    siteKeys: store.site.keys,
    siteImages: store.site.images(),
    siteCustom: store.site.custom(),
    flash: clean(req.query.msg, 200)
  });
});

admin.post('/media/upload', upload.array('files', 20), (req, res) => {
  const n = (req.files || []).length;
  res.redirect('/admin/media?msg=' + encodeURIComponent(n ? `Uploaded ${n} picture${n > 1 ? 's' : ''}` : 'Choose JPG, PNG, WEBP or GIF pictures'));
});

admin.post('/media/delete', (req, res) => {
  const src = clean(req.body.src, 200);
  if (!isUpload(src)) return res.redirect('/admin/media');
  // Clear every spot that uses the picture, then delete the file.
  const products = store.products.all();
  products.forEach((p) => {
    if (p.image === src) p.image = fallbackImage(p.category);
    if (p.gallery) {
      p.gallery = p.gallery.filter((g) => g !== src);
      if (!p.gallery.length) delete p.gallery;
    }
  });
  store.products.save(products);
  const cats = store.categories.all();
  cats.forEach((c) => {
    if (c.image === src) delete c.image;
  });
  store.categories.save(cats);
  const custom = store.site.custom();
  Object.keys(custom).forEach((k) => custom[k] === src && store.site.setImage(k, ''));
  deleteUploadIfUnused(src);
  res.redirect('/admin/media?msg=' + encodeURIComponent('Picture deleted'));
});

admin.post('/site-images/:key', upload.single('imageFile'), (req, res) => {
  const key = req.params.key;
  if (!store.site.keys[key]) {
    if (req.file) deleteUploadIfUnused(uploadedSrc(req.file));
    return res.redirect('/admin/media');
  }
  const old = store.site.custom()[key];
  if (req.file) store.site.setImage(key, uploadedSrc(req.file));
  else if (req.body.reset === '1') store.site.setImage(key, '');
  else return res.redirect('/admin/media?msg=' + encodeURIComponent('Choose a picture to upload') + '#site');
  deleteUploadIfUnused(old);
  res.redirect('/admin/media?msg=' + encodeURIComponent('Updated ' + store.site.keys[key].label) + '#site');
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
  if (err instanceof multer.MulterError && req.originalUrl.startsWith('/admin')) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That picture is bigger than 5 MB.' : 'Upload failed: ' + err.message;
    return res.redirect('/admin?msg=' + encodeURIComponent(msg));
  }
  console.error(err);
  res.status(500).render('404', { pageTitle: 'Something went wrong', serverError: true });
});

app.listen(PORT, () => {
  console.log(`${config.storeName} running on port ${PORT}`);
});
