// Store-wide settings. Edit these values to update the whole website.
module.exports = {
  storeName: 'Gaming by Nomi',
  tagline: 'Gaming gear & electronics, delivered across Pakistan.',
  domain: 'https://gamingbynomi.store',

  phoneDisplay: '0342 7704070',
  // International format without "+" or leading zero — used for WhatsApp links.
  whatsapp: '923427704070',
  email: 'info@gamingbynomi.store',
  city: 'Pakistan',

  currency: 'Rs',
  // Flat delivery charge (PKR) and the order total above which delivery is free.
  shippingFee: 250,
  freeShippingOver: 10000,

  social: {
    instagram: '',
    facebook: '',
    tiktok: '',
    youtube: ''
  },

  // Admin panel: set ADMIN_PASSWORD (and SESSION_SECRET) as environment
  // variables in cPanel → Setup Node.js App. The fallback below is only for
  // local testing and MUST be changed before going live.
  adminPassword: process.env.ADMIN_PASSWORD || 'nomi-admin-123',
  sessionSecret: process.env.SESSION_SECRET || ''
};
