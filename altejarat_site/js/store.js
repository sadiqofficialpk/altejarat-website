/* Al Tejarat storefront */
(async () => {
  await DB.init();
  const settings = () => DB.getSettings();
  /* ---- TikTok pixel ---- */
  let pixelReady = false;
  function initPixel() {
    const pid = (settings().tiktokPixel || '').trim();
    if (!pid || pixelReady || typeof document === 'undefined') return;
    try {
      const w = window;
      w.TiktokAnalyticsObject = 'ttq';
      const ttq = w.ttq = w.ttq || [];
      ttq.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];
      ttq.setAndDefer = function(t, e) { t[e] = function() { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.load = function(e) {
        ttq._i = ttq._i || {}; ttq._i[e] = [];
        const a = document.createElement('script');
        a.type = 'text/javascript'; a.async = true;
        a.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + e + '&lib=ttq';
        const x = document.getElementsByTagName('script')[0];
        x.parentNode.insertBefore(a, x);
      };
      ttq.load(pid);
      ttq.page();
      pixelReady = true;
    } catch (e) { /* pixel optional */ }
  }
  function pxEvent(name, params) {
    try { if (pixelReady && window.ttq) window.ttq.track(name, params || {}); } catch (e) {}
  }
  const $ = sel => document.querySelector(sel);
  const app = $('#app');

  document.title = settings().storeName + ' — ' + settings().tagline;
  const ann = settings().announcements || '';
  if (ann) $('#announce').textContent = ann; else $('#announce').style.display = 'none';

  /* ---------- cart ---------- */
  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem('altejarat_cart_v1') || '[]');
    // purani kharab entries repair karo (qty missing ho to 1)
    cart = cart.filter(i => i && i.pid && !isNaN(Number(i.price))).map(i => ({
      ...i, qty: Math.max(1, parseInt(i.qty, 10) || 1), price: Number(i.price)
    }));
  } catch (e) { cart = []; }
  const saveCart = () => localStorage.setItem('altejarat_cart_v1', JSON.stringify(cart));
  const cartQty = () => cart.reduce((a, i) => a + i.qty, 0);
  const cartSubtotal = () => cart.reduce((a, i) => a + i.price * i.qty, 0);

  function updateCartBadge() { $('#cartCount').textContent = cartQty(); }

  function addToCart(pid, colorIdx, sizeIdx, qty) {
    const p = DB.getProduct(pid);
    if (!p || !DB.visibleProducts().some(v => v.id === pid)) return;
    colorIdx = Math.max(0, parseInt(colorIdx, 10) || 0);
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const colors = DB.normColors(p);
    const colorName = colors.length ? colors[colorIdx].name : '';
    const sizes = (p.sizes || []).filter(Boolean);
    const sizeName = sizes.length ? (sizes[sizeIdx] || '') : '';
    const key = pid + '|' + colorName + '|' + sizeName;
    const ex = cart.find(i => i.key === key);
    if (ex) ex.qty += qty;
    else cart.push({ key, pid, name: p.name, color: colorName, size: sizeName, img: DB.productImage(p), price: p.price, qty });
    saveCart(); updateCartBadge(); renderCart(); openCart();
    pxEvent('AddToCart', { content_id: pid, content_name: p.name, price: Number(p.price) || 0, quantity: qty, currency: 'PKR' });
  }

  function renderCart() {
    const body = $('#cartBody'), foot = $('#cartFoot');
    if (!cart.length) {
      body.innerHTML = '<div class="empty">🛒<br>Your cart is empty.<br>Add something you love!</div>';
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = cart.map(i => `
      <div class="ci">
        <img src="${DB.esc(i.img)}" alt="">
        <div class="ci-info"><b>${DB.esc(i.name)}</b><small>${[i.color, i.size].filter(Boolean).map(DB.esc).join(' · ')} · ${DB.money(i.price)}</small></div>
        <div class="ci-qty">
          <button data-dec="${DB.esc(i.key)}">−</button><b>${i.qty}</b><button data-inc="${DB.esc(i.key)}">+</button>
        </div>
        <button class="ci-rm" data-rm="${DB.esc(i.key)}">Remove</button>
      </div>`).join('');
    const s = settings();
    const lahoreFee = (s.deliveryLahore !== undefined) ? s.deliveryLahore : 250;
    const otherFee = (s.deliveryOther !== undefined) ? s.deliveryOther : 350;
    foot.innerHTML = `
      <div class="tot-row"><span>Subtotal</span><span>${DB.money(cartSubtotal())}</span></div>
      <div class="tot-row"><span>Delivery</span><span class="at-checkout">at checkout</span></div>
      <div class="tot-row grand"><span>Total</span><span>${DB.money(cartSubtotal())}<small> + delivery</small></span></div>
      <div class="del-note">* Delivery: Lahore ${DB.money(lahoreFee)}, other cities ${DB.money(otherFee)}</div>
      <a class="btn btn-green" style="width:100%;text-align:center;margin-top:10px" href="/checkout">Checkout →</a>`;
  }

  function openCart() { $('#cartDrawer').classList.add('open'); $('#overlay').classList.add('show'); }
  function closeCart() { $('#cartDrawer').classList.remove('open'); $('#overlay').classList.remove('show'); }
  $('#cartBtn').onclick = () => { renderCart(); openCart(); };
  $('#cartClose').onclick = closeCart;
  $('#overlay').onclick = closeCart;

  document.addEventListener('click', e => {
    const t = e.target;
    const inc = t.dataset.inc, dec = t.dataset.dec, rm = t.dataset.rm;
    if (inc || dec || rm) {
      const key = inc || dec || rm;
      const it = cart.find(i => i.key === key);
      if (it) {
        if (inc) it.qty++;
        if (dec) it.qty = Math.max(0, it.qty - 1);
        if (rm) cart = cart.filter(i => i.key !== key);
        cart = cart.filter(i => i.qty > 0);
        saveCart(); updateCartBadge(); renderCart();
      }
    }
    const add = t.closest('[data-add]');
    if (add) {
      const qp = DB.getProduct(add.dataset.add);
      if (qp && (qp.sizes || []).filter(Boolean).length) nav('/product/' + DB.productSlug(qp));
      else addToCart(add.dataset.add, 0, -1, 1);
    }
  });

  /* ---------- views ---------- */
  const cardHTML = p => {
    const img = DB.productImage(p);
    return `<div class="card">
      ${p.featured ? '<span class="flag">Best Seller</span>' : ''}
      <a href="/product/${DB.esc(DB.productSlug(p))}"><img src="${DB.esc(img)}" alt="${DB.esc(p.name)}" loading="lazy"></a>
      <div class="card-body">
        <span class="card-cat">${DB.esc(p.category || '')}</span>
        <a class="card-name" href="/product/${DB.esc(DB.productSlug(p))}">${DB.esc(p.name)}</a>
        <span class="card-price">${DB.money(p.price)}</span>
        <button class="btn btn-gold" data-add="${p.id}">Add to Cart</button>
      </div>
    </div>`;
  };

  /* ---------- footer social icons ---------- */
  const SOC_ICONS = {
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>'
  };
  function getSocialLinks() {
    const s = settings();
    const links = [];
    const wa = (s.whatsapp || '').replace(/\D/g, '');
    if (wa) links.push({ k: 'whatsapp', href: 'https://wa.me/' + wa, label: 'WhatsApp', wa });
    if (s.tiktok) links.push({ k: 'tiktok', href: s.tiktok, label: 'TikTok' });
    if (s.facebook) links.push({ k: 'facebook', href: s.facebook, label: 'Facebook' });
    if (s.instagram) links.push({ k: 'instagram', href: s.instagram, label: 'Instagram' });
    return links;
  }
  function renderSocial() {
    const links = getSocialLinks();
    const el = document.getElementById('socialRow');
    if (el) el.innerHTML = links.map(l =>
      `<a class="soc" href="${DB.esc(l.href)}" target="_blank" rel="noopener" title="${l.label}" aria-label="${l.label}">${SOC_ICONS[l.k]}</a>`).join('');
    const wn = document.getElementById('footWaNum');
    const wa = (links.find(l => l.k === 'whatsapp') || {}).wa;
    if (wn && wa) {
      const local = wa.startsWith('92') ? '0' + wa.slice(2) : wa;
      wn.textContent = local.length > 4 ? local.slice(0, 4) + ' ' + local.slice(4) : local;
    }
  }

  /* ---------- wishlist (customer-side, local) ---------- */
  const wishKey = 'altejarat_wish_v1';
  const getWish = () => { try { return JSON.parse(localStorage.getItem(wishKey)) || []; } catch (e) { return []; } };
  const toggleWish = id => {
    let w = getWish();
    w = w.includes(id) ? w.filter(x => x !== id) : [...w, id];
    localStorage.setItem(wishKey, JSON.stringify(w));
    return w.includes(id);
  };
  function updateWishBadge() {
    const el = document.getElementById('wishCount');
    if (el) el.textContent = getWish().length;
  }
  const bcardHTML = p => {
    const on = getWish().includes(p.id);
    return `
      <div class="bcard">
        <button class="heart ${on ? 'on' : ''}" data-wish="${DB.esc(p.id)}" aria-label="Wishlist">${on ? '♥' : '♡'}</button>
        <a href="/product/${DB.esc(DB.productSlug(p))}"><img class="pimg" src="${DB.esc(DB.productImage(p))}" alt="${DB.esc(p.name)}" loading="lazy"></a>
        <div class="bcard-body">
          ${p.category ? `<span class="card-cat">${DB.esc(p.category)}</span>` : ''}
          <a class="card-name" href="/product/${DB.esc(DB.productSlug(p))}">${DB.esc(p.name)}</a>
          <span class="card-price">${DB.money(p.price)}</span>
          <button class="add-btn" data-add="${DB.esc(p.id)}">ADD TO CART 🛒</button>
        </div>
      </div>`;
  };

  /* ---------- wishlist page ---------- */
  function vWishlist() {
    const list = DB.visibleProducts().filter(p => getWish().includes(p.id));
    app.innerHTML = `
      <section class="section"><div class="wrap">
        <div class="sec-head"><h2>🤍 My Wishlist</h2><a class="view-all" href="/shop">Continue Shopping →</a></div>
        ${list.length ? `<div class="bgrid">${list.map(bcardHTML).join('')}</div>`
          : '<div class="empty">Abhi koi favorite nahi hai.<br>Products par ♥ dabao — wo yahan save ho jayenge!</div>'}
      </div></section>`;
    app.querySelectorAll('[data-wish]').forEach(b => b.onclick = e => {
      e.preventDefault();
      toggleWish(b.dataset.wish);
      updateWishBadge();
      vWishlist();
    });
  }

  function vHome() {
    const cats = DB.getCategories();
    const prods = DB.visibleProducts();

    const catCards = cats.map(c => {
      const items = prods.filter(p => p.category === c);
      if (!items.length) return '';
      return `<a class="cat-circle" href="/shop/${encodeURIComponent(c)}">
        <span class="cc-img"><img src="${DB.esc(DB.getCategoryImage(c) || DB.productImage(items[0]))}" alt="${DB.esc(c)}" loading="lazy"></span>
        <b>${DB.esc(c)}</b><small>Shop Now →</small></a>`;
    }).join('');

    const feat = prods.filter(p => p.featured);
    const best = (feat.length ? feat : prods).slice(0, 4);
    const pick = prods[0];
    const waChat = 'https://wa.me/923348954786?text=' + encodeURIComponent('Assalam-o-Alaikum! Mujhe Al Tejarat se order karna hai.');

    const followLinks = getSocialLinks();
    const followSocial = followLinks.filter(l => l.k !== 'whatsapp');

    // har category ka alag section, uske products ke saath
    const catSections = cats.map(c => {
      const items = prods.filter(p => p.category === c).slice(0, 4);
      if (!items.length) return '';
      return `<section class="section"><div class="wrap">
        <div class="sec-head"><h2>${DB.esc(c)}</h2><a class="view-all" href="/shop/${encodeURIComponent(c)}">View All →</a></div>
        <div class="bgrid">${items.map(bcardHTML).join('')}</div>
      </div></section>`;
    }).join('');

    app.innerHTML = `
      <section class="hero"><div class="wrap hero-grid">
        <div>
          <span class="hero-badge">CASH ON DELIVERY</span>
          <h1>Everything You Need,<br><span class="hl">Every Day!</span></h1>
          <p>Quality products at honest prices — WhatsApp par asaan order, parcel milne par payment.</p>
          <a class="btn btn-brand" href="/shop">EXPLORE COLLECTION →</a>
        </div>
        <div class="hero-visual">
          <div class="hero-blob"></div>
          <img src="images/bag_8_lavender.jpg" alt="Al Tejarat featured product">
          <div class="hero-off"><b>COD</b>AVAILABLE</div>
        </div>
      </div></section>

      <div class="wrap"><div class="trustbar">
        <div class="titem"><span class="ic">🚚</span><div><b>Fast Delivery</b><small>3–5 working days</small></div></div>
        <div class="titem"><span class="ic">✓</span><div><b>Quality Checked</b><small>Verified products</small></div></div>
        <div class="titem"><span class="ic">💵</span><div><b>COD Available</b><small>Pay on delivery</small></div></div>
        <div class="titem"><span class="ic">💬</span><div><b>WhatsApp Support</b><small>Quick response</small></div></div>
      </div></div>

      ${catCards ? `<section class="section"><div class="wrap">
        <div class="sec-head center"><span class="dots">• • •</span><h2>Shop By Category</h2><span class="dots">• • •</span></div>
        <div class="cat-row">${catCards}</div>
      </div></section>` : ''}

      ${best.length ? `<section class="section"><div class="wrap">
        <div class="sec-head"><h2>Best Sellers</h2><a class="view-all" href="/shop">View All →</a></div>
        <div class="bgrid">${best.map(bcardHTML).join('')}</div>
      </div></section>` : ''}

      ${catSections}

      <section class="section"><div class="wrap promos">
        <div class="promo promo-a">
          <div><small>Fast & Easy</small><h3>Order on WhatsApp</h3>
            <p>Apna order seedha WhatsApp par bhejein — foran jawab, asaan tareeqa.</p>
            <a class="btn btn-brand" href="${waChat}" target="_blank" rel="noopener">CHAT NOW →</a></div>
          <span class="big-emoji">💬</span>
        </div>
        ${pick ? `<div class="promo promo-b">
          <div><small>Today's Pick</small><h3>${DB.esc(pick.name)}</h3>
            <p>${DB.money(pick.price)} — Cash on Delivery</p>
            <a class="btn btn-brand" href="/product/${DB.esc(DB.productSlug(pick))}">SHOP NOW →</a></div>
          <img class="pick" src="${DB.esc(DB.productImage(pick))}" alt="${DB.esc(pick.name)}">
        </div>` : ''}
      </div></section>

      <div id="homeReviews"></div>

      ${followSocial.length ? `<section class="section"><div class="wrap">
        <div class="sec-head center"><span class="dots">• • •</span><h2>Follow Us</h2><span class="dots">• • •</span></div>
        <p class="sub" style="text-align:center">Nayi products aur offers ke liye humein follow karein!</p>
        <div class="follow-row">${followSocial.map(l => `
          <a class="follow-btn" href="${DB.esc(l.href)}" target="_blank" rel="noopener">
            <span class="fb-ic">${SOC_ICONS[l.k]}</span>
            <span><b>${l.label}</b><small>Follow →</small></span>
          </a>`).join('')}</div>
      </div></section>` : ''}
      <section class="section"><div class="wrap">
        <div class="sec-head center"><span class="dots">• • •</span><h2>How To Order</h2><span class="dots">• • •</span></div>
        <div class="steps">
          <div class="step"><span class="num">1</span><span class="ic">🛍️</span><h3>Product Pasand Karein</h3><p>Categories browse karein ya search se apni pasand ka product chunein.</p></div>
          <div class="step"><span class="num">2</span><span class="ic">🛒</span><h3>Order Place Karein</h3><p>Cart mein add karke checkout karein, ya seedha WhatsApp par order bhejein.</p></div>
          <div class="step"><span class="num">3</span><span class="ic">💵</span><h3>Pay on Delivery</h3><p>Parcel 3–5 din mein aapke darwaze par — payment tabhi karein jab mile.</p></div>
        </div>
      </div></section>

      <section class="section" style="padding-top:0"><div class="wrap"><div class="trustrow">
        <div class="titem"><span class="ic">📦</span><div><b>Track Your Order</b><small>WhatsApp par poochein</small></div></div>
        <div class="titem"><span class="ic">✓</span><div><b>Quality Checked</b><small>Har product verified</small></div></div>
        <div class="titem"><span class="ic">💵</span><div><b>Flexible Payment</b><small>Cash on Delivery</small></div></div>
        <div class="titem"><span class="ic">💬</span><div><b>Customer Support</b><small>Hum hazir hain</small></div></div>
      </div></div></section>`;

    app.querySelectorAll('[data-wish]').forEach(b => b.onclick = e => {
      e.preventDefault();
      const on = toggleWish(b.dataset.wish);
      updateWishBadge();
      b.classList.toggle('on', on);
      b.textContent = on ? '♥' : '♡';
    });
    // note: [data-add] buttons document-level handler se handle hote hain (double-add se bachne ke liye yahan dobara bind nahi karte)


    // home page customer reviews (latest 6)
    (async () => {
      const box = document.getElementById('homeReviews');
      if (!box) return;
      try {
        const revs = (await DB.getReviews()).slice(0, 6);
        if (!revs.length) return;
        const starRow = r => '★'.repeat(r) + '☆'.repeat(5 - r);
        box.innerHTML = `<section class="section"><div class="wrap">
          <div class="sec-head center"><span class="dots">• • •</span><h2>⭐ Customer Reviews</h2><span class="dots">• • •</span></div>
          <div class="rev-grid">${revs.map(r => {
            const prod = DB.getProduct(r.productId);
            return `<div class="rev-card">
              ${r.img ? `<img src="${DB.esc(r.img)}" class="rev-card-img" alt="">` : ''}
              <div class="stars">${starRow(Math.min(5, Math.max(1, +r.rating || 5)))}</div>
              <p>"${DB.esc((r.text || '').slice(0, 120))}${(r.text || '').length > 120 ? '…' : ''}"</p>
              <b>${DB.esc(r.name || 'Customer')}</b>
              ${prod ? `<a class="sub prod-link" href="/product/${DB.esc(DB.productSlug(prod))}">${DB.esc(prod.name)}</a>` : ''}
            </div>`;
          }).join('')}</div>
        </div></section>`;
      } catch (e) { /* reviews optional */ }
    })();
  }

  /* ---------- header nav ---------- */
  function renderCatNav() {
    const el = document.getElementById('catNav');
    if (!el) return;
    el.innerHTML = `<a href="/" data-nav>Home</a><a href="/about" data-nav>About Us</a><a href="/contact" data-nav>Contact Us</a>`;
  }

  let shopQ = '', shopCat = 'all', shopSort = 'new';


  function vShop(preCat) {
    if (preCat !== undefined) shopCat = preCat;
    const cats = ['all', ...DB.getCategories()];
    if (!cats.includes(shopCat)) shopCat = 'all';
    app.innerHTML = `
      <section class="section"><div class="wrap">
        <h2>Shop All Products</h2><p class="sub">${DB.visibleProducts().length} products available</p>
        <div class="toolbar">
          <input id="q" placeholder="Search products..." value="${DB.esc(shopQ)}">
          <select id="cat">${cats.map(c => `<option value="${DB.esc(c)}" ${c === shopCat ? 'selected' : ''}>${c === 'all' ? 'All Categories' : DB.esc(c)}</option>`).join('')}</select>
          <select id="sort">
            <option value="new" ${shopSort === 'new' ? 'selected' : ''}>Newest</option>
            <option value="lo" ${shopSort === 'lo' ? 'selected' : ''}>Price: Low → High</option>
            <option value="hi" ${shopSort === 'hi' ? 'selected' : ''}>Price: High → Low</option>
          </select>
        </div>
        <div class="grid" id="shopGrid"></div>
      </div></section>`;
    const draw = () => {
      let list = DB.visibleProducts().slice();
      if (shopCat !== 'all') list = list.filter(p => p.category === shopCat);
      if (shopQ) list = list.filter(p => (p.name + ' ' + (p.description || '')).toLowerCase().includes(shopQ.toLowerCase()));
      if (shopSort === 'lo') list.sort((a, b) => a.price - b.price);
      if (shopSort === 'hi') list.sort((a, b) => b.price - a.price);
      $('#shopGrid').innerHTML = list.length ? list.map(cardHTML).join('') : '<div class="empty">No products found.</div>';
    };
    $('#q').oninput = e => { shopQ = e.target.value; draw(); };
    $('#cat').onchange = e => { shopCat = e.target.value; draw(); };
    $('#sort').onchange = e => { shopSort = e.target.value; draw(); };
    draw();
  }

  function vProduct(id) {
    const p = DB.getProductBySlug(decodeURIComponent(id)) || DB.getProduct(id);
    const hidden = p && !DB.visibleProducts().some(v => v.id === p.id);
    if (!p || hidden) { app.innerHTML = '<div class="wrap section"><div class="empty">Ye product abhi available nahi hai.</div></div>'; return; }
    const colors = DB.normColors(p);
    const sizes = (p.sizes || []).filter(Boolean);
    const gallery = DB.productImages(p);
    let ci = 0, si = -1, qty = 1, gi = 0;
    const setMain = src => { document.getElementById('pdImg').src = src; };
    app.innerHTML = `
      <div class="wrap"><div class="pd">
        <div><img class="main zoomable" id="pdImg" src="${DB.esc(gallery[0] || '')}" alt="${DB.esc(p.name)}" title="Bari karne ke liye tap karein">
        ${gallery.length > 1 ? `<div class="thumbs">${gallery.map((g, i) => `<img class="thumb ${i === 0 ? 'on' : ''}" data-gi="${i}" src="${DB.esc(g)}" alt="">`).join('')}</div>` : ''}</div>
        <div class="pd-info">
          <span class="pd-cat">${DB.esc(p.category || '')}</span>
          <h1>${DB.esc(p.name)}</h1>
          <div class="pd-rating" id="pdRating"></div>
          <div class="pd-price">${DB.money(p.price)}</div>
          <p class="pd-desc">${DB.esc(p.description || '')}</p>
          ${colors.length ? `<div class="color-name">Color: <b id="colorName">${DB.esc(colors[0].name)}</b></div>
          <div class="swatches text-swatches">${colors.map((c, i) => `<button class="tswatch ${i === 0 ? 'on' : ''}" data-ci="${i}">${DB.esc(c.name)}</button>`).join('')}</div>` : ''}
          ${sizes.length ? `<div class="color-name">Size: <b id="sizeName">Select karein</b></div>
          <div class="swatches text-swatches">${sizes.map((sv, i) => `<button class="tswatch" data-si="${i}">${DB.esc(sv)}</button>`).join('')}</div>
          <small id="sizeWarn" class="warn" hidden>⚠️ Pehle size select karein</small>` : ''}
          <div class="qty"><button id="qMinus">−</button><b id="qVal">1</b><button id="qPlus">+</button></div>
          <div class="pd-actions">
            <button class="btn btn-gold" id="pdAdd">Add to Cart</button>
            <button class="btn btn-green" id="pdBuy">Abhi Order Karein</button>
          </div>
          <button class="btn btn-ghost" id="pdShare" style="width:100%;margin-top:10px">📤 Share this product</button>
          <div class="note">✓ Cash on Delivery · ✓ 3–5 working days delivery · ✓ WhatsApp par order bhi kar sakte hain<br>📅 Estimated delivery: <b>${DB.estimateDelivery()}</b> <small>(andaza hai)</small></div>
        </div>
      </div>
      <div id="relWrap"></div>
      <div id="revWrap" data-all="0"></div>
      </div>`;
    // gallery
    document.querySelectorAll('.thumb').forEach(t => t.onclick = () => {
      document.querySelectorAll('.thumb').forEach(x => x.classList.remove('on'));
      t.classList.add('on'); gi = +t.dataset.gi; setMain(gallery[gi]);
    });
    // colors -> naam + us color ki photo
    document.querySelectorAll('.tswatch[data-ci]').forEach(sw => sw.onclick = () => {
      document.querySelectorAll('.tswatch[data-ci]').forEach(x => x.classList.remove('on'));
      sw.classList.add('on'); ci = +sw.dataset.ci;
      $('#colorName').textContent = colors[ci].name;
      if (colors[ci].img) { setMain(colors[ci].img); document.querySelectorAll('.thumb').forEach(x => x.classList.remove('on')); }
      else if (gallery[gi]) setMain(gallery[gi]);
    });
    // sizes
    document.querySelectorAll('.tswatch[data-si]').forEach(sw => sw.onclick = () => {
      document.querySelectorAll('.tswatch[data-si]').forEach(x => x.classList.remove('on'));
      sw.classList.add('on'); si = +sw.dataset.si;
      $('#sizeName').textContent = sizes[si];
      $('#sizeWarn').hidden = true;
    });
    // zoom
    $('#pdImg').onclick = () => {
      const ov = document.createElement('div');
      ov.className = 'zoom-ov';
      ov.innerHTML = `<img src="${DB.esc(document.getElementById('pdImg').src)}" alt="">`;
      ov.onclick = () => ov.remove();
      document.body.appendChild(ov);
    };
    // share
    $('#pdShare').onclick = async () => {
      const url = location.origin + '/product/' + DB.productSlug(p);
      const text = p.name + ' — ' + DB.money(p.price) + ' (Al Tejarat)';
      if (navigator.share) { try { await navigator.share({ title: p.name, text, url }); return; } catch (e) { /* cancelled */ } }
      let panel = document.getElementById('sharePanel');
      if (panel) { panel.remove(); return; }
      panel = document.createElement('div');
      panel.id = 'sharePanel'; panel.className = 'share-panel';
      panel.innerHTML = `
        <a class="btn btn-green" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}">WhatsApp par share karein</a>
        <button class="btn btn-ghost" id="copyLink" type="button">🔗 Link copy karo</button>`;
      $('#pdShare').after(panel);
      panel.querySelector('#copyLink').onclick = async () => {
        try { await navigator.clipboard.writeText(url); panel.querySelector('#copyLink').textContent = '✓ Copy ho gaya!'; }
        catch (e) { prompt('Ye link copy kar lein:', url); }
      };
    };
    $('#qMinus').onclick = () => { qty = Math.max(1, qty - 1); $('#qVal').textContent = qty; };
    $('#qPlus').onclick = () => { qty++; $('#qVal').textContent = qty; };
    const needSize = () => {
      if (sizes.length && si < 0) { const w = $('#sizeWarn'); w.hidden = false; w.scrollIntoView({ block: 'nearest' }); return true; }
      return false;
    };
    $('#pdAdd').onclick = () => { if (needSize()) return; addToCart(p.id, ci, si, qty); };
    $('#pdBuy').onclick = () => { if (needSize()) return; addToCartSilent(p.id, ci, si, qty); nav('/checkout'); };
    // related products
    const rel = DB.visibleProducts().filter(x => x.id !== p.id && x.category && x.category === p.category).slice(0, 8);
    if (rel.length) {
      document.getElementById('relWrap').innerHTML = `
        <section class="section"><div class="sec-head"><h2>🔗 Related Products</h2><a class="view-all" href="/shop/${encodeURIComponent(p.category)}">View All →</a></div>
        <div class="bgrid">${rel.map(bcardHTML).join('')}</div></section>`;
    }
    // reviews
    const revWrap = document.getElementById('revWrap');
    const starRow = r => '★'.repeat(r) + '☆'.repeat(5 - r);
    const renderReviews = async () => {
      const revs = await DB.getReviews(p.id);
      const avg = DB.avgRating(revs);
      document.getElementById('pdRating').innerHTML = revs.length
        ? `<span class="stars">${starRow(Math.round(avg))}</span> <b>${avg}</b> <span class="sub">(${revs.length} reviews)</span>`
        : '<span class="sub">Abhi koi review nahi — pehla review aap dein!</span>';
      const showAll = revWrap.dataset.all === '1';
      const list = showAll ? revs : revs.slice(0, 4);
      revWrap.innerHTML = `
        <section class="section"><div class="sec-head"><h2>⭐ Customer Reviews (${revs.length})</h2></div>
        <div class="rev-list">${list.map(r => `
          <div class="rev">
            ${r.img ? `<img src="${DB.esc(r.img)}" class="rev-img" alt="">` : ''}
            <div class="rev-body"><b>${DB.esc(r.name || 'Customer')}</b> <span class="stars">${starRow(Math.min(5, Math.max(1, +r.rating || 5)))}</span>
            <div class="sub">${new Date(r.createdAt || Date.now()).toLocaleDateString('en-GB')}</div>
            <div>${DB.esc(r.text || '')}</div></div>
          </div>`).join('') || '<p class="sub">Abhi koi review nahi hai.</p>'}</div>
        ${revs.length > 4 ? `<button class="btn btn-ghost" id="revToggle" type="button">${showAll ? 'Kam dekhein ▲' : 'View All Reviews ▼'}</button>` : ''}
        <div class="rev-form-card">
        <h3>✍️ Apna review dein</h3>
        <input class="fi" id="rvName" placeholder="Aapka naam *">
        <div class="star-wrap"><span class="sub">Rating:</span><div class="star-input" id="rvStars">${[1,2,3,4,5].map(i => `<span data-star="${i}" class="on">★</span>`).join('')}</div></div>
        <textarea class="fi" id="rvText" rows="3" placeholder="Product kaisa laga? *"></textarea>
        <label class="file-btn">📷 Photo add karein <small>(optional)</small><input type="file" id="rvImg" accept="image/*" hidden></label>
        <span id="rvFileName" class="sub"></span>
        <button class="btn btn-brand" id="rvSubmit" type="button">Review Submit karein</button>
        </div></section>`;
      let rRating = 5;
      revWrap.querySelectorAll('[data-star]').forEach(sp => sp.onclick = () => {
        rRating = +sp.dataset.star;
        revWrap.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= rRating));
      });
      const rvImg = document.getElementById('rvImg');
      if (rvImg) rvImg.onchange = () => {
        const fn = document.getElementById('rvFileName');
        if (fn) fn.textContent = rvImg.files[0] ? '✓ ' + rvImg.files[0].name : '';
      };
      const tg = document.getElementById('revToggle');
      if (tg) tg.onclick = () => { revWrap.dataset.all = revWrap.dataset.all === '1' ? '0' : '1'; renderReviews(); };
      document.getElementById('rvSubmit').onclick = async () => {
        const name = document.getElementById('rvName').value.trim();
        const text = document.getElementById('rvText').value.trim();
        if (!name || !text) { alert('Naam aur review likhna zaroori hai.'); return; }
        const btn = document.getElementById('rvSubmit');
        btn.disabled = true; btn.textContent = '⏳ Submit ho raha hai...';
        let img = '';
        const f = document.getElementById('rvImg').files[0];
        if (f) { try { img = await DB.uploadImage(f, 'reviews'); } catch (e) { /* optional */ } }
        await DB.addReview({ productId: p.id, name, rating: rRating, text, img });
        renderReviews();
      };
    };
    renderReviews();
    pxEvent('ViewContent', { content_id: p.id, content_name: p.name, price: Number(p.price) || 0, currency: 'PKR' });
  }

  function addToCartSilent(pid, colorIdx, sizeIdx, qty) {
    const p = DB.getProduct(pid);
    const colors = DB.normColors(p);
    const colorName = colors.length ? colors[Math.max(0, colorIdx || 0)].name : '';
    const sizes = (p.sizes || []).filter(Boolean);
    const sizeName = sizes.length ? (sizes[sizeIdx] || '') : '';
    const key = pid + '|' + colorName + '|' + sizeName;
    const ex = cart.find(i => i.key === key);
    if (ex) ex.qty += qty;
    else cart.push({ key, pid, name: p.name, color: colorName, size: sizeName, img: DB.productImage(p), price: p.price, qty });
    saveCart(); updateCartBadge();
  }

  function vCheckout() {
    if (!cart.length) { nav('/shop'); return; }
    pxEvent('InitiateCheckout', { value: cartSubtotal(), currency: 'PKR', num_items: cartQty() });
    app.innerHTML = `
      <div class="wrap"><div class="checkout">
        <h1>Checkout</h1><p class="sub">Cash on Delivery — pehle product, phir payment.</p>
        <div class="order-lines" id="coLines"></div>
        <form class="form" id="coForm" autocomplete="off">
          <label>Your Name *</label><input name="name" required placeholder="e.g. Ahmed Khan">
          <label>Phone Number *</label><input name="phone" required placeholder="e.g. 0300 1234567" pattern="[0-9+\\-\\s]{10,15}">
          <label>House No *</label><input name="house" required placeholder="e.g. House 12, Street 5">
          <label>Area / Street *</label><input name="area" required placeholder="e.g. DHA Phase 2">
          <label>City *</label>
          <div class="city-wrap">
            <input name="city" id="cityInput" required placeholder="Type your city..." autocomplete="off">
            <div class="city-drop" id="cityDrop" hidden></div>
          </div>
          <button class="btn btn-wa" type="submit" style="margin-top:16px">📩 WhatsApp par Order Karein</button>
        </form>
        <div class="note">Order ka button dabate hi aapka WhatsApp khulega — order ki sari tafseel pehle se likhi hogi, bas <b>Send</b> dabana hai. Message aapke apne number se jayega.<br>Delivery: <b>Lahore Rs 250</b>, baqi cities <b>Rs 350</b>.</div>
      </div></div>`;

    const drawTotals = () => {
      const city = $('#cityInput').value;
      const fee = DB.deliveryFeeFor(city);
      const total = cartSubtotal() + fee;
      $('#coLines').innerHTML = `
        ${cart.map(i => `<div class="tot-row"><span>${DB.esc(i.name)}${[i.color, i.size].filter(Boolean).map(x => ' (' + DB.esc(x) + ')').join('')} × ${i.qty}</span><span>${DB.money(i.price * i.qty)}</span></div>`).join('')}
        <div class="tot-row"><span>Delivery${city ? ' (' + DB.esc(city) + ')' : ''}</span><span>${DB.money(fee)}</span></div>
        <div class="tot-row grand"><span>Total</span><span>${DB.money(total)}</span></div>`;
    };
    drawTotals();

    // city autocomplete dropdown
    const cityInput = $('#cityInput'), cityDrop = $('#cityDrop');
    const hideDrop = () => { cityDrop.hidden = true; };
    cityInput.addEventListener('input', () => {
      const q = cityInput.value.trim().toLowerCase();
      drawTotals();
      if (!q) { hideDrop(); return; }
      const starts = DB.CITIES.filter(c => c.toLowerCase().startsWith(q));
      const contains = DB.CITIES.filter(c => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
      const matches = [...starts, ...contains].slice(0, 8);
      if (!matches.length) { hideDrop(); return; }
      cityDrop.innerHTML = matches.map(c => `<button type="button" data-city="${DB.esc(c)}">${DB.esc(c)}</button>`).join('');
      cityDrop.hidden = false;
      cityDrop.querySelectorAll('[data-city]').forEach(b => b.addEventListener('mousedown', e => {
        e.preventDefault();
        cityInput.value = b.dataset.city;
        hideDrop(); drawTotals();
      }));
    });
    cityInput.addEventListener('blur', () => setTimeout(hideDrop, 150));
    cityInput.addEventListener('keydown', e => { if (e.key === 'Escape') hideDrop(); });

    $('#coForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await placeOrder({
        name: fd.get('name').trim(), phone: fd.get('phone').trim(),
        house: fd.get('house').trim(), area: fd.get('area').trim(),
        city: fd.get('city').trim()
      });
    };
  }

  function fullAddress(cust) {
    if (cust.house || cust.area) return [cust.house, cust.area, cust.city].filter(Boolean).join(', ');
    return [cust.address, cust.city].filter(Boolean).join(', '); // very old orders
  }

  async function placeOrder(cust) {
    const id = await DB.nextOrderId();
    const fee = DB.deliveryFeeFor(cust.city);
    const items = cart.map(i => ({ pid: i.pid, name: i.name, color: i.color, size: i.size || '', price: i.price, qty: i.qty }));
    const order = {
      id, date: new Date().toISOString(), customer: cust,
      items, subtotal: cartSubtotal(), delivery: fee,
      total: cartSubtotal() + fee, status: 'Pending'
    };
    DB.addOrder(order);

    // decrease stock
    items.forEach(it => {
      const p = DB.getProduct(it.pid);
      if (p && typeof p.stock === 'number') { p.stock = Math.max(0, p.stock - it.qty); DB.saveProduct(p); }
    });

    // Netlify Forms backup (email notification) - fails silently when not on Netlify
    try {
      const nf = new FormData();
      nf.append('form-name', 'order');
      nf.append('order_id', id);
      nf.append('customer', cust.name + ' | ' + cust.phone);
      nf.append('phone', cust.phone);
      nf.append('address', fullAddress(cust));
      nf.append('items', items.map(i => `${i.name}${[i.color, i.size].filter(Boolean).map(x => ' (' + x + ')').join('')} x${i.qty} = Rs ${i.price * i.qty}`).join('; '));
      nf.append('total', 'Rs ' + order.total);
      fetch('/', { method: 'POST', body: nf }).catch(() => {});
    } catch (e) {}

    // WhatsApp message from the CUSTOMER's own WhatsApp
    const lines = [
      '*New Order — ' + settings().storeName + '*',
      'Order ID: ' + id,
      '--------------------------',
      ...items.map((it, n) => `${n + 1}. ${it.name}${[it.color, it.size].filter(Boolean).map(x => ' (' + x + ')').join('')} x${it.qty} — Rs ${(it.price * it.qty).toLocaleString('en-PK')}`),
      '--------------------------',
      'Subtotal: Rs ' + order.subtotal.toLocaleString('en-PK'),
      'Delivery (' + cust.city + '): Rs ' + fee.toLocaleString('en-PK'),
      '*Total: Rs ' + order.total.toLocaleString('en-PK') + '*',
      '--------------------------',
      'Name: ' + cust.name,
      'Phone: ' + cust.phone,
      'Address: ' + fullAddress(cust)
    ];
    const waURL = 'https://wa.me/' + settings().whatsapp + '?text=' + encodeURIComponent(lines.join('\n'));

    pxEvent('CompletePayment', {
      content_id: items.map(i => i.pid).join(','),
      value: order.total, currency: 'PKR', num_items: items.reduce((a, i) => a + i.qty, 0)
    });
    cart = []; saveCart(); updateCartBadge();
    sessionStorage.setItem('altejarat_last_order', id);
    window.open(waURL, '_blank');
    nav('/success');
  }

  function vSuccess() {
    const id = sessionStorage.getItem('altejarat_last_order') || '';
    app.innerHTML = `
      <div class="wrap"><div class="success">
        <div class="tick">✅</div>
        <h1>Shukriya! Order mil gaya.</h1>
        <p>Aapki Order ID hai:</p>
        <div class="oid">${DB.esc(id)}</div>
        <p class="sub">Hum WhatsApp par rabta karke order confirm karenge.<br>Order ID sambhal kar rakhein.</p>
        <a class="btn btn-green" href="/shop" style="margin-top:14px">Continue Shopping</a>
      </div></div>`;
  }

  /* ---------- info pages ---------- */
  const waLink = msg => 'https://wa.me/' + settings().whatsapp + '?text=' + encodeURIComponent(msg);

  const PAGES = {
    about: { title: 'About Us', body: `
      <h2>Assalam-o-Alaikum! Welcome to Al Tejarat.</h2>
      <p>Al Tejarat is a Pakistani online general store — <strong>Everything You Need, Every Day!</strong> From stylish handbags and footwear to beauty and health essentials, we bring quality products to your doorstep at honest prices.</p>
      <h2>Why shop with us?</h2>
      <ul>
        <li><strong>Cash on Delivery</strong> — pehle product check karein, phir payment.</li>
        <li><strong>Quality checked</strong> — har product dispatch se pehle verify hota hai.</li>
        <li><strong>Fast delivery</strong> — 3–5 working days, all over Pakistan.</li>
        <li><strong>WhatsApp support</strong> — order se lekar delivery tak, hum aapke saath.</li>
      </ul>
      <h2>Our promise</h2>
      <p>Jo product aap dekhte hain, wahi aapko milta hai. Clear photos, honest prices, aur no hidden charges — yehi Al Tejarat ka waada hai.</p>` },

    contact: { title: 'Contact Us', body: `
      <h2>Hum se rabta karein</h2>
      <p>Koi sawal ho — product, order, ya delivery ke baare mein — WhatsApp par message karein, hum jald jawab denge.</p>
      <div class="contact-grid">
        <div class="contact-card">
          <div class="big">💬</div><h3>WhatsApp</h3>
          <p>0334 8954786<br>Mon–Sat, 9am – 9pm</p>
          <a class="btn btn-wa" style="width:auto;padding:12px 28px" target="_blank" rel="noopener" data-wa-chat>Chat Karein</a>
        </div>
        <div class="contact-card">
          <div class="big">🧾</div><h3>Order Help</h3>
          <p>Apne order ka status maloom karna ho to apni <strong>Order ID</strong> (jaise AT-0001) likh kar bhejein.</p>
          <a class="btn btn-green" style="padding:12px 28px" href="/shop">Shop Karein</a>
        </div>
      </div>` },

    privacy: { title: 'Privacy Policy', updated: 'Last updated: October 2026', body: `
      <h2>1. Hum kya data lete hain</h2>
      <p>Order ke liye hum sirf zaroori maloomat lete hain: <strong>aapka naam, phone number, aur delivery address</strong>. Ye maloomat sirf aapka order deliver karne ke liye use hoti hai.</p>
      <h2>2. Data share nahi hota</h2>
      <p>Hum aapki personal maloomat <strong>kisi teesre fareeq ko bechte ya share nahi karte</strong> — siwaye courier/delivery partner ke, jise parcel pohanchane ke liye address chahiye hota hai.</p>
      <h2>3. WhatsApp messages</h2>
      <p>WhatsApp par bheje gaye order messages aapke aur hamare darmiyan rehte hain, order record ke tor par.</p>
      <h2>4. Aapke huqooq</h2>
      <p>Agar aap apna data delete karwana chahte hain to WhatsApp par rabta karein — hum aapka record hata denge.</p>` },

    refund: { title: 'Refund Policy', updated: 'Last updated: October 2026', body: `
      <div class="policy-note"><b>⚠️ Ahem:</b> Al Tejarat par <b>tamam sales final hain</b> — hum <b>return, refund, ya exchange nahi karte</b>.</div>
      <h2>1. No Return, No Refund</h2>
      <p>Order karne se pehle product ki <strong>photos, description, color aur price ghor se parh lein</strong>. Ek baar order confirm ho jaye to usay cancel, return ya refund nahi kiya ja sakta.</p>
      <h2>2. Ghalat ya kharab item mile to?</h2>
      <p>Agar aapko <strong>ghalat ya toota-phoota</strong> item mil jaye to <strong>24 ghante ke andar</strong> WhatsApp par rabta karein aur unboxing video bhejein — hum masla zaroor hal karenge.</p>
      <h2>3. Order se pehle tasalli</h2>
      <p>Koi confusion ho to order karne se pehle WhatsApp par pooch lein — hum khushi se jawab denge.</p>` },

    shipping: { title: 'Shipping Policy', updated: 'Last updated: October 2026', body: `
      <h2>1. Delivery time</h2>
      <p>Orders <strong>3–5 working days</strong> mein deliver ho jate hain (Sunday off hota hai).</p>
      <h2>2. Delivery charges</h2>
      <ul>
        <li><strong>Lahore:</strong> Rs 250</li>
        <li><strong>Out of city:</strong> Rs 300 – 350</li>
      </ul>
      <p>Delivery charges order total mein pehle se shamil hote hain — koi hidden charges nahi.</p>
      <h2>3. Cash on Delivery</h2>
      <p>Payment parcel milne par cash mein hogi. Baraye meherbani parcel lete waqt raqam tayyar rakhein.</p>
      <h2>4. Order tracking</h2>
      <p>Apne order ka status maloom karne ke liye apni <strong>Order ID</strong> WhatsApp par bhejein.</p>` },

    terms: { title: 'Terms of Service', updated: 'Last updated: October 2026', body: `
      <h2>1. Prices</h2>
      <p>Tamam prices <strong>Pakistani Rupees (Rs)</strong> mein hain. Prices baghair notice ke change ho sakti hain, lekin confirm order ki price nahi badlegi.</p>
      <h2>2. Product images</h2>
      <p>Hum asli product photos dikhane ki poori koshish karte hain; screen settings ki wajah se <strong>color mein halka farq</strong> ho sakta hai.</p>
      <h2>3. Order confirmation</h2>
      <p>WhatsApp par order bhejne ke baad hum aap se rabta karke order <strong>confirm</strong> karenge — confirmation ke baghair order dispatch nahi hoga.</p>
      <h2>4. Fair use</h2>
      <p>Ghalat maloomat de kar order karna ya system ka ghalat istemal mana hai. Aise orders cancel kiye ja sakte hain.</p>` }
  };

  function vPage(key) {
    const pg = PAGES[key];
    if (!pg) { nav('/'); return; }
    app.innerHTML = `
      <div class="page">
        <div class="crumbs"><a href="/">Home</a> / ${DB.esc(pg.title)}</div>
        <h1>${DB.esc(pg.title)}</h1>
        ${pg.updated ? `<div class="updated">${DB.esc(pg.updated)}</div>` : ''}
        <div class="prose">${pg.body}</div>
      </div>`;
    if (key === 'contact') {
      const chat = app.querySelector('[data-wa-chat]');
      if (chat) chat.href = waLink('Assalam-o-Alaikum! Mujhe Al Tejarat se maloomat chahiye.');
    }
  }

  /* ---------- router ---------- */
  function currentPath() {
    let p = location.pathname || '/';
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }
  function nav(p) { history.pushState({}, '', p); route(); }
  function route() {
    const h = currentPath();
    const links = [...document.querySelectorAll('[data-nav]')];
    const exact = links.find(a => a.getAttribute('href') === h);
    links.forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('on', exact ? a === exact : (href !== '/' && h.startsWith(href)));
    });
    closeCart();
    window.scrollTo(0, 0);
    initPixel();
    pxEvent('PageView');
    if (h.startsWith('/product/')) vProduct(h.split('/')[2]);
    else if (h.startsWith('/shop/')) vShop(decodeURIComponent(h.split('/')[2] || 'all'));
    else if (h === '/shop') vShop();
    else if (h === '/wishlist') vWishlist();
    else if (h.startsWith('/checkout')) vCheckout();
    else if (h.startsWith('/success')) vSuccess();
    else if (['/about', '/contact', '/privacy', '/refund', '/shipping', '/terms'].includes(h)) vPage(h.slice(1));
    else vHome();
  }
  // internal links -> SPA navigation (no page reload)
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="/"]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = a.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    if (href !== currentPath()) nav(href);
    else { closeCart(); window.scrollTo(0, 0); }
  });
  document.getElementById('wishBtn').onclick = () => nav('/wishlist');
  renderSocial();
  window.addEventListener('popstate', route);
  updateCartBadge();
  updateWishBadge();
  renderCatNav();
  route();
})();
