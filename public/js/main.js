/* Gaming by Nomi — storefront interactions */
(function () {
  'use strict';

  var STORE = window.STORE || { currency: 'Rs', shippingFee: 0, freeShippingOver: 0 };
  var CART_KEY = 'gbn_cart';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function money(n) { return STORE.currency + ' ' + Number(n || 0).toLocaleString('en-PK'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Cart storage ---------- */
  function readCart() {
    try { var c = JSON.parse(localStorage.getItem(CART_KEY)); return Array.isArray(c) ? c : []; }
    catch (e) { return []; }
  }
  function writeCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* storage unavailable */ }
    updateCount(true);
  }
  function addToCart(id, qty) {
    var cart = readCart();
    var line = cart.find(function (l) { return l.id === id; });
    if (line) line.qty = Math.min(line.qty + qty, 20);
    else cart.push({ id: id, qty: Math.min(qty, 20) });
    writeCart(cart);
  }
  function setQty(id, qty) {
    var cart = readCart()
      .map(function (l) { return l.id === id ? { id: id, qty: Math.max(0, Math.min(qty, 20)) } : l; })
      .filter(function (l) { return l.qty > 0; });
    writeCart(cart);
  }
  function updateCount(bump) {
    var n = readCart().reduce(function (s, l) { return s + l.qty; }, 0);
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = n;
      el.hidden = n === 0;
      if (bump && n) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(html) {
    var el = $('[data-toast]');
    if (!el) return;
    el.innerHTML = html;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 3200);
  }

  /* ---------- Navigation ---------- */
  var nav = $('#nav');
  function onScroll() { if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var menuBtn = $('[data-menu-toggle]');
  var mobileMenu = $('[data-mobile-menu]');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = document.body.classList.toggle('menu-open');
      menuBtn.setAttribute('aria-expanded', open);
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (mobileMenu) mobileMenu.setAttribute('aria-hidden', !open);
    });
  }

  $$('.nav__dropdown-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dd = btn.parentElement;
      var open = dd.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open);
    });
  });
  document.addEventListener('click', function (e) {
    $$('.nav__dropdown.is-open').forEach(function (dd) {
      if (!dd.contains(e.target)) { dd.classList.remove('is-open'); $('.nav__dropdown-btn', dd).setAttribute('aria-expanded', false); }
    });
  });

  var searchPanel = $('[data-search-panel]');
  $$('[data-search-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!searchPanel) return;
      searchPanel.hidden = false;
      $('input', searchPanel).focus();
    });
  });
  $$('[data-search-close]').forEach(function (b) {
    b.addEventListener('click', function () { searchPanel.hidden = true; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (searchPanel) searchPanel.hidden = true;
    if (document.body.classList.contains('menu-open') && menuBtn) menuBtn.click();
  });

  /* ---------- Scroll reveal ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- Add to cart / buy now ---------- */
  function qtyFromPage() {
    var input = $('[data-qty-input]');
    return input ? Math.max(1, Math.min(parseInt(input.value, 10) || 1, 20)) : 1;
  }
  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add-to-cart]');
    if (add) {
      var qty = add.hasAttribute('data-with-qty') ? qtyFromPage() : 1;
      addToCart(add.getAttribute('data-add-to-cart'), qty);
      add.classList.add('is-added');
      setTimeout(function () { add.classList.remove('is-added'); }, 1200);
      toast('<span>Added ' + esc(add.getAttribute('data-name')) + '</span><a href="/cart">View bag</a>');
      return;
    }
    var buy = e.target.closest('[data-buy-now]');
    if (buy) {
      addToCart(buy.getAttribute('data-buy-now'), qtyFromPage());
      window.location.href = '/checkout';
    }
  });

  var qtyBox = $('[data-qty]');
  if (qtyBox) {
    var qInput = $('[data-qty-input]', qtyBox);
    $('[data-qty-minus]', qtyBox).addEventListener('click', function () { qInput.value = Math.max(1, (parseInt(qInput.value, 10) || 1) - 1); });
    $('[data-qty-plus]', qtyBox).addEventListener('click', function () { qInput.value = Math.min(parseInt(qInput.max, 10) || 20, (parseInt(qInput.value, 10) || 1) + 1); });
  }

  /* ---------- Product picture gallery ---------- */
  var galleryMain = $('[data-gallery-main]');
  $$('[data-gallery-thumb]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      galleryMain.src = btn.getAttribute('data-gallery-thumb');
      $$('[data-gallery-thumb]').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
    });
  });

  /* ---------- Admin: filter the products table ---------- */
  var adminFilter = $('[data-admin-filter]');
  if (adminFilter) {
    adminFilter.addEventListener('input', function () {
      var q = adminFilter.value.trim().toLowerCase();
      $$('[data-filter-row]').forEach(function (row) {
        row.hidden = q && row.getAttribute('data-filter-row').indexOf(q) === -1;
      });
    });
  }

  /* ---------- Small helpers ---------- */
  $$('[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });
  $$('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault(); });
  });

  /* ---------- Cart + checkout pages ---------- */
  function loadCartProducts() {
    var cart = readCart();
    if (!cart.length) return Promise.resolve({ cart: [], lines: [] });
    var ids = cart.map(function (l) { return l.id; }).join(',');
    return fetch('/api/products?ids=' + encodeURIComponent(ids))
      .then(function (r) { return r.json(); })
      .then(function (products) {
        var lines = cart.map(function (l) {
          var p = products.find(function (x) { return x.id === l.id; });
          return p && p.inStock ? { p: p, qty: l.qty } : null;
        }).filter(Boolean);
        // Drop items that were removed from the catalog or sold out.
        if (lines.length !== cart.length) {
          writeCart(lines.map(function (l) { return { id: l.p.id, qty: l.qty }; }));
        }
        return { lines: lines };
      });
  }

  function renderSummary(lines) {
    var box = $('[data-cart-summary]');
    if (!box) return;
    var subtotal = lines.reduce(function (s, l) { return s + l.p.price * l.qty; }, 0);
    var shipping = subtotal >= STORE.freeShippingOver ? 0 : STORE.shippingFee;
    $('[data-sum-subtotal]', box).textContent = money(subtotal);
    $('[data-sum-shipping]', box).textContent = shipping ? money(shipping) : 'Free';
    $('[data-sum-total]', box).textContent = money(subtotal + shipping);
    var hint = $('[data-sum-hint]', box);
    hint.textContent = shipping ? 'Add ' + money(STORE.freeShippingOver - subtotal) + ' more for free delivery.' : '';
    hint.hidden = !shipping;
    var items = $('[data-summary-items]', box);
    if (items) {
      items.innerHTML = lines.map(function (l) {
        return '<div class="summary__item"><img src="' + esc(l.p.image) + '" alt=""><span>' + esc(l.p.name) +
          ' × ' + l.qty + '</span><span>' + money(l.p.price * l.qty) + '</span></div>';
      }).join('');
    }
    box.hidden = !lines.length;
  }

  var emptyBag =
    '<div class="empty"><svg class="i i-lg"><use href="#i-bag"/></svg><h2>Your bag is empty.</h2>' +
    '<p>Find something you love — headsets, earbuds, controllers and more.</p>' +
    '<div class="hero__cta hero__cta--center"><a href="/shop" class="btn btn--primary btn--lg">Start shopping</a></div></div>';

  var cartPage = $('[data-cart-page]');
  function renderCart() {
    loadCartProducts().then(function (res) {
      var box = $('[data-cart-lines]');
      if (!res.lines.length) { box.innerHTML = emptyBag; renderSummary([]); return; }
      box.innerHTML = res.lines.map(function (l) {
        var p = l.p;
        return '<div class="cart-line">' +
          '<a href="/product/' + esc(p.slug) + '"><img class="cart-line__img" src="' + esc(p.image) + '" alt="' + esc(p.name) + '"></a>' +
          '<div><div class="cart-line__top"><div><span class="cart-line__brand">' + esc(p.brand) + '</span><br>' +
          '<a class="cart-line__name" href="/product/' + esc(p.slug) + '">' + esc(p.name) + '</a></div>' +
          '<b>' + money(p.price * l.qty) + '</b></div>' +
          '<div class="cart-line__bottom"><div class="qty qty--sm">' +
          '<button type="button" data-line-qty="' + esc(p.id) + '" data-delta="-1" aria-label="Decrease"><svg class="i i-sm"><use href="#i-minus"/></svg></button>' +
          '<input type="number" value="' + l.qty + '" readonly aria-label="Quantity">' +
          '<button type="button" data-line-qty="' + esc(p.id) + '" data-delta="1" aria-label="Increase"><svg class="i i-sm"><use href="#i-plus"/></svg></button>' +
          '</div><button type="button" class="cart-line__remove" data-line-remove="' + esc(p.id) + '" aria-label="Remove">' +
          '<svg class="i"><use href="#i-trash"/></svg></button></div></div></div>';
      }).join('');
      renderSummary(res.lines);
    }).catch(function () {
      $('[data-cart-lines]').innerHTML = '<p class="form__error">Could not load your bag. Please refresh the page.</p>';
    });
  }
  if (cartPage) {
    renderCart();
    cartPage.addEventListener('click', function (e) {
      var q = e.target.closest('[data-line-qty]');
      var r = e.target.closest('[data-line-remove]');
      if (q) {
        var id = q.getAttribute('data-line-qty');
        var line = readCart().find(function (l) { return l.id === id; });
        if (line) setQty(id, line.qty + Number(q.getAttribute('data-delta')));
        renderCart();
      } else if (r) {
        setQty(r.getAttribute('data-line-remove'), 0);
        renderCart();
      }
    });
  }

  var checkoutPage = $('[data-checkout-page]');
  if (checkoutPage) {
    var form = $('[data-checkout-form]');
    var errorBox = $('[data-form-error]');
    var submitBtn = $('[data-place-order]');

    loadCartProducts().then(function (res) {
      if (!res.lines.length) { checkoutPage.innerHTML = emptyBag; return; }
      renderSummary(res.lines);
    });

    // Remember delivery details on this device for next time.
    try {
      var saved = JSON.parse(localStorage.getItem('gbn_customer') || '{}');
      Object.keys(saved).forEach(function (k) { if (form.elements[k] && k !== 'notes') form.elements[k].value = saved[k]; });
    } catch (e) { /* ignore */ }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorBox.hidden = true;
      var data = {};
      ['name', 'phone', 'email', 'city', 'address', 'notes'].forEach(function (k) { data[k] = form.elements[k].value.trim(); });
      var missing = ['name', 'phone', 'city', 'address'].filter(function (k) { return !data[k]; });
      if (missing.length) {
        errorBox.textContent = 'Please fill in your name, phone, city and address.';
        errorBox.hidden = false;
        form.elements[missing[0]].focus();
        return;
      }
      data.items = readCart();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Placing order…';

      // Open the WhatsApp tab now (inside the click) so popup blockers allow it.
      var waWindow = window.open('', '_blank');

      fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.body.error || 'Could not place order.');
          try {
            var keep = {}; ['name', 'phone', 'email', 'city', 'address'].forEach(function (k) { keep[k] = data[k]; });
            localStorage.setItem('gbn_customer', JSON.stringify(keep));
          } catch (err) { /* ignore */ }
          writeCart([]);
          if (waWindow) waWindow.location.href = res.body.whatsapp;
          window.location.href = '/order/' + encodeURIComponent(res.body.orderId);
        })
        .catch(function (err) {
          if (waWindow) waWindow.close();
          errorBox.textContent = err.message || 'Something went wrong. Please try again or order on WhatsApp.';
          errorBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Place order';
        });
    });
  }

  updateCount(false);
})();
