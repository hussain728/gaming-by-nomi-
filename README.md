# Gaming by Nomi — Online Store

A fast, clean white & blue store for gaming gear and electronics (headsets, earbuds, handsfree, mice, keyboards, controllers, consoles, power banks and chargers). It is built with **Node.js + Express** and works on desktop, tablet and mobile.

- **Storefront:** home, shop with category filters, search and sort, product pages, bag, checkout, about, contact, and policy pages
- **Checkout:** cash on delivery. Orders are saved on the server, and WhatsApp opens with the full order details (0342 7704070)
- **Admin panel** (`/admin`): add, edit and delete products, upload photos, manage order status and read contact messages
- **No database needed.** Data lives in JSON files in `data/`, so it runs on any shared hosting

---

## Run it on your computer

```bash
npm install
npm start
```

Open http://localhost:3000. The admin panel is at http://localhost:3000/admin (default password `nomi-admin-123`, which you must change before going live).

---

## Upload to Spaceship shared hosting (cPanel)

1. **Zip the project.** Zip everything **except** the `node_modules` folder.
2. **Upload.** In cPanel, open **File Manager**. Create a folder such as `gamingbynomi` in your home directory (not inside `public_html`). Upload the zip there and **Extract** it.
3. **Create the Node.js app.** In cPanel, open **Setup Node.js App** → **Create Application**:
   - **Node.js version:** 18 or newer (the newest available is best)
   - **Application mode:** Production
   - **Application root:** `gamingbynomi`
   - **Application URL:** `gamingbynomi.store`
   - **Application startup file:** `app.js`
4. **Add environment variables** on the same screen:
   - `ADMIN_PASSWORD`: your own strong admin password
   - `SESSION_SECRET`: any long random text (for example 40 random letters and numbers)
   - `NODE_ENV`: `production`
5. Click **Create**. Then click **Run NPM Install** and wait for it to finish.
6. Click **Restart**. Your store is live at https://gamingbynomi.store.
7. **Turn on SSL.** In cPanel → **SSL/TLS Status**, run AutoSSL so the site opens on `https://`.

> Whenever you change files through File Manager, click **Restart** in *Setup Node.js App* to apply them.

---

## Managing the store

| What | Where |
| --- | --- |
| Products, prices, photos, stock | `/admin` → Products (or edit `data/products.json`) |
| Orders and their status | `/admin` → Orders (saved in `data/orders.json`) |
| Contact form messages | `/admin` → Messages |
| Phone, WhatsApp, email, delivery fee, free-delivery limit, social links | `config.js` |
| Categories | `data/categories.json` |
| Shipping, returns, privacy and terms text | `data/policies.json` |
| Colours and design | `public/css/style.css` (colour variables at the top) |

**Product photos:** upload them from the admin panel. Square images (for example 800×800) with a white or transparent background look best. Until you upload real photos, each product shows a matching illustration.

**Starter catalogue:** the 39 products and prices included are samples. Edit or replace them with your real stock and prices.

**Backups:** download the `data/` and `public/uploads/` folders from File Manager from time to time. They hold your products, orders and uploaded photos.

---

## Project structure

```
app.js              Server and all routes (startup file for cPanel)
config.js           Store settings (phone, email, fees…)
lib/                Data storage and admin login helpers
data/               Products, categories, policies (+ orders/messages created automatically)
views/              Page templates (EJS)
public/             CSS, JavaScript, images, uploads
```
