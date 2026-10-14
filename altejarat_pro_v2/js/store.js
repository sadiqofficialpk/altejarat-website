/* ============================================================
   Al Tejarat PRO — Storefront SPA (English, website-only orders)
   ============================================================ */
(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = DB.esc, money = DB.money;
const digits = s => String(s || '').replace(/\D/g, '');

/* ---------- state ---------- */
let settings = {};
let cart = [];            // altejarat_cart_v1 [{key,pid,name,price,qty,img,color,size}]
let wishlist = [];        // altejarat_wishlist_v1 [ids]
let couponState = null;   // {coupon, discount}
let timers = [];          // intervals cleared on route change
let revCache = null;      // ratings map per route render

/* ---------- persistence ---------- */
function loadCart() { try { cart = JSON.parse(localStorage.getItem('altejarat_cart_v1')) || []; } catch (e) { cart = []; } }
function saveCart() { try { localStorage.setItem('altejarat_cart_v1', JSON.stringify(cart)); } catch (e) {} }
function loadWishlist() { try { wishlist = JSON.parse(localStorage.getItem('altejarat_wishlist_v1')) || []; } catch (e) { wishlist = []; } }
function saveWishlist() { try { localStorage.setItem('altejarat_wishlist_v1', JSON.stringify(wishlist)); } catch (e) {} }

/* ---------- pricing ---------- */
const effPrice = p => (p.salePrice != null && +p.salePrice < +p.price) ? +p.salePrice : +p.price;
const discPct = p => (p.salePrice != null && +p.salePrice < +p.price && +p.price > 0)
  ? Math.round((1 - (+p.salePrice) / (+p.price)) * 100) : 0;
const cartCount = () => cart.reduce((a, i) => a + (i.qty || 0), 0);
const cartSubtotal = () => cart.reduce((a, i) => a + (i.price || 0) * (i.qty || 0), 0);

/* ---------- TikTok pixel (guarded) ---------- */
function tEvent(name, params) {
  try {
    if (settings.tiktokPixel && window.ttq) window.ttq.track(name, params || {});
  } catch (e) {}
}
function tPage(path) {
  try {
    if (settings.tiktokPixel && window.ttq) window.ttq.page();
  } catch (e) {}
}

/* ---------- toast ---------- */
function toast(msg, kind) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2600);
}

/* ---------- ratings ---------- */
async function ratingsMap() {
  if (revCache) return revCache;
  const m = {};
  try {
    const all = await DB.getReviews();
    (all || []).forEach(r => { if (r.productId) (m[r.productId] = m[r.productId] || []).push(r); });
  } catch (e) {}
  revCache = m;
  return m;
}
function stars(avg) {
  const r = Math.round(+avg || 0);
  let h = '<span class="stars">';
  for (let i = 1; i <= 5; i++) h += `<span class="${i <= r ? '' : 'off'}">★</span>`;
  return h + '</span>';
}
async function fillRatings(root) {
  const map = await ratingsMap();
  (root || document).querySelectorAll('[data-rating]').forEach(el => {
    const revs = map[el.dataset.rating] || [];
    if (!revs.length) { el.innerHTML = '<span class="text-mut">No reviews yet</span>'; return; }
    el.innerHTML = stars(DB.avgRating(revs)) + `<span>(${revs.length})</span>`;
  });
}

/* ---------- product card ---------- */
function productCard(p) {
  const imgs = DB.productImages(p) || [];
  const img = imgs[0] || '';
  const ep = effPrice(p), dp = discPct(p);
  const isNew = p.createdAt && (Date.now() - p.createdAt) < 14 * 864e5;
  const out = (p.stock == null ? 99 : +p.stock) <= 0;
  const wished = wishlist.includes(p.id);
  return `<div class="p-card" data-nav="/product/${esc(DB.productSlug(p))}" role="link" tabindex="0">
    <div class="p-media">
      ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy">` : ''}
      <div class="p-badges">${dp ? `<span class="badge badge-sale">-${dp}%</span>` : ''}${isNew ? '<span class="badge badge-new">NEW</span>' : ''}</div>
      <button class="wish-btn ${wished ? 'on' : ''}" data-wish="${esc(p.id)}" aria-label="Add to wishlist">♥</button>
      ${out ? '<div class="p-out"><span class="badge badge-out">Out of Stock</span></div>' : ''}
    </div>
    <div class="p-body">
      <div class="p-cat">${esc(p.category || '')}</div>
      <div class="p-title">${esc(p.name)}</div>
      <div class="rate-line" data-rating="${esc(p.id)}"></div>
      <div class="p-price"><span class="now">${money(ep)}</span>${dp ? `<span class="old">${money(p.price)}</span>` : ''}</div>
    </div>
  </div>`;
}

/* ---------- wishlist ---------- */
function toggleWish(pid) {
  const i = wishlist.indexOf(pid);
  if (i >= 0) { wishlist.splice(i, 1); toast('Removed from wishlist'); }
  else { wishlist.push(pid); toast('Added to wishlist', 'ok'); }
  saveWishlist(); updateCounts();
  $$(`.wish-btn[data-wish="${CSS.escape(pid)}"]`).forEach(b => b.classList.toggle('on', wishlist.includes(pid)));
  if (location.pathname === '/wishlist') route();
}

/* ---------- cart ---------- */
function addToCart(p, opts) {
  opts = opts || {};
  const qty = Math.max(1, opts.qty || 1);
  const color = opts.color || '', size = opts.size || '';
  const key = [p.id, color, size].join('|');
  const img = opts.img || DB.productImage(p) || '';
  const ex = cart.find(i => i.key === key);
  if (ex) ex.qty += qty;
  else cart.push({ key, pid: p.id, name: p.name, price: effPrice(p), qty, img, color, size });
  saveCart(); updateCounts(); renderCartDrawer();
  if (!opts.silent) {
    toast('Added to cart', 'ok');
    openCartDrawer();
    tEvent('AddToCart', { content_id: p.id, content_name: p.name, value: effPrice(p) * qty, currency: 'PKR' });
  }
}
function updateCounts() {
  const cc = $('#cartCount'), wc = $('#wishCount');
  if (cc) cc.textContent = cartCount() || '';
  if (wc) wc.textContent = wishlist.length || '';
}

/* ---------- chrome: header / drawer / footer / floats ---------- */
function waLink(text) {
  const wa = (settings.whatsapp || '').replace(/\D/g, '');
  return wa ? `https://wa.me/${wa}?text=${encodeURIComponent(text || 'Hello Al Tejarat, I need help.')}` : '#';
}
function renderChrome() {
  const cats = DB.getCategories();
  const ann = settings.announcements || '';
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="announce">${esc(ann)}</div>
  <header class="site-head">
    <div class="head-main">
      <button class="hicon hamb" id="hambBtn" aria-label="Menu">☰</button>
      <a class="logo" href="/" data-nav="/">
        <img src="images/logo.png" alt="Al Tejarat" onerror="this.style.display='none'">
        <span>Al Tejarat<small>${esc(settings.tagline || 'Everything You Need, Every Day!')}</small></span>
      </a>
      <div class="head-search">
        <span class="s-ic">⌕</span>
        <input id="headSearch" type="search" placeholder="Search products…" autocomplete="off" aria-label="Search products">
        <div class="suggest" id="headSuggest"></div>
      </div>
      <div class="head-icons">
        <button class="hicon" data-nav="/wishlist" aria-label="Wishlist">♥<span class="cnt" id="wishCount"></span></button>
        <button class="hicon" id="cartBtn" aria-label="Cart">🛒<span class="cnt" id="cartCount"></span></button>
      </div>
    </div>
    <div class="m-search"><input id="mSearch" type="search" placeholder="Search products…" aria-label="Search products"></div>
    <nav class="cat-nav"><div class="wrap" id="catNav"></div></nav>
  </header>
  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="mDrawer" aria-label="Menu">
    <div class="drawer-head"><span>Menu</span><button class="x-btn" id="drawerX">✕</button></div>
    <nav id="mNav"></nav>
  </aside>
  <aside class="cart-drawer" id="cartDrawer" aria-label="Cart">
    <div class="cd-head"><span>Your Cart</span><button class="x-btn" id="cartX">✕</button></div>
    <div class="cd-items" id="cdItems"></div>
    <div class="cd-foot" id="cdFoot"></div>
  </aside>`);
  // category nav
  const catLinks = [`<a href="/shop" data-nav="/shop" data-catlink="">All Products</a>`]
    .concat(cats.map(c => `<a href="/shop?cat=${encodeURIComponent(c)}" data-nav="/shop?cat=${encodeURIComponent(c)}" data-catlink="${esc(c)}">${esc(c)}</a>`)).join('');
  $('#catNav').innerHTML = catLinks;
  $('#mNav').innerHTML = `<div class="d-cat">Shop</div>
    <a href="/" data-nav="/">Home</a>
    <a href="/shop" data-nav="/shop">All Products</a>
    ${cats.map(c => `<a href="/shop?cat=${encodeURIComponent(c)}" data-nav="/shop?cat=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}
    <div class="d-cat">Account</div>
    <a href="/wishlist" data-nav="/wishlist">Wishlist</a>
    <a href="/track" data-nav="/track">Track Order</a>
    <a href="/cart" data-nav="/cart">Cart</a>
    <div class="d-cat">Information</div>
    <a href="/about" data-nav="/about">About Us</a>
    <a href="/contact" data-nav="/contact">Contact Us</a>
    <a href="/shipping" data-nav="/shipping">Shipping Policy</a>
    <a href="/refund" data-nav="/refund">Refund Policy</a>
    <a href="/privacy" data-nav="/privacy">Privacy Policy</a>
    <a href="/terms" data-nav="/terms">Terms of Service</a>`;
  renderFooter();
  renderFloats();
  updateCounts();
}
function renderFooter() {
  const c = settings.content || {};
  const year = new Date().getFullYear();
  const soc = [['tiktok', 'TikTok', '♪'], ['facebook', 'Facebook', 'f'], ['instagram', 'Instagram', '◉']]
    .filter(([k]) => settings[k]).map(([k, label, ic]) =>
      `<a href="${esc(settings[k])}" target="_blank" rel="noopener" aria-label="${label}">${ic}</a>`).join('');
  const foot = document.createElement('footer');
  foot.innerHTML = `
  <div class="foot-grid wrap">
    <div>
      <div class="foot-brand">Al Tejarat <span>•</span></div>
      <p>${esc(c.footAbout || settings.tagline || 'Everything You Need, Every Day!')}</p>
      <div class="socials">${soc}</div>
    </div>
    <div><h4>Shop</h4>
      <a href="/" data-nav="/">Home</a><a href="/shop" data-nav="/shop">All Products</a>
      <a href="/wishlist" data-nav="/wishlist">Wishlist</a><a href="/track" data-nav="/track">Track Order</a>
    </div>
    <div><h4>Information</h4>
      <a href="/about" data-nav="/about">About Us</a><a href="/contact" data-nav="/contact">Contact Us</a>
      <a href="/shipping" data-nav="/shipping">Shipping Policy</a><a href="/refund" data-nav="/refund">Refund Policy</a>
      <a href="/privacy" data-nav="/privacy">Privacy Policy</a><a href="/terms" data-nav="/terms">Terms of Service</a>
    </div>
    <div><h4>Contact</h4>
      <p>${esc(c.footContactLines || 'Mon–Sat, 9am – 9pm (PKT)')}</p>
      ${settings.whatsapp ? `<p class="mt-1">WhatsApp: <a href="${waLink()}" target="_blank" rel="noopener" style="display:inline;color:var(--gold);font-weight:700">Chat with us</a></p>` : ''}
    </div>
  </div>
  <div class="foot-bottom">${esc(c.footCopy || `© ${year} Al Tejarat. All rights reserved.`)} &nbsp;•&nbsp; <span class="cod">Cash on Delivery</span> available all over Pakistan</div>`;
  document.body.appendChild(foot);
}
function renderFloats() {
  const wa = (settings.whatsapp || '').replace(/\D/g, '');
  if (wa) document.body.insertAdjacentHTML('beforeend', `
    <a class="wa-bubble" href="${waLink()}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">
      <svg viewBox="0 0 32 32"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.6 2 6.5L4 29l7.7-2c1.8 1 3.9 1.6 6.1 1.6h.1c6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.6 1.2 1.2-4.4-.3-.4c-1.1-1.7-1.6-3.6-1.6-5.6C5 9.9 10 5 16 5s11 4.9 11 11c0 6-4.9 10.8-11 10.8zm6-8.1c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.3-.8.1-.3-.2-1.4-.5-2.7-1.7-1-1-1.7-2.1-1.9-2.5-.2-.3 0-.5.2-.7l.6-.7c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6L13.9 9c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.2-.9.7-.3.5-1.2 1.2-1.2 2.9s1.2 3.4 1.4 3.6c.2.2 2.4 3.7 5.9 5.2 1.4.6 2 .7 2.7.6.4-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.7-.4z"/></svg>
    </a>`);
  document.body.insertAdjacentHTML('beforeend', `<button class="to-top" id="toTop" aria-label="Back to top">↑</button>`);
  window.addEventListener('scroll', () => {
    const b = $('#toTop');
    if (b) b.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });
  document.addEventListener('click', e => { if (e.target.closest('#toTop')) window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

/* ---------- drawers ---------- */
function openCartDrawer() { $('#cartDrawer').classList.add('show'); $('#scrim').classList.add('show'); }
function closeDrawers() {
  const d = $('#cartDrawer'), m = $('#mDrawer'), s = $('#scrim');
  if (d) d.classList.remove('show'); if (m) m.classList.remove('show'); if (s) s.classList.remove('show');
}
function renderCartDrawer() {
  const box = $('#cdItems'), foot = $('#cdFoot');
  if (!box) return;
  if (!cart.length) {
    box.innerHTML = `<div class="cart-empty"><div class="big">🛒</div><p>Your cart is empty.</p></div>`;
    foot.innerHTML = '';
    return;
  }
  box.innerHTML = cart.map(i => `
    <div class="ci">
      ${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}
      <div class="ci-mid"><b>${esc(i.name)}</b>
        <div class="v">${[i.color, i.size].filter(Boolean).map(esc).join(' • ')}</div>
        <div class="ci-price">${money(i.price * i.qty)}</div>
      </div>
      <div class="ci-right">
        <div class="qty-step"><button data-cdec="${esc(i.key)}">−</button><b>${i.qty}</b><button data-cinc="${esc(i.key)}">+</button></div>
        <button class="ci-rm" data-crm="${esc(i.key)}">Remove</button>
      </div>
    </div>`).join('');
  foot.innerHTML = `
    <div class="tot-row"><span>Subtotal</span><span>${money(cartSubtotal())}</span></div>
    <div class="del-note">Delivery charges are calculated at checkout based on your city.</div>
    <button class="btn btn-green btn-block" data-nav="/checkout">Proceed to Checkout</button>
    <button class="btn btn-ghost btn-block mt-1" data-nav="/cart">View Cart</button>`;
}

/* ---------- router ---------- */
function nav(path) { history.pushState(null, '', path); route(); }
function clearTimers() { timers.forEach(clearInterval); timers = []; }
function route() {
  clearTimers(); revCache = null; closeDrawers();
  window.scrollTo(0, 0);
  const path = location.pathname || '/';
  const q = new URLSearchParams(location.search || '');
  const app = $('#app');
  let m;
  if (path === '/') vHome(app);
  else if (path === '/shop') vShop(app, q);
  else if ((m = path.match(/^\/product\/(.+)$/))) vProduct(app, decodeURIComponent(m[1]));
  else if (path === '/cart') vCart(app);
  else if (path === '/checkout') vCheckout(app);
  else if (path === '/success') vSuccess(app, q);
  else if (path === '/track') vTrack(app);
  else if (path === '/wishlist') vWishlist(app);
  else if (['/about', '/contact', '/shipping', '/refund', '/privacy', '/terms'].includes(path)) vPage(app, path.slice(1));
  else v404(app);
  // active category link
  $$('#catNav [data-catlink]').forEach(a => a.classList.toggle('on', (q.get('cat') || '') === a.dataset.catlink && path === '/shop'));
  tPage(path);
}
function v404(app) {
  document.title = 'Page Not Found — Al Tejarat';
  app.innerHTML = `<div class="wrap"><div class="n404"><h1>404</h1><h2>Page not found</h2>
    <p class="text-mut">The page you are looking for does not exist.</p>
    <button class="btn btn-green mt-2" data-nav="/">Back to Home</button></div></div>`;
}

/* ---------- countdown ---------- */
function startCountdown(el, endsAt) {
  const tick = () => {
    let d = new Date(endsAt).getTime() - Date.now();
    if (d <= 0) { el.innerHTML = '<div class="cd-cell"><b>0</b><span>Ended</span></div>'; return; }
    const dd = Math.floor(d / 864e5), hh = Math.floor(d / 36e5) % 24, mm = Math.floor(d / 6e4) % 60, ss = Math.floor(d / 1e3) % 60;
    el.innerHTML = `<div class="cd-cell"><b>${dd}</b><span>Days</span></div><div class="cd-cell"><b>${String(hh).padStart(2, '0')}</b><span>Hours</span></div><div class="cd-cell"><b>${String(mm).padStart(2, '0')}</b><span>Mins</span></div><div class="cd-cell"><b>${String(ss).padStart(2, '0')}</b><span>Secs</span></div>`;
  };
  tick();
  timers.push(setInterval(tick, 1000));
}
function flashProducts() {
  const fs = settings.flashSale || {};
  if (!fs.active) return [];
  return DB.visibleProducts().filter(p => p.salePrice != null && +p.salePrice < +p.price);
}

/* ---------- home ---------- */
function vHome(app) {
  document.title = `${settings.storeName || 'Al Tejarat'} — ${settings.tagline || 'Everything You Need, Every Day!'}`;
  const c = settings.content || {};
  const hero = {
    badge: c.heroBadge || 'CASH ON DELIVERY',
    t1: c.heroTitle1 || 'Everything You Need,',
    t2: c.heroTitle2 || 'Every Day!',
    sub: c.heroSub || 'Quality products at honest prices, delivered to your doorstep anywhere in Pakistan.',
    btn: c.heroBtn || 'Shop Now', link: c.heroBtnLink || '/shop', img: c.heroImg || ''
  };
  const hasTrust = c.trust && c.trust.some(t => t && (t.ic || t.t || t.s));
  const trust = (hasTrust ? c.trust : [
    { ic: '🚚', t: 'Fast Delivery', s: '3–5 working days' },
    { ic: '💵', t: 'Cash on Delivery', s: 'Pay at your doorstep' },
    { ic: '✓', t: 'Quality Checked', s: 'Tested before dispatch' },
    { ic: '↩', t: 'Easy Support', s: 'WhatsApp help 9am–9pm' }
  ]).slice(0, 4);
  const cats = DB.getCategories().slice(0, 8);
  const all = DB.visibleProducts();
  const best = all.filter(p => p.featured).concat(all.filter(p => !p.featured)).slice(0, 8);
  const fs = settings.flashSale || {};
  const fprods = flashProducts();
  const showFlash = fs.active && fprods.length && new Date(fs.endsAt).getTime() > Date.now();
  const hasSteps = c.steps && c.steps.some(t => t && (t.ic || t.t || t.s));
  const steps = (hasSteps ? c.steps : [
    { ic: '🛍', t: 'Choose Products', s: 'Browse the shop and add items to your cart.' },
    { ic: '📝', t: 'Place Your Order', s: 'Enter your name, phone and address at checkout.' },
    { ic: '📦', t: 'Receive at Home', s: 'Pay cash when your parcel arrives in 3–5 days.' }
  ]).slice(0, 3);

  app.innerHTML = `
  <section class="hero"><div class="wrap">
    <div>
      <span class="hero-kick">${esc(hero.badge)}</span>
      <h1>${esc(hero.t1)} <span class="gold">${esc(hero.t2)}</span></h1>
      <p class="sub">${esc(hero.sub)}</p>
      <div class="hero-cta">
        <button class="btn btn-gold" data-nav="${esc(hero.link)}">${esc(hero.btn)}</button>
        <button class="btn btn-ghost" data-nav="/track" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Track Order</button>
      </div>
    </div>
    <div class="hero-img">${hero.img ? `<img src="${esc(hero.img)}" alt="Al Tejarat">` : ''}</div>
  </div></section>

  <div class="trust"><div class="wrap">
    ${trust.map(t => `<div class="trust-box"><span class="ic">${esc(t.ic || '✓')}</span><div><b>${esc(t.t || '')}</b><span>${esc(t.s || '')}</span></div></div>`).join('')}
  </div></div>

  <div class="wrap">
  ${showFlash ? `<section class="sec" style="padding-bottom:0"><div class="flash">
      <div class="flash-top"><h2>${esc(fs.title || 'Flash Sale')}</h2><span class="badge badge-sale">Limited Time</span></div>
      <div class="countdown" id="flashCd"></div>
      <div class="flash-row">${fprods.slice(0, 10).map(productCard).join('')}</div>
    </div></section>` : ''}

  <section class="sec"><div class="sec-head"><div><h2>${esc(c.catTitle || 'Shop by Category')}</h2></div><button class="link-btn" data-nav="/shop">View All →</button></div>
    <div class="cat-grid">${cats.map(n => {
      let im = DB.getCategoryImage(n);
      if (!im) { const fp = all.find(p => p.category === n); if (fp) im = DB.productImage(fp); }
      return `<div class="cat-tile" data-nav="/shop?cat=${encodeURIComponent(n)}" role="link" tabindex="0">
        ${im ? `<img src="${esc(im)}" alt="${esc(n)}" loading="lazy">` : ''}
        <div class="cap"><span>${esc(n)}</span><span>→</span></div></div>`;
    }).join('') || '<p class="text-mut">Categories coming soon.</p>'}</div>
  </section>

  <section class="sec alt" style="border-radius:22px"><div class="sec-head"><div><h2>${esc(c.bestTitle || 'Best Sellers')}</h2><p>Our customers' favourite picks</p></div><button class="link-btn" data-nav="/shop">View All →</button></div>
    <div class="p-grid">${best.map(productCard).join('') || '<p class="text-mut">Products coming soon.</p>'}</div>
  </section>

  <section class="sec"><div class="sec-head"><div><h2>${esc(c.howTitle || 'How To Order')}</h2><p>Three simple steps</p></div></div>
    <div class="steps3">${steps.map((s, i) => `<div class="step-card"><div class="n">${i + 1}</div><h3>${esc(s.t || '')}</h3><p>${esc(s.s || '')}</p></div>`).join('')}</div>
  </section>

  <section class="sec alt" style="border-radius:22px"><div class="sec-head"><div><h2>What Our Customers Say</h2></div></div>
    <div class="testi-grid">
      <div class="testi">${stars(5)}<p>"Ordered a handbag for my wife — original quality and delivered in 3 days. Cash on delivery made it easy."</p><b>Ahmed R.</b><span>Lahore</span></div>
      <div class="testi">${stars(5)}<p>"Good prices and honest pictures. The product looked exactly like the photos on the website."</p><b>Fatima K.</b><span>Karachi</span></div>
      <div class="testi">${stars(4)}<p>"Customer support on WhatsApp was quick. My order arrived well packed and on time."</p><b>Usman T.</b><span>Islamabad</span></div>
    </div>
  </section>

  <section class="sec"><div class="news">
    <h2>Stay Updated</h2><p>${esc(c.followSub || 'Get new arrivals and special offers first.')}</p>
    <form id="newsForm"><input type="email" id="newsEmail" placeholder="Your email address" required aria-label="Email"><button class="btn btn-gold" type="submit">Subscribe</button></form>
    <div id="newsOk"></div>
  </div></section>
  </div>`;

  if (showFlash) startCountdown($('#flashCd'), fs.endsAt);
  $('#newsForm').addEventListener('submit', e => {
    e.preventDefault();
    const em = $('#newsEmail').value.trim();
    if (!em) return;
    $('#newsOk').innerHTML = '<div class="ok-msg mt-2">Thank you for subscribing!</div>';
    $('#newsForm').reset();
  });
  fillRatings(app);
}

/* ---------- shop ---------- */
async function vShop(app, q) {
  document.title = 'Shop — Al Tejarat';
  const cats = DB.getCategories();
  const term = q.get('q') || '', cat = q.get('cat') || '';
  const sort = q.get('sort') || 'featured';
  const rmap = await ratingsMap();
  let list = DB.visibleProducts();
  if (term) { const t = term.toLowerCase(); list = list.filter(p => ((p.name || '') + ' ' + (p.category || '') + ' ' + (p.description || '')).toLowerCase().includes(t)); }
  if (cat) list = list.filter(p => p.category === cat);
  const min = parseFloat(q.get('min')), max = parseFloat(q.get('max'));
  list = list.filter(p => { const e = effPrice(p); return (isNaN(min) || e >= min) && (isNaN(max) || e <= max); });
  if (q.get('sale') === '1') list = list.filter(p => discPct(p) > 0);
  const mr = parseFloat(q.get('rating'));
  if (!isNaN(mr) && mr > 0) list = list.filter(p => DB.avgRating(rmap[p.id] || []) >= mr);
  const byR = p => DB.avgRating(rmap[p.id] || []);
  if (sort === 'price-asc') list.sort((a, b) => effPrice(a) - effPrice(b));
  else if (sort === 'price-desc') list.sort((a, b) => effPrice(b) - effPrice(a));
  else if (sort === 'newest') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else if (sort === 'rating') list.sort((a, b) => byR(b) - byR(a));

  const setQ = (k, v) => { const nq = new URLSearchParams(q.toString()); if (v) nq.set(k, v); else nq.delete(k); return '/shop' + (nq.toString() ? '?' + nq.toString() : ''); };
  app.innerHTML = `<div class="wrap">
    <div class="crumbs"><a href="/" data-nav="/">Home</a> / <span>Shop</span>${term ? ` / <span>Search: “${esc(term)}”</span>` : ''}</div>
    <div class="shop-layout">
      <aside class="filters collapsed" id="filterBox">
        <h3>Filters</h3>
        <div class="f-group"><h4>Category</h4>
          <a class="f-cat ${!cat ? 'on' : ''}" href="${setQ('cat', '')}" data-nav="${setQ('cat', '')}">All Products</a>
          ${cats.map(cn => `<a class="f-cat ${cat === cn ? 'on' : ''}" href="${setQ('cat', cn)}" data-nav="${setQ('cat', cn)}">${esc(cn)}</a>`).join('')}
        </div>
        <div class="f-group"><h4>Price Range (Rs)</h4>
          <div class="price-range"><input type="number" id="fMin" min="0" placeholder="Min" value="${esc(q.get('min') || '')}"><span>–</span><input type="number" id="fMax" min="0" placeholder="Max" value="${esc(q.get('max') || '')}"></div>
          <button class="btn btn-ghost btn-sm mt-1" id="fPriceGo">Apply</button>
        </div>
        <div class="f-group"><h4>Rating</h4>
          ${[0, 4, 3].map(r => `<label class="f-check"><input type="radio" name="frate" value="${r}" ${String(q.get('rating') || '0') === String(r) ? 'checked' : ''}> ${r === 0 ? 'Any rating' : r + '★ & up'}</label>`).join('')}
        </div>
        <div class="f-group"><h4>Offers</h4>
          <label class="f-check"><input type="checkbox" id="fSale" ${q.get('sale') === '1' ? 'checked' : ''}> On sale only</label>
        </div>
        ${(term || cat || q.get('min') || q.get('max') || q.get('sale') || q.get('rating')) ? `<button class="link-btn" data-nav="/shop">Clear all filters</button>` : ''}
      </aside>
      <div>
        <div class="shop-top">
          <div style="display:flex;gap:10px;align-items:center">
            <button class="btn btn-ghost btn-sm filter-toggle" id="filterToggle">Filters</button>
            <span class="count">${list.length} product${list.length === 1 ? '' : 's'} found</span>
          </div>
          <select class="sort-sel" id="sortSel" aria-label="Sort products">
            ${[['featured', 'Sort: Featured'], ['price-asc', 'Price: Low to High'], ['price-desc', 'Price: High to Low'], ['newest', 'Newest First'], ['rating', 'Top Rated']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        ${list.length ? `<div class="p-grid">${list.map(productCard).join('')}</div>`
    : `<div class="empty"><div class="big">🔍</div><h2>No products found</h2><p>Try a different search or clear the filters.</p><button class="btn btn-green mt-2" data-nav="/shop">View All Products</button></div>`}
      </div>
    </div></div>`;

  $('#filterToggle').addEventListener('click', () => $('#filterBox').classList.toggle('collapsed'));
  $('#sortSel').addEventListener('change', e => nav(setQ('sort', e.target.value)));
  $('#fPriceGo').addEventListener('click', () => {
    const nq = new URLSearchParams(q.toString());
    const mn = $('#fMin').value, mx = $('#fMax').value;
    if (mn) nq.set('min', mn); else nq.delete('min');
    if (mx) nq.set('max', mx); else nq.delete('max');
    nav('/shop' + (nq.toString() ? '?' + nq.toString() : ''));
  });
  $$('input[name="frate"]').forEach(r => r.addEventListener('change', e => nav(setQ('rating', e.target.value === '0' ? '' : e.target.value))));
  $('#fSale').addEventListener('change', e => nav(setQ('sale', e.target.checked ? '1' : '')));
  fillRatings(app);
}

/* ---------- product page ---------- */
async function vProduct(app, slug) {
  const p = DB.getProductBySlug(slug);
  if (!p || p.status === 'draft') { v404(app); return; }
  document.title = `${p.name} — Al Tejarat`;
  tEvent('ViewContent', { content_id: p.id, content_name: p.name, value: effPrice(p), currency: 'PKR' });

  const colors = DB.normColors(p);           // [{name,img}]
  const sizes = p.sizes || [];
  const gallery = (DB.productImages(p) || []).slice();
  const stock = p.stock == null ? 99 : +p.stock;
  const out = stock <= 0;

  // selection state — the VIEWED gallery image is what goes into the cart
  let selColor = colors[0] || null;
  let selSize = sizes[0] || '';
  let qty = 1;
  let viewed = gallery[0] || '';
  const currentImg = () => viewed || (selColor && DB.colorImg(selColor)) || DB.productImage(p) || '';

  const dp = discPct(p), ep = effPrice(p);
  const wished = wishlist.includes(p.id);

  app.innerHTML = `<div class="wrap">
    <div class="crumbs"><a href="/" data-nav="/">Home</a> / <a href="/shop" data-nav="/shop">Shop</a> / <a href="/shop?cat=${encodeURIComponent(p.category || '')}" data-nav="/shop?cat=${encodeURIComponent(p.category || '')}">${esc(p.category || '')}</a> / <span>${esc(p.name)}</span></div>
    <div class="pd">
      <div>
        <div class="gal-main"><img id="galMain" src="${esc(viewed)}" alt="${esc(p.name)}"></div>
        <div class="gal-thumbs" id="galThumbs">
          ${gallery.map((g, i) => `<button class="${i === 0 ? 'on' : ''}" data-gi="${i}" aria-label="View image ${i + 1}"><img src="${esc(g)}" alt="" loading="lazy"></button>`).join('')}
        </div>
      </div>
      <div class="pd-info">
        <h1>${esc(p.name)}</h1>
        <div class="pd-meta"><span class="rate-line" data-rating="${esc(p.id)}"></span><span class="text-mut">•</span><span class="text-mut">SKU: ${esc(p.id)}</span></div>
        <div class="pd-price"><span class="now">${money(ep)}</span>${dp ? `<span class="old">${money(p.price)}</span><span class="badge badge-sale">-${dp}%</span>` : ''}</div>
        ${out ? '<div class="stock-note stock-out">Out of stock</div>'
    : stock <= 5 ? `<div class="stock-note stock-low">Only ${stock} left in stock — order soon!</div>`
      : '<div class="stock-note stock-ok">In stock, ready to ship</div>'}
        ${colors.length ? `<div class="opt-label">Color: <span id="colorName">${esc(DB.colorName(selColor))}</span></div>
        <div class="swatches" id="swatches">${colors.map((c, i) => {
          const nm = DB.colorName(c), im = DB.colorImg(c);
          return `<button class="swatch ${i === 0 ? 'on' : ''}" data-ci="${i}" title="${esc(nm)}" aria-label="${esc(nm)}">${im ? `<img src="${esc(im)}" alt="">` : `<span class="dot" style="background:${esc(DB.detectColors(nm)[0] || '#999')}"></span>`}</button>`;
        }).join('')}</div>` : ''}
        ${sizes.length ? `<div class="opt-label">Size: <span id="sizeName">${esc(selSize)}</span></div>
        <div class="sizes" id="sizes">${sizes.map((s, i) => `<button class="size-pill ${i === 0 ? 'on' : ''}" data-si="${i}">${esc(s)}</button>`).join('')}</div>` : ''}
        <div class="opt-label">Quantity</div>
        <div class="qty-step"><button id="qDec">−</button><b id="qVal">1</b><button id="qInc">+</button></div>
        <div class="pd-actions">
          <button class="btn btn-ghost" id="pdAdd" ${out ? 'disabled' : ''}>Add to Cart</button>
          <button class="btn btn-green" id="pdBuy" ${out ? 'disabled' : ''}>Buy Now</button>
        </div>
        <div class="pd-tools">
          <button class="tool-btn ${wished ? 'on' : ''}" id="pdWish">${wished ? '♥' : '♡'} Wishlist</button>
          <button class="tool-btn" id="pdShare">⧉ Share</button>
        </div>
        <div class="del-est"><span class="ic">🚚</span><div><b>Estimated delivery:</b> ${esc(DB.estimateDelivery())}<br><span class="text-mut">Cash on Delivery available</span></div></div>
      </div>
    </div>
    <div class="tabs">
      <div class="tab-btns">
        <button class="on" data-tab="tDesc">Description</button>
        <button data-tab="tRev">Reviews <span id="revCountTab"></span></button>
        <button data-tab="tShip">Shipping &amp; Returns</button>
      </div>
      <div class="tab-pane on" id="tDesc"><div class="prose">${p.description ? esc(p.description).replace(/\n/g, '<br>') : '<p class="text-mut">No description available.</p>'}</div></div>
      <div class="tab-pane" id="tRev"><div id="revBox"><div class="app-loading"><div class="spinner"></div></div></div></div>
      <div class="tab-pane" id="tShip"><div class="prose">
        <h2>Shipping</h2><p>Orders are delivered within <b>3–5 working days</b> anywhere in Pakistan (Sunday off). Delivery charges depend on your city and are shown at checkout.</p>
        <h2>Returns</h2><p>Wrong or damaged items can be reported within <b>24 hours</b> of delivery with an unboxing video. See our <a class="link-btn" data-nav="/refund" style="display:inline">Refund Policy</a> for details.</p>
      </div></div>
    </div>
    <section class="sec"><div class="sec-head"><div><h2>You May Also Like</h2></div></div>
      <div class="rel-row" id="relRow"></div>
    </section>
  </div>`;

  // gallery: track the VIEWED image
  const setMain = (src, thumbIdx) => {
    viewed = src;
    $('#galMain').src = src;
    $$('#galThumbs button').forEach((b, i) => b.classList.toggle('on', i === thumbIdx));
  };
  $('#galThumbs').addEventListener('click', e => {
    const b = e.target.closest('[data-gi]'); if (!b) return;
    setMain(gallery[+b.dataset.gi], +b.dataset.gi);
  });
  // color select → gallery switches to that color's image
  const sw = $('#swatches');
  if (sw) sw.addEventListener('click', e => {
    const b = e.target.closest('[data-ci]'); if (!b) return;
    selColor = colors[+b.dataset.ci];
    $('#colorName').textContent = DB.colorName(selColor);
    $$('#swatches .swatch').forEach((x, i) => x.classList.toggle('on', i === +b.dataset.ci));
    const cim = DB.colorImg(selColor);
    if (cim) { viewed = cim; $('#galMain').src = cim; $$('#galThumbs button').forEach(x => x.classList.remove('on')); }
  });
  const sz = $('#sizes');
  if (sz) sz.addEventListener('click', e => {
    const b = e.target.closest('[data-si]'); if (!b) return;
    selSize = sizes[+b.dataset.si];
    $('#sizeName').textContent = selSize;
    $$('#sizes .size-pill').forEach((x, i) => x.classList.toggle('on', i === +b.dataset.si));
  });
  $('#qDec').addEventListener('click', () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; });
  $('#qInc').addEventListener('click', () => { qty = Math.min(stock || 99, qty + 1); $('#qVal').textContent = qty; });

  const cartOpts = () => ({ qty, color: selColor ? DB.colorName(selColor) : '', size: selSize, img: currentImg() });
  $('#pdAdd').addEventListener('click', () => addToCart(p, cartOpts()));
  $('#pdBuy').addEventListener('click', () => { addToCart(p, Object.assign(cartOpts(), { silent: true })); nav('/checkout'); });
  $('#pdWish').addEventListener('click', () => {
    toggleWish(p.id);
    const on = wishlist.includes(p.id);
    $('#pdWish').classList.toggle('on', on);
    $('#pdWish').innerHTML = (on ? '♥' : '♡') + ' Wishlist';
  });
  $('#pdShare').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Product link copied', 'ok'); }
    catch (e) { toast('Could not copy link'); }
  });

  // tabs
  $$('.tab-btns button').forEach(b => b.addEventListener('click', () => {
    $$('.tab-btns button').forEach(x => x.classList.remove('on'));
    $$('.tab-pane').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); $('#' + b.dataset.tab).classList.add('on');
  }));

  // related
  const rel = DB.visibleProducts().filter(x => x.id !== p.id && x.category === p.category).slice(0, 8);
  $('#relRow').innerHTML = rel.length ? rel.map(productCard).join('') : '<p class="text-mut">No related products.</p>';

  fillRatings(app).then(() => loadReviews(p));
}

/* ---------- reviews ---------- */
async function loadReviews(p) {
  const box = $('#revBox');
  if (!box) return;
  let revs = [];
  try { revs = await DB.getReviews(p.id) || []; } catch (e) {}
  const avg = DB.avgRating(revs);
  const rc = $('#revCountTab'); if (rc) rc.textContent = `(${revs.length})`;
  box.innerHTML = `
    <div class="rev-summary"><span class="big">${avg || '–'}</span>
      <div>${stars(avg)}<div class="text-mut">${revs.length} review${revs.length === 1 ? '' : 's'}</div></div>
    </div>
    <div id="revList">${revs.length ? revs.map(r => `
      <div class="rev"><div class="rev-head">${stars(r.rating)}<b>${esc(r.name || 'Customer')}</b>
        <span class="rev-date">${r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span></div>
        <p>${esc(r.text || '')}</p>${r.photo ? `<img src="${esc(r.photo)}" alt="Review photo" loading="lazy">` : ''}
      </div>`).join('') : '<p class="text-mut">No reviews yet — be the first to review this product!</p>'}</div>
    <div class="rev-form"><h3>Write a Review</h3>
      <div class="frow">
        <div><label class="fl">Your Name</label><input class="fi" id="rvName" maxlength="60" placeholder="e.g. Ahmed"></div>
        <div><label class="fl">Photo (optional)</label><input class="fi" type="file" id="rvPhoto" accept="image/*"></div>
      </div>
      <label class="fl">Your Rating</label>
      <div class="star-input" id="rvStars">${[1, 2, 3, 4, 5].map(i => `<button data-rs="${i}" aria-label="${i} stars">★</button>`).join('')}</div>
      <label class="fl">Review</label><textarea class="fi" id="rvText" rows="3" maxlength="1000" placeholder="What did you like about this product?"></textarea>
      <div class="form-err" id="rvErr"></div>
      <button class="btn btn-green mt-2" id="rvSubmit">Submit Review</button>
    </div>`;

  let rating = 5;
  const paint = () => $$('#rvStars button').forEach(b => b.classList.toggle('lit', +b.dataset.rs <= rating));
  paint();
  $('#rvStars').addEventListener('click', e => {
    const b = e.target.closest('[data-rs]'); if (!b) return;
    rating = +b.dataset.rs; paint();
  });
  $('#rvSubmit').addEventListener('click', async () => {
    const name = $('#rvName').value.trim(), text = $('#rvText').value.trim(), err = $('#rvErr');
    if (!name || !text) { err.textContent = 'Please enter your name and review.'; err.classList.add('show'); return; }
    err.classList.remove('show');
    $('#rvSubmit').disabled = true; $('#rvSubmit').textContent = 'Submitting…';
    let photo = '';
    try {
      const f = $('#rvPhoto').files[0];
      if (f) photo = await DB.uploadImage(f, 'reviews');
    } catch (e) {}
    try {
      await DB.addReview({ productId: p.id, name, rating, text, photo });
      toast('Thank you! Your review was submitted.', 'ok');
      revCache = null;
      loadReviews(p);
    } catch (e) { err.textContent = 'Could not submit review. Please try again.'; err.classList.add('show'); }
    $('#rvSubmit').disabled = false; $('#rvSubmit').textContent = 'Submit Review';
  });
}

/* ---------- cart page ---------- */
function vCart(app) {
  document.title = 'Your Cart — Al Tejarat';
  if (!cart.length) {
    app.innerHTML = `<div class="wrap"><div class="cart-empty"><div class="big">🛒</div><h2>Your cart is empty</h2>
      <p class="mt-1">Browse our products and add something you like.</p>
      <button class="btn btn-green mt-2" data-nav="/shop">Continue Shopping</button></div></div>`;
    return;
  }
  app.innerHTML = `<div class="wrap">
    <div class="crumbs"><a href="/" data-nav="/">Home</a> / <span>Cart</span></div>
    <h1 style="font-size:26px;font-weight:800;margin-bottom:18px">Your Cart (${cartCount()} items)</h1>
    <div class="co-layout">
      <div class="co-card">
        ${cart.map(i => `
        <div class="ci">
          ${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}
          <div class="ci-mid"><b>${esc(i.name)}</b>
            <div class="v">${[i.color, i.size].filter(Boolean).map(esc).join(' • ')}</div>
            <div class="ci-price">${money(i.price)} each</div>
          </div>
          <div class="ci-right">
            <div class="qty-step"><button data-cdec="${esc(i.key)}">−</button><b>${i.qty}</b><button data-cinc="${esc(i.key)}">+</button></div>
            <button class="ci-rm" data-crm="${esc(i.key)}">Remove</button>
          </div>
        </div>`).join('')}
      </div>
      <div class="co-card">
        <h2>Order Summary</h2>
        <div class="tot-row"><span>Subtotal</span><span>${money(cartSubtotal())}</span></div>
        <div class="del-note">Delivery charges are calculated at checkout based on your city.</div>
        <button class="btn btn-green btn-block" data-nav="/checkout">Proceed to Checkout</button>
        <button class="link-btn mt-2" data-nav="/shop">← Continue shopping</button>
      </div>
    </div></div>`;
}

/* ---------- checkout ---------- */
function validateCoupon(code, subtotal) {
  const list = settings.coupons || [];
  const c = list.find(x => x.active !== false && String(x.code || '').trim().toLowerCase() === String(code || '').trim().toLowerCase());
  if (!c) return { error: 'Invalid coupon code.' };
  if (subtotal < (+c.minSubtotal || 0)) return { error: `This coupon needs a minimum order of ${money(c.minSubtotal)}.` };
  let d = c.type === 'percent' ? Math.round(subtotal * (+c.value || 0) / 100) : (+c.value || 0);
  d = Math.max(0, Math.min(d, subtotal));
  return { coupon: c, discount: d };
}
function deliveryFeesTable() {
  const dr = DB.deliveryRules();
  const cap = c => c.charAt(0).toUpperCase() + c.slice(1);
  const rows = Object.keys(dr.rules).sort().map(cn =>
    `<tr><td>${esc(cap(cn))}</td><td>${money(dr.rules[cn])}</td></tr>`).join('');
  return `<table class="fee-table"><tr><th>City</th><th>Delivery Fee</th></tr>${rows}<tr><td>All other cities</td><td>${money(dr.def)}</td></tr></table>`;
}
function vCheckout(app) {
  document.title = 'Checkout — Al Tejarat';
  if (!cart.length) { nav('/cart'); return; }
  tEvent('InitiateCheckout', { value: cartSubtotal(), currency: 'PKR', num_items: cartCount() });
  const subtotal = cartSubtotal();

  app.innerHTML = `<div class="wrap">
    <div class="crumbs"><a href="/" data-nav="/">Home</a> / <a href="/cart" data-nav="/cart">Cart</a> / <span>Checkout</span></div>
    <h1 style="font-size:26px;font-weight:800;margin-bottom:18px">Checkout</h1>
    <div class="co-layout">
      <div>
        <div class="co-card">
          <h2><span class="n">1</span> Delivery Information</h2>
          <div class="frow">
            <div><label class="fl">Full Name *</label><input class="fi" id="coName" maxlength="80" placeholder="e.g. Muhammad Ahmed"></div>
            <div><label class="fl">Phone Number *</label><input class="fi" id="coPhone" inputmode="tel" maxlength="15" placeholder="e.g. 0300 1234567"></div>
          </div>
          <div class="field"><label class="fl">Complete Address *</label><textarea class="fi" id="coAddr" rows="2" maxlength="300" placeholder="House, street, area…"></textarea></div>
          <div class="frow" style="margin-top:14px">
            <div><label class="fl">City *</label>
              <div class="city-wrap"><input class="fi" id="coCity" autocomplete="off" placeholder="Start typing your city…"><div class="city-drop" id="cityDrop" hidden></div></div>
            </div>
            <div><label class="fl">Order Notes <small>(optional)</small></label><input class="fi" id="coNotes" maxlength="200" placeholder="Any special instructions…"></div>
          </div>
          <div class="form-err" id="coErr"></div>
        </div>
        <div class="co-card mt-2">
          <h2><span class="n">2</span> Discount Coupon</h2>
          <div class="coupon-row"><input class="fi" id="coCoupon" placeholder="Enter coupon code" style="text-transform:uppercase"><button class="btn btn-ghost" id="couponApply">Apply</button></div>
          <div id="couponMsg"></div>
        </div>
        <div class="co-card mt-2">
          <h2><span class="n">3</span> Payment Method</h2>
          <label class="f-check"><input type="radio" checked> <b>Cash on Delivery</b>&nbsp;<span class="text-mut">— pay when your parcel arrives</span></label>
        </div>
      </div>
      <div class="co-card" style="position:sticky;top:150px">
        <h2>Order Summary</h2>
        <div id="coLines">${cart.map(i => `
          <div class="co-line">${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}
            <div class="t"><b>${esc(i.name)}</b><span>${[i.color, i.size].filter(Boolean).map(esc).join(' • ')}${(i.color || i.size) ? ' • ' : ''}Qty ${i.qty}</span></div>
            <div class="p">${money(i.price * i.qty)}</div>
          </div>`).join('')}</div>
        <div class="divider"></div>
        <div class="tot-row"><span>Subtotal</span><span id="tSub">${money(subtotal)}</span></div>
        <div class="tot-row" id="discRow" hidden><span>Discount <b id="discCode"></b></span><span id="tDisc" class="text-green"></span></div>
        <div class="tot-row"><span>Delivery <small class="text-mut" id="tCity"></small></span><span id="tDel">${money(DB.deliveryFeeFor(''))}</span></div>
        <div class="tot-row grand"><span>Total</span><span id="tGrand"></span></div>
        <button class="btn btn-green btn-block mt-2" id="placeBtn">Place Order</button>
        <div class="form-err" id="placeErr" style="text-align:center"></div>
        <p class="text-mut text-center mt-1" style="font-size:12.5px">By placing this order you agree to our <a class="link-btn" data-nav="/terms" style="display:inline;font-size:12.5px">Terms of Service</a>.</p>
      </div>
    </div></div>`;

  const drawTotals = () => {
    const city = $('#coCity').value;
    const fee = DB.deliveryFeeFor(city);
    const d = couponState ? couponState.discount : 0;
    $('#tSub').textContent = money(subtotal);
    $('#tDel').textContent = money(fee);
    $('#tCity').textContent = city ? `(${city})` : '';
    $('#discRow').hidden = !couponState;
    if (couponState) { $('#discCode').textContent = `(${couponState.coupon.code})`; $('#tDisc').textContent = '−' + money(d); }
    $('#tGrand').textContent = money(subtotal - d + fee);
  };
  drawTotals();

  // city autocomplete
  const cityInput = $('#coCity'), cityDrop = $('#cityDrop');
  const hideDrop = () => { cityDrop.hidden = true; };
  cityInput.addEventListener('input', () => {
    const val = cityInput.value.trim().toLowerCase();
    drawTotals();
    if (!val) { hideDrop(); return; }
    const hits = DB.CITIES.filter(c => c.toLowerCase().includes(val)).slice(0, 8);
    if (!hits.length) { hideDrop(); return; }
    cityDrop.innerHTML = hits.map(h => `<button type="button" data-city="${esc(h)}">${esc(h)}</button>`).join('');
    cityDrop.hidden = false;
  });
  cityDrop.addEventListener('click', e => {
    const b = e.target.closest('[data-city]'); if (!b) return;
    cityInput.value = b.dataset.city; hideDrop(); drawTotals();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.city-wrap')) hideDrop(); });

  // coupon
  const applyCoupon = () => {
    const code = $('#coCoupon').value.trim();
    const msg = $('#couponMsg');
    if (!code) { couponState = null; msg.innerHTML = ''; drawTotals(); return; }
    const r = validateCoupon(code, subtotal);
    if (r.error) { couponState = null; msg.innerHTML = `<div class="coupon-bad">${esc(r.error)}</div>`; }
    else { couponState = r; msg.innerHTML = `<div class="coupon-ok">Coupon applied — you save ${money(r.discount)}!</div>`; }
    drawTotals();
  };
  $('#couponApply').addEventListener('click', applyCoupon);

  $('#placeBtn').addEventListener('click', placeOrder);

  async function placeOrder() {
    const err = $('#placeErr'), coErr = $('#coErr');
    err.classList.remove('show'); coErr.classList.remove('show');
    const name = $('#coName').value.trim(), phone = $('#coPhone').value.trim(),
      address = $('#coAddr').value.trim(), city = $('#coCity').value.trim(),
      notes = $('#coNotes').value.trim();
    if (!name || !phone || !address || !city) { coErr.textContent = 'Please fill in your name, phone, address and city.'; coErr.classList.add('show'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (digits(phone).length < 10) { coErr.textContent = 'Please enter a valid phone number.'; coErr.classList.add('show'); return; }
    const btn = $('#placeBtn');
    btn.disabled = true; btn.textContent = 'Placing your order…';
    try {
      const id = await DB.nextOrderId();
      const d = couponState ? couponState.discount : 0;
      const delivery = DB.deliveryFeeFor(city);
      const order = {
        id, date: new Date().toISOString(),
        customer: { name, phone, address, city, notes },
        items: cart.map(i => ({ pid: i.pid, name: i.name, price: i.price, qty: i.qty, img: i.img || '', color: i.color || '', size: i.size || '' })),
        subtotal, discount: d, coupon: couponState ? couponState.coupon.code : '',
        delivery, total: subtotal - d + delivery, status: 'Pending'
      };
      // Netlify Forms backup (silent fail OK)
      try {
        const fd = new FormData();
        fd.append('form-name', 'order');
        fd.append('order_id', order.id); fd.append('name', name); fd.append('phone', phone);
        fd.append('address', address); fd.append('city', city); fd.append('notes', notes);
        fd.append('items', order.items.map(i => `${i.name} x${i.qty}`).join('; '));
        fd.append('subtotal', subtotal); fd.append('discount', d); fd.append('coupon', order.coupon);
        fd.append('delivery', delivery); fd.append('total', order.total);
        fetch('/', { method: 'POST', body: fd }).catch(() => {});
      } catch (e) {}
      await DB.addOrder(order);
      // decrement stock
      for (const it of order.items) {
        try {
          const pr = DB.getProduct(it.pid);
          if (pr && pr.stock != null) { pr.stock = Math.max(0, (+pr.stock || 0) - it.qty); await DB.saveProduct(pr); }
        } catch (e) {}
      }
      cart = []; saveCart(); updateCounts(); renderCartDrawer();
      const doneCoupon = couponState; couponState = null;
      tEvent('CompletePayment', { value: order.total, currency: 'PKR', order_id: id });
      nav('/success?id=' + encodeURIComponent(id));
    } catch (e) {
      err.textContent = 'Could not place your order. Please check your internet and try again.';
      err.classList.add('show');
      btn.disabled = false; btn.textContent = 'Place Order';
    }
  }
}

/* ---------- success ---------- */
function vSuccess(app, q) {
  const id = q.get('id') || '';
  document.title = 'Order Placed — Al Tejarat';
  app.innerHTML = `<div class="wrap"><div class="success-card">
    <div class="check-big">✓</div>
    <h1 style="font-size:26px;font-weight:800">Thank You!</h1>
    <p class="text-mut mt-1">Your order has been placed successfully.<br>We will call you soon to confirm.</p>
    ${id ? `<div class="mt-2 text-mut" style="font-size:13px;letter-spacing:1px">ORDER ID</div><div class="order-id-big">${esc(id)}</div>` : ''}
    <p><b>Estimated delivery:</b> ${esc(DB.estimateDelivery())}</p>
    <div class="mt-3" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-green" data-nav="/track">Track Order</button>
      <button class="btn btn-ghost" data-nav="/shop">Continue Shopping</button>
    </div>
  </div></div>`;
}

/* ---------- track ---------- */
function vTrack(app) {
  document.title = 'Track Your Order — Al Tejarat';
  app.innerHTML = `<div class="wrap"><div style="max-width:560px;margin:0 auto;padding-bottom:60px">
    <div class="crumbs"><a href="/" data-nav="/">Home</a> / <span>Track Order</span></div>
    <h1 style="font-size:26px;font-weight:800;margin-bottom:8px">Track Your Order</h1>
    <p class="text-mut" style="margin-bottom:20px">Enter your Order ID and phone number to see the status.</p>
    <div class="co-card">
      <div class="field"><label class="fl">Order ID *</label><input class="fi" id="trId" placeholder="e.g. AT-0001" style="text-transform:uppercase"></div>
      <div class="field mt-1"><label class="fl">Phone Number *</label><input class="fi" id="trPhone" inputmode="tel" placeholder="The number used for the order"></div>
      <div class="form-err" id="trErr"></div>
      <button class="btn btn-green btn-block mt-2" id="trGo">Track Order</button>
    </div>
    <div id="trOut" class="mt-2"></div>
  </div></div>`;
  const go = () => {
    const id = $('#trId').value.trim().toLowerCase(), ph = digits($('#trPhone').value);
    const err = $('#trErr'), out = $('#trOut');
    err.classList.remove('show'); out.innerHTML = '';
    if (!id || !ph) { err.textContent = 'Please enter both Order ID and phone number.'; err.classList.add('show'); return; }
    const o = DB.getOrders().find(x =>
      String(x.id || '').toLowerCase() === id &&
      (digits(x.customer && x.customer.phone) === ph ||
        digits(x.customer && x.customer.phone).endsWith(ph) || ph.endsWith(digits(x.customer && x.customer.phone))));
    if (!o) { err.textContent = 'Order not found. Please check your Order ID and phone number.'; err.classList.add('show'); return; }
    const steps = ['Pending', 'Confirmed', 'Shipped', 'Delivered'];
    const cancelled = o.status === 'Cancelled';
    const idx = steps.indexOf(o.status);
    out.innerHTML = `<div class="co-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div><b style="font-size:18px">${esc(o.id)}</b><div class="text-mut" style="font-size:13px">${o.date ? new Date(o.date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</div></div>
        <span class="pill-status st-${esc(o.status || 'Pending')}">${esc(o.status || 'Pending')}</span>
      </div>
      ${cancelled ? '<p class="text-red mt-2"><b>This order was cancelled.</b> Please contact us on WhatsApp for help.</p>' : `
      <div class="timeline">
        ${steps.map((s, i) => `<div class="tl-step ${i <= idx ? 'done' : ''}"><div class="tl-dot">${i <= idx ? '✓' : i + 1}</div>
          <div><b>${s}</b><span>${['We received your order', 'Your order is confirmed', 'Your parcel is on the way', 'Delivered — enjoy!'][i]}</span></div></div>`).join('')}
      </div>`}
      <div class="divider"></div>
      ${(o.items || []).map(i => `<div class="co-line">${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}
        <div class="t"><b>${esc(i.name)}</b><span>Qty ${i.qty}</span></div><div class="p">${money(i.price * i.qty)}</div></div>`).join('')}
      <div class="tot-row grand mt-1"><span>Total</span><span>${money(o.total)}</span></div>
    </div>`;
  };
  $('#trGo').addEventListener('click', go);
}

/* ---------- wishlist page ---------- */
function vWishlist(app) {
  document.title = 'Wishlist — Al Tejarat';
  const items = wishlist.map(id => DB.getProduct(id)).filter(Boolean);
  app.innerHTML = `<div class="wrap" style="padding-bottom:60px">
    <div class="crumbs"><a href="/" data-nav="/">Home</a> / <span>Wishlist</span></div>
    <h1 style="font-size:26px;font-weight:800;margin-bottom:18px">Your Wishlist (${items.length})</h1>
    ${items.length ? `<div class="p-grid">${items.map(productCard).join('')}</div>`
      : `<div class="wish-empty"><div class="big" style="font-size:54px">♡</div><h2 style="color:var(--ink)">Nothing saved yet</h2>
        <p class="mt-1">Tap the heart on any product to save it here.</p>
        <button class="btn btn-green mt-2" data-nav="/shop">Browse Products</button></div>`}
  </div>`;
  fillRatings(app);
}

/* ---------- info pages (English defaults) ---------- */
const PAGES = {
  about: { title: 'About Us', updated: 'Last updated: October 2026', body: `
    <h2>Welcome to Al Tejarat</h2>
    <p><strong>Al Tejarat — "Everything You Need, Every Day!"</strong> is your trusted online store in Pakistan. We bring quality products to your doorstep at honest prices.</p>
    <h2>Why shop with us?</h2>
    <ul><li>Quality-checked products</li><li>Cash on Delivery nationwide</li><li>Fast 3–5 working day delivery</li><li>Friendly WhatsApp support</li></ul>` },
  contact: { title: 'Contact Us', updated: 'Last updated: October 2026', body: `
    <h2>Get in touch</h2>
    <p>Have a question about your order or a product? Message us on WhatsApp — we usually reply within a few hours (9am–9pm PKT, Mon–Sat).</p>
    <p><a data-wa-chat class="btn btn-green" href="#" target="_blank" rel="noopener">Chat on WhatsApp</a></p>` },
  shipping: { title: 'Shipping Policy', updated: 'Last updated: October 2026', body: `
    <h2>1. Delivery time</h2>
    <p>Orders are delivered within <strong>3–5 working days</strong> (Sunday off).</p>
    <h2>2. Delivery charges</h2>
    {{delivery_fees}}
    <p>Delivery charges are included in your order total — no hidden charges.</p>
    <h2>3. Cash on Delivery</h2>
    <p>Pay in cash when your parcel arrives. Please keep the amount ready.</p>
    <h2>4. Order tracking</h2>
    <p>Track your order anytime from the <strong>Track Order</strong> page using your Order ID.</p>` },
  refund: { title: 'Refund Policy', updated: 'Last updated: October 2026', body: `
    <h2>Our policy</h2>
    <p>All sales are final — we do not offer returns, refunds or exchanges, except in the cases below.</p>
    <h2>Wrong or damaged items</h2>
    <p>If you receive a wrong or damaged item, contact us on WhatsApp within <strong>24 hours</strong> of delivery with an unboxing video and we will make it right.</p>` },
  privacy: { title: 'Privacy Policy', updated: 'Last updated: October 2026', body: `
    <h2>What we collect</h2>
    <p>When you place an order we collect your name, phone number and address — only what is needed to deliver your parcel.</p>
    <h2>How we use it</h2>
    <p>Your details are used for order processing and delivery only. We never sell your information to third parties.</p>` },
  terms: { title: 'Terms of Service', updated: 'Last updated: October 2026', body: `
    <h2>1. Prices</h2>
    <p>All prices are in <strong>Pakistani Rupees (Rs)</strong>. Prices may change without notice, but a confirmed order's price will not change.</p>
    <h2>2. Product images</h2>
    <p>We show real product photos; slight color differences may occur due to screen settings.</p>
    <h2>3. Order confirmation</h2>
    <p>We may call you to confirm your order before dispatch. Unconfirmed orders may be cancelled.</p>
    <h2>4. Delivery</h2>
    <p>Estimated delivery is 3–5 working days. Delays by the courier are beyond our control but we will help you track your parcel.</p>` }
};
function vPage(app, key) {
  const base = PAGES[key];
  if (!base) { v404(app); return; }
  document.title = `${base.title} — Al Tejarat`;
  const cust = (((settings.content || {}).pages) || {})[key] || {};
  let body = cust.body || base.body;
  if (body.includes('{{delivery_fees}}')) body = body.split('{{delivery_fees}}').join(deliveryFeesTable());
  app.innerHTML = `<div class="wrap"><div class="page">
    <div class="crumbs"><a href="/" data-nav="/">Home</a> / <span>${esc(cust.title || base.title)}</span></div>
    <h1>${esc(cust.title || base.title)}</h1>
    ${cust.body ? '' : `<div class="updated">${esc(base.updated)}</div>`}
    <div class="prose">${body}</div>
  </div></div>`;
  if (key === 'contact') {
    const chat = app.querySelector('[data-wa-chat]');
    if (chat) chat.href = waLink('Hello Al Tejarat! I have a question.');
  }
}

/* ---------- search suggestions ---------- */
function bindSearch(input, drop) {
  if (!input || !drop) return;
  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    if (val.length < 2) { drop.classList.remove('show'); return; }
    const hits = DB.visibleProducts()
      .filter(p => (p.name || '').toLowerCase().includes(val)).slice(0, 6);
    if (!hits.length) { drop.classList.remove('show'); return; }
    drop.innerHTML = hits.map(p => {
      const im = (DB.productImages(p) || [])[0] || '';
      return `<a href="/product/${esc(DB.productSlug(p))}" data-nav="/product/${esc(DB.productSlug(p))}">
        ${im ? `<img src="${esc(im)}" alt="">` : ''}<span class="sg-t">${esc(p.name)}</span><span class="sg-p">${money(effPrice(p))}</span></a>`;
    }).join('');
    drop.classList.add('show');
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); drop.classList.remove('show'); nav('/shop?q=' + encodeURIComponent(input.value.trim())); }
  });
  input.addEventListener('blur', () => setTimeout(() => drop.classList.remove('show'), 180));
}

/* ---------- global bindings ---------- */
function bindGlobal() {
  document.addEventListener('click', e => {
    // wishlist toggle first (may sit inside a data-nav card)
    const w = e.target.closest('[data-wish]');
    if (w) { e.preventDefault(); e.stopPropagation(); toggleWish(w.dataset.wish); return; }
    // cart drawer qty / remove
    const inc = e.target.closest('[data-cinc]');
    if (inc) { const it = cart.find(i => i.key === inc.dataset.cinc); if (it) { it.qty++; saveCart(); updateCounts(); renderCartDrawer(); if (location.pathname === '/cart') route(); } return; }
    const dec = e.target.closest('[data-cdec]');
    if (dec) { const it = cart.find(i => i.key === dec.dataset.cdec); if (it) { it.qty--; if (it.qty <= 0) cart = cart.filter(i => i.key !== it.key); saveCart(); updateCounts(); renderCartDrawer(); if (location.pathname === '/cart') route(); } return; }
    const rm = e.target.closest('[data-crm]');
    if (rm) { cart = cart.filter(i => i.key !== rm.dataset.crm); saveCart(); updateCounts(); renderCartDrawer(); if (location.pathname === '/cart') route(); return; }
    // keyboard-accessible cards
    const card = e.target.closest('.p-card[data-nav], .cat-tile[data-nav]');
    if (card && (e.target === card || e.target.closest('.p-media, .p-body, .cap'))) { nav(card.dataset.nav); return; }
    const nl = e.target.closest('[data-nav]');
    if (nl) { e.preventDefault(); nav(nl.dataset.nav); return; }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.p-card[data-nav], .cat-tile[data-nav]')) nav(e.target.dataset.nav);
  });
  // header buttons
  $('#cartBtn').addEventListener('click', () => { renderCartDrawer(); openCartDrawer(); });
  $('#cartX').addEventListener('click', closeDrawers);
  $('#scrim').addEventListener('click', closeDrawers);
  $('#hambBtn').addEventListener('click', () => { $('#mDrawer').classList.add('show'); $('#scrim').classList.add('show'); });
  $('#drawerX').addEventListener('click', closeDrawers);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });
  // search
  bindSearch($('#headSearch'), $('#headSuggest'));
  $('#mSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); nav('/shop?q=' + encodeURIComponent(e.target.value.trim())); }
  });
  window.addEventListener('popstate', route);
}

/* ---------- init ---------- */
(async function init() {
  loadCart(); loadWishlist();
  try { await DB.init(); } catch (e) { console.warn('DB init issue:', e); }
  settings = DB.getSettings() || {};
  try {
    if (settings.tiktokPixel && window.ttq) window.ttq.load(settings.tiktokPixel);
  } catch (e) {}
  renderChrome();
  bindGlobal();
  renderCartDrawer();
  route();
})();

})();
