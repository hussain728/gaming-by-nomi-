const crypto = require('crypto');
const config = require('../config');

// Without SESSION_SECRET, a random secret is generated at boot (admins are
// simply logged out whenever the app restarts).
const secret = config.sessionSecret || crypto.randomBytes(32).toString('hex');
const COOKIE = 'gbn_admin';
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

function sign(value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').filter(Boolean).map((part) => {
      const i = part.indexOf('=');
      return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
    })
  );
}

function isAdmin(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const [expires, sig] = token.split('.');
  return safeEqual(sig, sign(expires)) && Number(expires) > Date.now();
}

function login(res) {
  const expires = String(Date.now() + MAX_AGE_MS);
  res.cookie(COOKIE, expires + '.' + sign(expires), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS
  });
}

function logout(res) {
  res.clearCookie(COOKIE);
}

function checkPassword(input) {
  return safeEqual(input || '', config.adminPassword);
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.redirect('/admin/login');
}

module.exports = { isAdmin, login, logout, checkPassword, requireAdmin };
