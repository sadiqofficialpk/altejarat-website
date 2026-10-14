/* Al Tejarat PRO — Admin Panel */
(function () {
'use strict';

const $ = s => document.querySelector(s);
const app = document.getElementById('admin-app');
let curTab = 'dash';
let dashRange = '7d';
let profitRange = '30d';
let prodSearch = '', prodCat = 'all';
let ordStatus = 'all', ordQ = '';

const esc = s => DB.esc(s);
const money = n => DB.money(n);
const fmtDate = ts => {
  try {
    return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch (e) { return ''; }
};
const effPrice = p => (p.salePrice && Number(p.salePrice) > 0 && Number(p.salePrice) < Number(p.price)) ? Number(p.salePrice) : Number(p.price);
const discountPct = p => {
  if (p.salePrice && Number(p.salePrice) > 0 && Number(p.salePrice) < Number(p.price))
    return Math.round((1 - Number(p.salePrice) / Number(p.price)) * 100);
  return 0;
};
function rangeTs(r) {
  const now = Date.now(), day = 864e5;
  if (r === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return [d.getTime(), null]; }
  if (r === '7d') return [now - 7 * day, null];
  if (r === '30d') return [now - 30 * day, null];
  return [null, null];
}
const inRange = (ts, from, to) => (from === null || ts >= from) && (to === null || ts < to);
const pillFor = st => {
  const m = { Pending: 'p-pending', Confirmed: 'p-confirmed', Shipped: 'p-shipped', Delivered: 'p-delivered', Cancelled: 'p-cancelled', active: 'p-active', inactive: 'p-inactive' };
  return `<span class="pill ${m[st] || 'p-inactive'}">${esc(st)}</span>`;
};

/* ================= boot ================= */
(async function boot() {
  try { await DB.init(); } catch (e) { console.warn('DB init failed:', e); }
  if (sessionStorage.getItem('altejarat_admin') === '1') showPanel();
  else renderLogin();
})();

/* ================= login ================= */
function renderLogin() {
  document.title = 'Al Tejarat — Admin Login';
  app.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">Al Tejarat</div>
      <p class="login-sub">Admin Panel</p>
      <label class="fl" for="pw">Password</label>
      <input class="fi" type="password" id="pw" placeholder="Enter admin password" autocomplete="current-password">
      <p class="err" id="loginErr" hidden></p>
      <button class="btn btn-green" id="loginBtn" style="width:100%; margin-top:14px">Log In</button>
    </div>
  </div>`;
  const go = () => {
    const v = $('#pw').value;
    const s = DB.getSettings();
    if (v === (s.adminPass || 'admin123')) {
      sessionStorage.setItem('altejarat_admin', '1');
      showPanel();
    } else {
      const e = $('#loginErr');
      e.hidden = false;
      e.textContent = 'Incorrect password. Please try again.';
    }
  };
  $('#loginBtn').onclick = go;
  $('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  setTimeout(() => { const p = $('#pw'); if (p) p.focus(); }, 60);
}

/* ================= shell ================= */
const TABS = [
  ['dash', 'Dashboard'], ['products', 'Products'], ['categories', 'Categories'],
  ['orders', 'Orders'], ['reviews', 'Reviews'], ['coupons', 'Coupons'],
  ['flash', 'Flash Sale'], ['profit', 'Profit'], ['content', 'Content'], ['settings', 'Settings']
];

function showPanel() {
  document.title = 'Al Tejarat — Admin';
  app.innerHTML = `
  <div class="admin-shell">
    <aside class="sidebar" id="sidebar">
      <div class="side-logo">Al Tejarat<span>Admin Panel</span></div>
      <nav class="side-nav">
        ${TABS.map(([k, label]) => `<button data-tab="${k}" class="${k === curTab ? 'on' : ''}">${esc(label)}${k === 'orders' ? '<span class="nav-badge" id="navOrdersBadge" hidden></span>' : ''}</button>`).join('')}
      </nav>
      <div class="side-foot"><button id="logoutBtn">Log Out</button></div>
    </aside>
    <div class="main">
      <div class="topbar">
        <button class="ham" id="hamBtn" aria-label="Menu">☰</button>
        <span class="cloud" id="cloudBadge"></span>
        <span class="top-spacer"></span>
        <a href="/" class="top-link" target="_blank" rel="noopener">View Store ↗</a>
      </div>
      <div class="page" id="page"></div>
    </div>
  </div>
  <div class="modal-ov" id="modalOv" hidden><div class="modal" id="modalBox"></div></div>
  <div class="toast-wrap" id="toasts"></div>`;

  document.querySelectorAll('.side-nav button').forEach(b => {
    b.onclick = () => { go(b.dataset.tab); $('#sidebar').classList.remove('open'); const sc = $('#scrim'); if (sc) sc.remove(); };
  });
  $('#logoutBtn').onclick = () => { sessionStorage.removeItem('altejarat_admin'); location.reload(); };
  $('#hamBtn').onclick = () => {
    const sb = $('#sidebar');
    sb.classList.toggle('open');
    if (sb.classList.contains('open')) {
      const d = document.createElement('div');
      d.className = 'scrim'; d.id = 'scrim';
      d.onclick = () => { sb.classList.remove('open'); d.remove(); };
      document.body.appendChild(d);
    } else { const sc = $('#scrim'); if (sc) sc.remove(); }
  };
  const cb = $('#cloudBadge');
  cb.textContent = DB.isCloud() ? 'Cloud connected' : 'Local mode';
  cb.classList.toggle('off', !DB.isCloud());

  // notification permission (after login = user gesture)
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}

  // realtime order updates
  DB.onOrdersChanged(() => {
    refreshBadges();
    checkNewOrders();
    if (curTab === 'orders' || curTab === 'dash') go(curTab, true);
  });

  go('dash');
}

function go(tab, soft) {
  curTab = tab;
  document.querySelectorAll('.side-nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ({ dash: vDash, products: vProducts, categories: vCategories, orders: vOrders, reviews: vReviews, coupons: vCoupons, flash: vFlash, profit: vProfit, content: vContent, settings: vSettings })[tab]();
  if (!soft) window.scrollTo(0, 0);
}

function refreshBadges() {
  const n = DB.newOrderCount();
  const b = $('#navOrdersBadge');
  if (b) { b.hidden = n === 0; b.textContent = n; }
}

/* ================= notifications ================= */
let knownOrderIds = null;
function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 0.28, 0.56].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      const s = ctx.currentTime + t;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.35, s + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
      o.start(s); o.stop(s + 0.25);
    });
  } catch (e) {}
}
function toast(html, cls, ms) {
  const box = $('#toasts');
  if (!box) return null;
  const t = document.createElement('div');
  t.className = 'toast ' + (cls || '');
  t.innerHTML = html;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms || 7000);
  return t;
}
function notifyNewOrder(o) {
  beep();
  const t = toast(`<b>New order ${esc(o.id)}</b><br>${esc((o.customer && o.customer.name) || '')} — ${money(o.total)}<br><small>Click to view orders</small>`, 't-green', 9000);
  if (t) { t.style.cursor = 'pointer'; t.onclick = () => { t.remove(); go('orders'); }; }
  try {
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification('New order ' + o.id, { body: ((o.customer && o.customer.name) || '') + ' — ' + money(o.total) });
  } catch (e) {}
  try {
    const orig = document.title;
    document.title = '🔔 New order ' + o.id + ' — Al Tejarat Admin';
    clearTimeout(window.__titleT);
    window.__titleT = setTimeout(() => { document.title = orig; }, 12000);
  } catch (e) {}
}
function checkNewOrders() {
  const orders = DB.getOrders();
  const ids = new Set(orders.map(o => o.id));
  if (knownOrderIds === null) { knownOrderIds = ids; return; } // first load: silent
  orders.filter(o => !knownOrderIds.has(o.id)).forEach(notifyNewOrder);
  knownOrderIds = ids;
}

/* ================= modal helpers ================= */
function openModal(html, wide) {
  const ov = $('#modalOv');
  ov.hidden = false;
  const box = $('#modalBox');
  box.classList.toggle('wide', !!wide);
  box.innerHTML = html;
  document.body.style.overflow = 'hidden';
  ov.onclick = e => { if (e.target === ov) closeModal(); };
}
function closeModal() {
  $('#modalOv').hidden = true;
  $('#modalBox').innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { const ov = $('#modalOv'); if (e.key === 'Escape' && ov && !ov.hidden) closeModal(); });
function promptModal(title, label, initial) {
  return new Promise(resolve => {
    openModal(`
      <div class="modal-head"><h2>${esc(title)}</h2><button class="modal-x" id="mX">✕</button></div>
      <label class="fl">${esc(label)}</label>
      <input class="fi" id="mVal" value="${esc(initial || '')}">
      <div class="modal-foot">
        <button class="btn btn-ghost" id="mCancel">Cancel</button>
        <button class="btn btn-green" id="mOk">Save</button>
      </div>`);
    const done = v => { closeModal(); resolve(v); };
    $('#mX').onclick = () => done(null);
    $('#mCancel').onclick = () => done(null);
    $('#mOk').onclick = () => done($('#mVal').value.trim() || null);
    setTimeout(() => $('#mVal').focus(), 60);
  });
}

/* ================= dashboard ================= */
function vDash() {
  const ranges = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']];
  const [from, to] = rangeTs(dashRange);
  const stats = DB.profitStats(from, to);
  const orders = DB.getOrders().filter(o => inRange(new Date(o.date).getTime(), from, to));
  const pending = DB.getOrders().filter(o => o.status === 'Pending').length;
  const lowStock = DB.getProducts().filter(p => (p.stock || 0) <= 5 && (p.status || 'active') === 'active');
  const recent = DB.newFirst(DB.getOrders().slice()).slice(0, 8);

  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><p class="sub">Store overview</p></div></div>
    <div class="range-pills">${ranges.map(([k, l]) => `<button data-r="${k}" class="${k === dashRange ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="cards">
      <div class="stat-card"><div class="k">Revenue</div><div class="v green">${money(stats.revenue)}</div><div class="s">${orders.length} orders in range</div></div>
      <div class="stat-card"><div class="k">Orders</div><div class="v">${orders.length}</div><div class="s">${pending} pending overall</div></div>
      <div class="stat-card"><div class="k">Pending Orders</div><div class="v ${pending ? 'red' : ''}">${pending}</div><div class="s">Need confirmation</div></div>
      <div class="stat-card"><div class="k">Low Stock</div><div class="v ${lowStock.length ? 'red' : ''}">${lowStock.length}</div><div class="s">Products at 5 or fewer units</div></div>
    </div>
    <div class="card">
      <h3>Recent Orders</h3>
      ${recent.length ? `<div class="table-wrap"><table class="tbl">
        <tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>
        ${recent.map(o => `<tr>
          <td><b>${esc(o.id)}</b></td><td class="mut">${esc(fmtDate(o.date))}</td>
          <td>${esc(o.customer.name)}<br><span class="mut">${esc(o.customer.city || '')}</span></td>
          <td>${(o.items || []).length}</td><td><b>${money(o.total)}</b></td>
          <td>${pillFor(o.status)}</td>
        </tr>`).join('')}
      </table></div>` : `<div class="empty"><b>No orders yet</b>New orders will appear here.</div>`}
    </div>
    <div class="card">
      <h3>Low Stock Products</h3>
      ${lowStock.length ? `<div class="table-wrap"><table class="tbl">
        <tr><th></th><th>Product</th><th>Stock</th><th></th></tr>
        ${lowStock.map(p => `<tr>
          <td><img class="thumb" src="${esc(DB.productImage(p))}" alt=""></td>
          <td><b>${esc(p.name)}</b></td>
          <td><b style="color:var(--red)">${p.stock || 0}</b></td>
          <td><button class="icon-btn" data-edit="${esc(p.id)}">Edit</button></td>
        </tr>`).join('')}
      </table></div>` : `<div class="empty"><b>All stocked up</b>No products are running low.</div>`}
    </div>`;

  document.querySelectorAll('.range-pills button').forEach(b => b.onclick = () => { dashRange = b.dataset.r; vDash(); });
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => productModal(b.dataset.edit));
}

/* ================= products ================= */
function vProducts() {
  const cats = DB.getCategories();
  let list = DB.newFirst(DB.getProducts().slice());
  if (prodCat !== 'all') list = list.filter(p => p.category === prodCat);
  if (prodSearch) {
    const q = prodSearch.toLowerCase();
    list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q));
  }
  $('#page').innerHTML = `
    <div class="page-head">
      <div><h1>Products</h1><p class="sub">${list.length} of ${DB.getProducts().length} products</p></div>
      <button class="btn btn-green" id="addProd">+ Add Product</button>
    </div>
    <div class="toolbar">
      <input class="fi grow" id="pq" placeholder="Search products…" value="${esc(prodSearch)}">
      <select class="fi" id="pcat">
        <option value="all">All categories</option>
        ${cats.map(c => `<option value="${esc(c)}" ${c === prodCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    ${list.length ? `<div class="table-wrap"><table class="tbl">
      <tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
      ${list.map(p => {
        const pct = discountPct(p);
        return `<tr>
        <td><img class="thumb" src="${esc(DB.productImage(p))}" alt=""></td>
        <td><b>${esc(p.name)}</b>${p.featured ? ' <span class="pill p-confirmed">Featured</span>' : ''}<br><span class="mut">${esc(p.id)}</span></td>
        <td>${esc(p.category || '—')}</td>
        <td><b>${money(effPrice(p))}</b>${pct ? `<br><span class="mut"><s>${money(p.price)}</s> <span style="color:var(--red);font-weight:700">-${pct}%</span></span>` : ''}</td>
        <td><b style="${(p.stock || 0) <= 5 ? 'color:var(--red)' : ''}">${p.stock || 0}</b></td>
        <td><button class="icon-btn" data-toggle="${esc(p.id)}">${pillFor((p.status || 'active') === 'active' ? 'active' : 'inactive')}</button></td>
        <td style="white-space:nowrap">
          <button class="icon-btn" data-edit="${esc(p.id)}">Edit</button>
          <button class="icon-btn danger" data-del="${esc(p.id)}">Delete</button>
        </td></tr>`;
      }).join('')}
    </table></div>` : `<div class="empty"><b>No products found</b>Try a different search or add a new product.</div>`}`;

  $('#addProd').onclick = () => productModal(null);
  $('#pq').addEventListener('input', e => { prodSearch = e.target.value; vProducts(); const q = $('#pq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
  $('#pcat').onchange = e => { prodCat = e.target.value; vProducts(); };
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => productModal(b.dataset.edit));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const p = DB.getProduct(b.dataset.del);
    if (!p) return;
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try { await DB.deleteProduct(p.id); toast('Product deleted.', 't-green'); vProducts(); }
    catch (e) { toast('Delete failed: ' + esc(e.message || e), 't-red'); }
  });
  document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
    const p = DB.getProduct(b.dataset.toggle);
    if (!p) return;
    p.status = (p.status || 'active') === 'active' ? 'inactive' : 'active';
    try { await DB.saveProduct(p); vProducts(); }
    catch (e) { toast('Failed: ' + esc(e.message || e), 't-red'); }
  });
}

function detectColorsFromName(name) {
  const w = String(name || '').toLowerCase();
  return DB.COLOR_PALETTE.filter(c => w.includes(c.name.toLowerCase())).map(c => c.name);
}

function productModal(pid) {
  const p = pid ? DB.getProduct(pid) : null;
  const cats = DB.getCategories();
  let imgs = p ? (p.images && p.images.length ? p.images.slice() : (p.image ? [p.image] : [])) : [];
  let colorRows = p ? DB.normColors(p).map(c => ({ name: c.name, img: c.img || '' })) : [];

  const renderImgs = () => {
    $('#pmImgs').innerHTML = imgs.map((u, i) => `
      <div class="thumb"><img src="${esc(u)}" alt="">
        <button class="rm" data-ri="${i}" title="Remove">✕</button>
        ${i === 0 ? '<span class="main-tag">MAIN</span>' : ''}
      </div>`).join('') || '<span class="mut" style="font-size:12px">No images yet.</span>';
    document.querySelectorAll('#pmImgs [data-ri]').forEach(b => b.onclick = () => { imgs.splice(Number(b.dataset.ri), 1); renderImgs(); });
  };
  const renderColors = () => {
    $('#pmColors').innerHTML = colorRows.map((c, i) => `
      <div class="color-row">
        ${c.img ? `<img src="${esc(c.img)}" alt="">` : `<span style="width:40px;height:40px;border-radius:8px;background:#F2F4F2;flex-shrink:0"></span>`}
        <input class="fi cname" data-ci="${i}" placeholder="Color name" value="${esc(c.name)}">
        <input class="fi curl" data-cu="${i}" placeholder="Image URL (optional)" value="${esc(c.img)}">
        <button class="icon-btn" data-cfile="${i}">Upload</button>
        <button class="icon-btn danger" data-cdel="${i}">✕</button>
        <input type="file" accept="image/*" data-cf="${i}" hidden>
      </div>`).join('') || '<span class="mut" style="font-size:12px">No colors. Leave empty for products without colors.</span>';
    document.querySelectorAll('#pmColors .cname').forEach(inp => inp.oninput = () => { colorRows[Number(inp.dataset.ci)].name = inp.value; });
    document.querySelectorAll('#pmColors .curl').forEach(inp => inp.oninput = () => { colorRows[Number(inp.dataset.cu)].img = inp.value.trim(); renderColors(); });
    document.querySelectorAll('#pmColors [data-cdel]').forEach(b => b.onclick = () => { colorRows.splice(Number(b.dataset.cdel), 1); renderColors(); });
    document.querySelectorAll('#pmColors [data-cfile]').forEach(b => b.onclick = () => document.querySelector(`[data-cf="${b.dataset.cfile}"]`).click());
    document.querySelectorAll('#pmColors [data-cf]').forEach(fi => fi.onchange = async () => {
      const f = fi.files[0]; if (!f) return;
      fi.value = '';
      const i = Number(fi.dataset.cf);
      $('#pmMsg').textContent = 'Uploading color image…';
      try {
        const url = await DB.uploadImage(f, 'products');
        colorRows[i].img = url;
        $('#pmMsg').textContent = '';
        renderColors();
      } catch (e) { $('#pmMsg').textContent = 'Upload failed: ' + (e.message || e); }
    });
  };

  openModal(`
    <div class="modal-head"><h2>${p ? 'Edit Product' : 'Add Product'}</h2><button class="modal-x" id="mX">✕</button></div>
    <div class="frow">
      <div><label class="fl">Product Name *</label><input class="fi" id="pmName" value="${esc(p ? p.name : '')}" placeholder="e.g. Leather Handbag"></div>
      <div><label class="fl">Category</label><select class="fi" id="pmCat">
        <option value="">— Select —</option>
        ${cats.map(c => `<option ${p && p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select></div>
    </div>
    <div class="frow-3">
      <div><label class="fl">Price (Rs) *</label><input class="fi" id="pmPrice" type="number" min="0" value="${p ? p.price : ''}" placeholder="1999"></div>
      <div><label class="fl">Sale Price (Rs) <small>optional</small></label><input class="fi" id="pmSale" type="number" min="0" value="${p && p.salePrice ? p.salePrice : ''}" placeholder="1499"></div>
      <div><label class="fl">Stock</label><input class="fi" id="pmStock" type="number" min="0" value="${p ? (p.stock || 0) : 10}"></div>
    </div>
    <div class="frow">
      <div><label class="fl">Status</label><select class="fi" id="pmStatus">
        <option value="active" ${!p || (p.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${p && p.status === 'inactive' ? 'selected' : ''}>Inactive</option>
      </select></div>
      <div><label class="fl">&nbsp;</label><label class="check-row"><input type="checkbox" id="pmFeat" ${p && p.featured ? 'checked' : ''}> Featured (Best Sellers)</label></div>
    </div>
    <div><label class="fl">Description</label><textarea class="fi" id="pmDesc" rows="3" placeholder="Product details…">${esc(p ? (p.description || '') : '')}</textarea></div>
    <div class="section-title">Images <span class="hint" style="font-weight:400;color:var(--mut);font-size:12px">— first image is the main one</span></div>
    <div class="thumbs" id="pmImgs"></div>
    <div class="frow">
      <div><input type="file" id="pmFiles" accept="image/*" multiple class="fi"></div>
      <div><div style="display:flex;gap:8px"><input class="fi" id="pmUrl" placeholder="Paste image URL…"><button class="btn btn-ghost btn-sm" id="pmAddUrl">Add</button></div></div>
    </div>
    <div class="section-title">Colors <span class="hint" style="font-weight:400;color:var(--mut);font-size:12px">— optional, each with its own image</span></div>
    <div id="pmColors"></div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-ghost btn-sm" id="pmAddColor">+ Add Color</button>
      <button class="btn btn-ghost btn-sm" id="pmDetect">Auto-detect from name</button>
    </div>
    <div class="section-title">Sizes <span class="hint" style="font-weight:400;color:var(--mut);font-size:12px">— comma separated, optional</span></div>
    <input class="fi" id="pmSizes" placeholder="e.g. S, M, L, XL" value="${esc(p && p.sizes ? p.sizes.join(', ') : '')}">
    <p class="msg" id="pmMsg"></p>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
      <button class="btn btn-green" id="pmSave">${p ? 'Save Changes' : 'Add Product'}</button>
    </div>`, true);

  $('#mX').onclick = closeModal;
  $('#mCancel').onclick = closeModal;
  renderImgs(); renderColors();

  $('#pmFiles').onchange = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    $('#pmMsg').textContent = 'Uploading images…';
    try {
      for (const f of files) imgs.push(await DB.uploadImage(f, 'products'));
      $('#pmMsg').textContent = '';
      renderImgs();
    } catch (err) { $('#pmMsg').textContent = 'Upload failed: ' + (err.message || err); }
  };
  $('#pmAddUrl').onclick = () => {
    const u = $('#pmUrl').value.trim();
    if (!u) return;
    imgs.push(u); $('#pmUrl').value = '';
    renderImgs();
  };
  $('#pmAddColor').onclick = () => { colorRows.push({ name: '', img: '' }); renderColors(); };
  $('#pmDetect').onclick = () => {
    const found = detectColorsFromName($('#pmName').value);
    const have = new Set(colorRows.map(c => c.name.toLowerCase()));
    found.forEach(n => { if (!have.has(n.toLowerCase())) colorRows.push({ name: n, img: '' }); });
    renderColors();
    $('#pmMsg').textContent = found.length ? `Detected: ${found.join(', ')}` : 'No color names found in the product name.';
  };

  $('#pmSave').onclick = async () => {
    const name = $('#pmName').value.trim();
    const price = Number($('#pmPrice').value);
    const msg = $('#pmMsg');
    if (!name) { msg.textContent = 'Product name is required.'; return; }
    if (!(price > 0)) { msg.textContent = 'Enter a valid price.'; return; }
    const saleRaw = $('#pmSale').value.trim();
    const sale = saleRaw === '' ? null : Number(saleRaw);
    const data = {
      id: p ? p.id : 'p' + Date.now().toString(36),
      name,
      category: $('#pmCat').value,
      price,
      stock: Math.max(0, Math.floor(Number($('#pmStock').value) || 0)),
      status: $('#pmStatus').value,
      featured: $('#pmFeat').checked,
      description: $('#pmDesc').value.trim(),
      image: imgs[0] || '',
      images: imgs.slice(),
      colors: DB.normColors({ colors: colorRows.map(r => ({ name: r.name.trim(), img: r.img.trim() })) }),
      sizes: $('#pmSizes').value.split(',').map(x => x.trim()).filter(Boolean)
    };
    if (sale && sale > 0 && sale < price) data.salePrice = sale;
    msg.textContent = 'Saving…';
    $('#pmSave').disabled = true;
    try {
      await DB.saveProduct(data);
      closeModal();
      toast(p ? 'Product updated.' : 'Product added.', 't-green');
      vProducts();
    } catch (e) {
      msg.textContent = 'Save failed: ' + (e.message || e);
      $('#pmSave').disabled = false;
    }
  };
}

/* ================= categories ================= */
function vCategories() {
  const cats = DB.getCategories();
  const prods = DB.getProducts();
  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Categories</h1><p class="sub">${cats.length} categories</p></div></div>
    <div class="card">
      <h3>Add Category</h3>
      <div style="display:flex;gap:10px">
        <input class="fi" id="catNew" placeholder="Category name…" style="max-width:320px">
        <button class="btn btn-green" id="catAdd">Add</button>
      </div>
      <p class="msg" id="catMsg"></p>
    </div>
    <div class="card">
      <h3>All Categories</h3>
      ${cats.length ? `<div class="table-wrap"><table class="tbl">
        <tr><th></th><th>Name</th><th>Products</th><th>Image</th><th>Order</th><th></th></tr>
        ${cats.map(c => {
          const img = DB.getCategoryImage(c);
          const n = prods.filter(p => p.category === c).length;
          return `<tr>
          <td>${img ? `<img class="thumb" src="${esc(img)}" alt="">` : '<span class="mut">—</span>'}</td>
          <td><b>${esc(c)}</b></td><td>${n}</td>
          <td><button class="icon-btn" data-cimg="${esc(c)}">${img ? 'Change' : 'Upload'}</button></td>
          <td style="white-space:nowrap">
            <button class="icon-btn" data-up="${esc(c)}" title="Move up">↑</button>
            <button class="icon-btn" data-dn="${esc(c)}" title="Move down">↓</button>
          </td>
          <td style="white-space:nowrap">
            <button class="icon-btn" data-ren="${esc(c)}">Rename</button>
            <button class="icon-btn danger" data-cdel="${esc(c)}">Delete</button>
          </td></tr>`;
        }).join('')}
      </table></div>` : `<div class="empty"><b>No categories yet</b>Add your first category above.</div>`}
    </div>`;

  const msg = t => { $('#catMsg').textContent = t; };
  $('#catAdd').onclick = async () => {
    const v = $('#catNew').value.trim();
    if (!v) return;
    const ok = await DB.addCategory(v);
    if (ok === false) { msg('Category already exists.'); return; }
    $('#catNew').value = '';
    vCategories();
  };
  document.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => { await DB.moveCategory(b.dataset.up, -1); vCategories(); });
  document.querySelectorAll('[data-dn]').forEach(b => b.onclick = async () => { await DB.moveCategory(b.dataset.dn, 1); vCategories(); });
  document.querySelectorAll('[data-ren]').forEach(b => b.onclick = async () => {
    const v = await promptModal('Rename Category', 'New name', b.dataset.ren);
    if (!v || v === b.dataset.ren) return;
    const ok = await DB.renameCategory(b.dataset.ren, v);
    if (ok === false) msg('A category with that name already exists.');
    vCategories();
  });
  document.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
    const n = prods.filter(p => p.category === b.dataset.cdel).length;
    if (!confirm(`Delete category "${b.dataset.cdel}"?${n ? ` (${n} products will become uncategorized)` : ''}`)) return;
    await DB.deleteCategory(b.dataset.cdel);
    vCategories();
  });
  document.querySelectorAll('[data-cimg]').forEach(b => b.onclick = () => {
    openModal(`
      <div class="modal-head"><h2>Category Image — ${esc(b.dataset.cimg)}</h2><button class="modal-x" id="mX">✕</button></div>
      <label class="fl">Upload image</label>
      <input type="file" id="ciFile" accept="image/*" class="fi">
      <label class="fl" style="margin-top:12px">Or paste image URL</label>
      <div style="display:flex;gap:8px"><input class="fi" id="ciUrl" placeholder="https://…"><button class="btn btn-ghost btn-sm" id="ciUrlBtn">Set</button></div>
      <p class="msg" id="ciMsg"></p>`);
    $('#mX').onclick = closeModal;
    $('#ciFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      $('#ciMsg').textContent = 'Uploading…';
      try {
        const url = await DB.uploadImage(f, 'categories');
        await DB.setCategoryImage(b.dataset.cimg, url);
        closeModal(); vCategories();
      } catch (err) { $('#ciMsg').textContent = 'Upload failed: ' + (err.message || err); }
    };
    $('#ciUrlBtn').onclick = async () => {
      const u = $('#ciUrl').value.trim(); if (!u) return;
      await DB.setCategoryImage(b.dataset.cimg, u);
      closeModal(); vCategories();
    };
  });
}

/* ================= orders ================= */
function vOrders() {
  DB.markSeen();
  refreshBadges();
  const statuses = ['all', 'Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
  let list = DB.newFirst(DB.getOrders().slice());
  if (ordStatus !== 'all') list = list.filter(o => o.status === ordStatus);
  if (ordQ) {
    const q = ordQ.toLowerCase();
    list = list.filter(o => (o.id || '').toLowerCase().includes(q)
      || (o.customer.name || '').toLowerCase().includes(q)
      || (o.customer.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')));
  }
  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Orders</h1><p class="sub">${list.length} of ${DB.getOrders().length} orders</p></div></div>
    <div class="toolbar">
      <input class="fi grow" id="oq" placeholder="Search by order ID, name or phone…" value="${esc(ordQ)}">
      <select class="fi" id="ostat">
        ${statuses.map(s => `<option value="${s}" ${s === ordStatus ? 'selected' : ''}>${s === 'all' ? 'All statuses' : s}</option>`).join('')}
      </select>
    </div>
    ${list.length ? `<div class="table-wrap"><table class="tbl">
      <tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr>
      ${list.map(o => `<tr>
        <td><b>${esc(o.id)}</b>${o.coupon ? `<br><span class="mut">Coupon: ${esc(o.coupon)}</span>` : ''}</td>
        <td class="mut">${esc(fmtDate(o.date))}</td>
        <td>${esc(o.customer.name)}<br><span class="mut">${esc(o.customer.city || '')} · ${esc(o.customer.phone)}</span></td>
        <td>${(o.items || []).reduce((a, i) => a + (i.qty || 0), 0)}</td>
        <td><b>${money(o.total)}</b></td>
        <td>${pillFor(o.status)}</td>
        <td><button class="icon-btn" data-view="${esc(o.id)}">View</button></td>
      </tr>`).join('')}
    </table></div>` : `<div class="empty"><b>No orders found</b>Try a different filter or search.</div>`}`;

  $('#oq').addEventListener('input', e => { ordQ = e.target.value; vOrders(); const q = $('#oq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
  $('#ostat').onchange = e => { ordStatus = e.target.value; vOrders(); };
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => orderModal(b.dataset.view));
}

function orderModal(id) {
  const o = DB.getOrders().find(x => x.id === id);
  if (!o) return;
  const statuses = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
  const items = o.items || [];
  openModal(`
    <div class="modal-head"><h2>Order ${esc(o.id)}</h2><button class="modal-x" id="mX">✕</button></div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      ${pillFor(o.status)}
      <span class="mut" style="font-size:12.5px">${esc(fmtDate(o.date))}</span>
    </div>
    <dl class="kv">
      <dt>Customer</dt><dd>${esc(o.customer.name)}</dd>
      <dt>Phone</dt><dd>${esc(o.customer.phone)}</dd>
      <dt>Address</dt><dd>${esc([o.customer.address, o.customer.city].filter(Boolean).join(', '))}</dd>
      ${o.customer.notes ? `<dt>Notes</dt><dd>${esc(o.customer.notes)}</dd>` : ''}
    </dl>
    <div class="ord-items">
      ${items.map(i => `<div class="ord-item">
        ${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}
        <div><div class="nm">${esc(i.name)} × ${i.qty}</div>
        <div class="va">${[i.color, i.size].filter(Boolean).map(esc).join(' · ')}</div></div>
        <div class="pr">${money(i.price * i.qty)}</div>
      </div>`).join('')}
    </div>
    <div class="totals">
      <div class="tot-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
      ${o.discount ? `<div class="tot-row"><span>Discount${o.coupon ? ` (${esc(o.coupon)})` : ''}</span><span class="disc">−${money(o.discount)}</span></div>` : ''}
      <div class="tot-row"><span>Delivery</span><span>${money(o.delivery)}</span></div>
      <div class="tot-row grand"><span>Total</span><span>${money(o.total)}</span></div>
    </div>
    <div class="section-title">Update Status</div>
    <div class="frow" style="margin-bottom:0">
      <div><select class="fi" id="oStatus">${statuses.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><button class="btn btn-ghost no-print" id="oPrint" style="width:100%">Print</button></div>
    </div>
    <p class="msg" id="oMsg"></p>
    <div class="modal-foot"><button class="btn btn-ghost" id="mClose">Close</button></div>`, true);

  $('#mX').onclick = closeModal;
  $('#mClose').onclick = closeModal;
  $('#oPrint').onclick = () => window.print();
  $('#oStatus').onchange = async e => {
    const v = e.target.value;
    $('#oMsg').textContent = 'Updating…';
    try {
      await Promise.resolve(DB.setOrderStatus(o.id, v));
      $('#oMsg').textContent = 'Status updated.';
      $('#oMsg').className = 'msg ok';
      vOrders();
      orderModal(o.id);
    } catch (err) { $('#oMsg').textContent = 'Failed: ' + (err.message || err); $('#oMsg').className = 'msg bad'; }
  };
}

/* ================= reviews ================= */
async function vReviews() {
  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Reviews</h1><p class="sub">Customer product reviews</p></div></div>
    <div class="card"><div class="empty"><b>Loading reviews…</b></div></div>`;
  let revs = [];
  try { revs = await DB.getReviews(); }
  catch (e) { $('#page').innerHTML += ''; }
  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Reviews</h1><p class="sub">${revs.length} reviews</p></div></div>
    ${revs.length ? `<div class="table-wrap"><table class="tbl">
      <tr><th>Product</th><th>Customer</th><th>Rating</th><th>Review</th><th>Date</th><th></th></tr>
      ${revs.map(r => {
        const p = r.productId ? DB.getProduct(r.productId) : null;
        const stars = '★'.repeat(Math.round(r.rating || 0)) + '☆'.repeat(5 - Math.round(r.rating || 0));
        return `<tr>
        <td>${p ? `<b>${esc(p.name)}</b>` : `<span class="mut">${esc(r.productId || '—')}</span>`}</td>
        <td><b>${esc(r.name || 'Anonymous')}</b></td>
        <td><span class="stars">${stars}</span></td>
        <td style="max-width:320px">${esc(r.text || '')}${r.photo ? `<br><a href="${esc(r.photo)}" target="_blank" rel="noopener" style="font-size:12px">View photo</a>` : ''}</td>
        <td class="mut">${esc(fmtDate(r.createdAt))}</td>
        <td><button class="icon-btn danger" data-rdel="${esc(r.id)}" data-rpid="${esc(r.productId || '')}">Delete</button></td>
      </tr>`; }).join('')}
    </table></div>` : `<div class="card"><div class="empty"><b>No reviews yet</b>Customer reviews will appear here.</div></div>`}`;

  document.querySelectorAll('[data-rdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this review?')) return;
    try { await DB.deleteReview(b.dataset.rpid, b.dataset.rdel); vReviews(); toast('Review deleted.', 't-green'); }
    catch (e) { toast('Delete failed: ' + esc(e.message || e), 't-red'); }
  });
}

/* ================= coupons ================= */
function vCoupons() {
  const s = DB.getSettings();
  const list = s.coupons || [];
  $('#page').innerHTML = `
    <div class="page-head">
      <div><h1>Discount Coupons</h1><p class="sub">Promo codes customers can apply at checkout</p></div>
      <button class="btn btn-green" id="addCoupon">+ Add Coupon</button>
    </div>
    <div class="card">
      ${list.length ? `<div class="table-wrap"><table class="tbl">
        <tr><th>Code</th><th>Type</th><th>Value</th><th>Min. Subtotal</th><th>Active</th><th></th></tr>
        ${list.map((c, i) => `<tr>
          <td><b>${esc(c.code)}</b></td>
          <td>${c.type === 'percent' ? 'Percentage' : 'Flat amount'}</td>
          <td><b>${c.type === 'percent' ? esc(String(c.value)) + '%' : money(c.value)}</b></td>
          <td>${money(c.minSubtotal || 0)}</td>
          <td><label class="switch"><input type="checkbox" data-cact="${i}" ${c.active ? 'checked' : ''}><span class="sl"></span></label></td>
          <td style="white-space:nowrap">
            <button class="icon-btn" data-cedit="${i}">Edit</button>
            <button class="icon-btn danger" data-cdel="${i}">Delete</button>
          </td></tr>`).join('')}
      </table></div>` : `<div class="empty"><b>No coupons yet</b>Create your first discount code above.</div>`}
    </div>`;

  $('#addCoupon').onclick = () => couponModal(-1);
  document.querySelectorAll('[data-cedit]').forEach(b => b.onclick = () => couponModal(Number(b.dataset.cedit)));
  document.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
    const i = Number(b.dataset.cdel);
    const cur = (DB.getSettings().coupons || []).slice();
    if (!confirm(`Delete coupon "${cur[i].code}"?`)) return;
    cur.splice(i, 1);
    const ok = await DB.saveSettings({ coupons: cur });
    if (ok) { vCoupons(); toast('Coupon deleted.', 't-green'); }
    else toast('Save failed. Check your connection.', 't-red');
  });
  document.querySelectorAll('[data-cact]').forEach(t => t.onchange = async () => {
    const cur = (DB.getSettings().coupons || []).slice();
    cur[Number(t.dataset.cact)].active = t.checked;
    const ok = await DB.saveSettings({ coupons: cur });
    if (!ok) { toast('Save failed. Check your connection.', 't-red'); vCoupons(); }
  });
}

function couponModal(idx) {
  const list = DB.getSettings().coupons || [];
  const c = idx >= 0 ? list[idx] : { code: '', type: 'percent', value: 10, minSubtotal: 0, active: true };
  openModal(`
    <div class="modal-head"><h2>${idx >= 0 ? 'Edit Coupon' : 'Add Coupon'}</h2><button class="modal-x" id="mX">✕</button></div>
    <div class="frow">
      <div><label class="fl">Code *</label><input class="fi" id="cpCode" value="${esc(c.code)}" placeholder="EID10" style="text-transform:uppercase"></div>
      <div><label class="fl">Discount Type</label><select class="fi" id="cpType">
        <option value="percent" ${c.type === 'percent' ? 'selected' : ''}>Percentage (%)</option>
        <option value="flat" ${c.type === 'flat' ? 'selected' : ''}>Flat amount (Rs)</option>
      </select></div>
    </div>
    <div class="frow">
      <div><label class="fl">Value *</label><input class="fi" id="cpVal" type="number" min="0" value="${esc(String(c.value))}" placeholder="10"></div>
      <div><label class="fl">Min. Subtotal (Rs)</label><input class="fi" id="cpMin" type="number" min="0" value="${esc(String(c.minSubtotal || 0))}" placeholder="0"></div>
    </div>
    <label class="check-row"><input type="checkbox" id="cpActive" ${c.active ? 'checked' : ''}> Active</label>
    <p class="msg" id="cpMsg"></p>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
      <button class="btn btn-green" id="cpSave">Save Coupon</button>
    </div>`);
  $('#mX').onclick = closeModal;
  $('#mCancel').onclick = closeModal;
  $('#cpSave').onclick = async () => {
    const code = $('#cpCode').value.trim().toUpperCase();
    const value = Number($('#cpVal').value);
    const msg = $('#cpMsg');
    if (!code) { msg.textContent = 'Code is required.'; return; }
    if (!(value > 0)) { msg.textContent = 'Enter a valid value.'; return; }
    if ($('#cpType').value === 'percent' && value > 90) { msg.textContent = 'Percentage cannot exceed 90%.'; return; }
    const cur = (DB.getSettings().coupons || []).slice();
    const rec = {
      code,
      type: $('#cpType').value,
      value,
      minSubtotal: Math.max(0, Number($('#cpMin').value) || 0),
      active: $('#cpActive').checked
    };
    const dup = cur.findIndex((x, i) => x.code.toUpperCase() === code && i !== idx);
    if (dup >= 0) { msg.textContent = 'A coupon with this code already exists.'; return; }
    if (idx >= 0) cur[idx] = rec; else cur.push(rec);
    msg.textContent = 'Saving…';
    const ok = await DB.saveSettings({ coupons: cur });
    if (ok) { closeModal(); vCoupons(); toast('Coupon saved.', 't-green'); }
    else msg.textContent = 'Save failed. Check your connection and try again.';
  };
}

/* ================= flash sale ================= */
function vFlash() {
  const s = DB.getSettings();
  const f = s.flashSale || {};
  const saleProds = DB.getProducts().filter(p => (p.status || 'active') === 'active' && discountPct(p) > 0);
  const dtVal = f.endsAt ? String(f.endsAt).slice(0, 16) : '';
  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Flash Sale</h1><p class="sub">Limited-time sale banner on the home page</p></div></div>
    <div class="card">
      <div class="toggle-row"><label class="switch"><input type="checkbox" id="fsActive" ${f.active ? 'checked' : ''}><span class="sl"></span></label> Flash sale active</div>
      <div class="frow">
        <div><label class="fl">Sale Title</label><input class="fi" id="fsTitle" value="${esc(f.title || 'Flash Sale')}" placeholder="Flash Sale"></div>
        <div><label class="fl">Ends At</label><input class="fi" id="fsEnds" type="datetime-local" value="${esc(dtVal)}"></div>
      </div>
      <div class="lock">Products with a <b>sale price</b> appear in the flash sale automatically. Set sale prices in <b>Products</b>. Currently <b>${saleProds.length}</b> product(s) qualify.</div>
      <div class="mt"><button class="btn btn-green" id="fsSave">Save</button>
      <button class="btn btn-ghost" id="fsGo" style="margin-left:8px">Go to Products</button></div>
      <p class="msg" id="fsMsg"></p>
    </div>`;

  $('#fsGo').onclick = () => go('products');
  $('#fsSave').onclick = async () => {
    const ends = $('#fsEnds').value;
    const rec = { active: $('#fsActive').checked, title: $('#fsTitle').value.trim() || 'Flash Sale', endsAt: ends ? new Date(ends).toISOString() : '' };
    $('#fsMsg').textContent = 'Saving…';
    const ok = await DB.saveSettings({ flashSale: rec });
    $('#fsMsg').textContent = ok ? 'Flash sale settings saved.' : 'Save failed. Check your connection and try again.';
    $('#fsMsg').className = 'msg ' + (ok ? 'ok' : 'bad');
  };
}

/* ================= profit ================= */
function vProfit() {
  const ranges = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']];
  const [from, to] = rangeTs(profitRange);
  const st = DB.profitStats(from, to);
  const costs = DB.getCosts();
  const rows = Object.keys(st.perProduct).map(pid => {
    const r = st.perProduct[pid];
    const p = DB.getProduct(pid);
    const c = costs[pid];
    const hasC = c !== undefined && c !== '' && !isNaN(Number(c));
    const costTot = hasC ? Number(c) * r.units : null;
    return { pid, name: r.name || (p && p.name) || pid, units: r.units, revenue: r.revenue, cost: c, costTot, profit: hasC ? r.revenue - costTot : null };
  }).sort((a, b) => b.revenue - a.revenue);

  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Profit Report</h1><p class="sub">Admin only — never visible to customers</p></div></div>
    <div class="range-pills">${ranges.map(([k, l]) => `<button data-r="${k}" class="${k === profitRange ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="cards">
      <div class="stat-card"><div class="k">Revenue</div><div class="v green">${money(st.revenue)}</div><div class="s">${st.units} units sold</div></div>
      <div class="stat-card"><div class="k">Total Cost</div><div class="v">${st.cost === null ? '—' : money(st.cost)}</div><div class="s">Wholesale</div></div>
      <div class="stat-card"><div class="k">Profit</div><div class="v ${st.profit === null ? '' : (st.profit >= 0 ? 'green' : 'red')}">${st.profit === null ? '—' : money(st.profit)}</div><div class="s">${st.profit === null ? 'Set all wholesale costs' : 'Revenue − cost'}</div></div>
    </div>
    ${!st.allHaveCost ? `<div class="lock">Set the wholesale cost for every product below to unlock total profit figures.</div>` : ''}
    <div class="card">
      <h3>Per-Product Profit</h3>
      ${rows.length ? `<div class="table-wrap"><table class="tbl">
        <tr><th>Product</th><th>Units</th><th>Revenue</th><th>Wholesale Cost (Rs)</th><th>Cost Total</th><th>Profit</th></tr>
        ${rows.map(r => `<tr>
          <td><b>${esc(r.name)}</b><br><span class="mut">${esc(r.pid)}</span></td>
          <td>${r.units}</td><td><b>${money(r.revenue)}</b></td>
          <td><input class="fi" type="number" min="0" data-cost="${esc(r.pid)}" value="${r.cost === undefined ? '' : esc(String(r.cost))}" placeholder="0" style="max-width:130px"></td>
          <td>${r.costTot === null ? '<span class="mut">—</span>' : money(r.costTot)}</td>
          <td>${r.profit === null ? '<span class="mut">—</span>' : `<b style="color:${r.profit >= 0 ? 'var(--green-d)' : 'var(--red)'}">${money(r.profit)}</b>`}</td>
        </tr>`).join('')}
      </table></div>` : `<div class="empty"><b>No sales in this period</b></div>`}
    </div>`;

  document.querySelectorAll('.range-pills button').forEach(b => b.onclick = () => { profitRange = b.dataset.r; vProfit(); });
  document.querySelectorAll('[data-cost]').forEach(inp => inp.addEventListener('change', () => {
    const v = inp.value.trim();
    DB.setCost(inp.dataset.cost, v === '' ? '' : Math.max(0, Number(v) || 0));
    vProfit();
    toast('Wholesale cost updated.', 't-green');
  }));
}

/* ================= content ================= */
function vContent() {
  const c = Object.assign({ trust: [], steps: [], pages: {} }, DB.getSettings().content || {});
  const trust = [0, 1, 2, 3].map(i => Object.assign({ ic: '', t: '', s: '' }, (c.trust || [])[i] || {}));
  const steps = [0, 1, 2].map(i => Object.assign({ ic: '', t: '', s: '' }, (c.steps || [])[i] || {}));
  const pgKeys = [['about', 'About Us'], ['contact', 'Contact Us'], ['shipping', 'Shipping Policy'], ['refund', 'Refund Policy'], ['privacy', 'Privacy Policy'], ['terms', 'Terms of Service']];
  const pages = {};
  pgKeys.forEach(([k]) => pages[k] = Object.assign({ title: '', body: '' }, (c.pages || {})[k] || {}));

  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Website Content</h1><p class="sub">All customer-facing text, in English</p></div></div>

    <div class="card"><h3>Hero Section</h3>
      <div class="frow">
        <div><label class="fl">Badge</label><input class="fi" id="c_herobadge" value="${esc(c.heroBadge || '')}" placeholder="CASH ON DELIVERY"></div>
        <div><label class="fl">Heading — Line 1</label><input class="fi" id="c_herot1" value="${esc(c.heroTitle1 || '')}" placeholder="Everything You Need,"></div>
      </div>
      <div class="frow">
        <div><label class="fl">Heading — Line 2 (accent)</label><input class="fi" id="c_herot2" value="${esc(c.heroTitle2 || '')}" placeholder="Every Day!"></div>
        <div><label class="fl">Subheading</label><input class="fi" id="c_herosub" value="${esc(c.heroSub || '')}" placeholder="Quality products at honest prices…"></div>
      </div>
      <div class="frow">
        <div><label class="fl">Button Text</label><input class="fi" id="c_herobtn" value="${esc(c.heroBtn || '')}" placeholder="SHOP NOW"></div>
        <div><label class="fl">Button Link</label><input class="fi" id="c_herobtnlink" value="${esc(c.heroBtnLink || '')}" placeholder="/shop"></div>
      </div>
      <div class="frow">
        <div><label class="fl">Hero Image</label>
          <div id="c_heroimg_prev" style="margin-bottom:8px">${c.heroImg ? `<img src="${esc(c.heroImg)}" style="max-width:180px;border-radius:10px">` : ''}</div>
          <input type="file" id="c_heroimg_file" accept="image/*" class="fi">
          <input class="fi" id="c_heroimg" value="${esc(c.heroImg || '')}" placeholder="images/…" style="margin-top:8px">
        </div>
        <div><label class="fl">&nbsp;</label><div class="lock" style="margin-top:0">Select a photo from your device — it uploads automatically.</div></div>
      </div>
    </div>

    <div class="card"><h3>Trust Badges <span class="hint">(4 boxes under the hero)</span></h3>
      ${trust.map((t, i) => `
      <div class="frow-3">
        <div><label class="fl">Box ${i + 1} — Icon</label><input class="fi" id="c_trust_ic${i}" value="${esc(t.ic)}" placeholder="🚚"></div>
        <div><label class="fl">Box ${i + 1} — Title</label><input class="fi" id="c_trust_t${i}" value="${esc(t.t)}" placeholder="Fast Delivery"></div>
        <div><label class="fl">Box ${i + 1} — Subtitle</label><input class="fi" id="c_trust_s${i}" value="${esc(t.s)}" placeholder="3–5 working days"></div>
      </div>`).join('')}
    </div>

    <div class="card"><h3>Section Headings</h3>
      <div class="frow">
        <div><label class="fl">"Shop by Category" heading</label><input class="fi" id="c_cattitle" value="${esc(c.catTitle || '')}" placeholder="Shop by Category"></div>
        <div><label class="fl">"Best Sellers" heading</label><input class="fi" id="c_besttitle" value="${esc(c.bestTitle || '')}" placeholder="Best Sellers"></div>
      </div>
      <div class="frow">
        <div><label class="fl">"Follow Us" subtitle</label><input class="fi" id="c_followsub" value="${esc(c.followSub || '')}" placeholder="Follow us for new arrivals…"></div>
        <div><label class="fl">"How To Order" heading</label><input class="fi" id="c_howtitle" value="${esc(c.howTitle || '')}" placeholder="How To Order"></div>
      </div>
    </div>

    <div class="card"><h3>How To Order <span class="hint">(3 steps)</span></h3>
      ${steps.map((t, i) => `
      <div class="frow-3">
        <div><label class="fl">Step ${i + 1} — Icon</label><input class="fi" id="c_step_ic${i}" value="${esc(t.ic)}" placeholder="🛍️"></div>
        <div><label class="fl">Step ${i + 1} — Title</label><input class="fi" id="c_step_t${i}" value="${esc(t.t)}" placeholder="Choose a Product"></div>
        <div><label class="fl">Step ${i + 1} — Text</label><input class="fi" id="c_step_s${i}" value="${esc(t.s)}" placeholder="…"></div>
      </div>`).join('')}
    </div>

    <div class="card"><h3>Footer</h3>
      <div class="frow">
        <div><label class="fl">About text</label><textarea class="fi" id="c_footabout" rows="2" placeholder="Everything You Need, Every Day!…">${esc(c.footAbout || '')}</textarea></div>
        <div><label class="fl">Contact lines</label><textarea class="fi" id="c_footcontact" rows="2" placeholder="Mon–Sat, 9am–9pm…">${esc(c.footContactLines || '')}</textarea></div>
      </div>
      <div><label class="fl">Copyright line</label><input class="fi" id="c_footcopy" value="${esc(c.footCopy || '')}" placeholder="© 2026 Al Tejarat. All rights reserved."></div>
    </div>

    <div class="card"><h3>Info Pages</h3>
      <div class="lock" style="margin-top:0">HTML is supported — <b>&lt;h2&gt;</b> for headings, <b>&lt;strong&gt;</b> for bold. On the Shipping page, <b>{{delivery_fees}}</b> is replaced with a live delivery-fee table.</div>
      ${pgKeys.map(([k, label]) => `
      <h4 style="margin:16px 0 8px">${esc(label)} <small style="color:var(--mut);font-weight:400">/${k}</small>
        <button class="btn btn-ghost btn-sm" data-reset="${k}" style="margin-left:10px">Reset to default</button></h4>
      <div class="frow" style="margin-bottom:8px">
        <div><label class="fl">Page Title</label><input class="fi" id="c_pg_t_${k}" value="${esc(pages[k].title)}" placeholder="${esc(label)}"></div>
      </div>
      <label class="fl">Page Content</label>
      <textarea class="fi" id="c_pg_b_${k}" rows="6" placeholder="Page text…">${esc(pages[k].body)}</textarea>`).join('')}
    </div>

    <button class="btn btn-green" id="c_save" style="min-width:200px">Save Content</button>
    <p class="msg" id="c_msg"></p>`;

  $('#c_heroimg_file').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    $('#c_msg').textContent = 'Uploading image…';
    try {
      const url = await DB.uploadImage(f, 'content');
      $('#c_heroimg').value = url;
      $('#c_heroimg_prev').innerHTML = `<img src="${esc(url)}" style="max-width:180px;border-radius:10px">`;
      $('#c_msg').textContent = 'Image uploaded — press Save Content.';
      $('#c_msg').className = 'msg ok';
    } catch (err) { $('#c_msg').textContent = 'Upload failed: ' + (err.message || err); $('#c_msg').className = 'msg bad'; }
  };

  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    const k = b.dataset.reset;
    const label = pgKeys.find(x => x[0] === k)[1];
    if (!confirm(`Delete your custom "${label}" text and restore the default?`)) return;
    const prev = DB.getSettings().content || {};
    const content = Object.assign({}, prev);
    content.pages = Object.assign({}, prev.pages || {});
    delete content.pages[k];
    $('#c_msg').textContent = 'Resetting…';
    const ok = await DB.saveSettings({ content });
    if (ok) { vContent(); $('#c_msg').textContent = `"${label}" restored to default.`; $('#c_msg').className = 'msg ok'; }
    else { $('#c_msg').textContent = 'Reset failed. Check your connection and try again.'; $('#c_msg').className = 'msg bad'; }
  });

  $('#c_save').onclick = async () => {
    const v = id => $('#' + id).value.trim();
    const prev = DB.getSettings().content || {};
    const content = Object.assign({}, prev);
    const strMap = [
      ['heroBadge', 'c_herobadge'], ['heroTitle1', 'c_herot1'], ['heroTitle2', 'c_herot2'],
      ['heroSub', 'c_herosub'], ['heroBtn', 'c_herobtn'], ['heroBtnLink', 'c_herobtnlink'],
      ['heroImg', 'c_heroimg'],
      ['catTitle', 'c_cattitle'], ['bestTitle', 'c_besttitle'],
      ['followSub', 'c_followsub'], ['howTitle', 'c_howtitle'],
      ['footAbout', 'c_footabout'], ['footContactLines', 'c_footcontact'], ['footCopy', 'c_footcopy']
    ];
    strMap.forEach(([kk, id]) => { const nv = v(id); if (nv !== '') content[kk] = nv; });
    const mergeRow = (nv, ov) => ({
      ic: nv.ic !== '' ? nv.ic : (ov.ic || ''),
      t: nv.t !== '' ? nv.t : (ov.t || ''),
      s: nv.s !== '' ? nv.s : (ov.s || '')
    });
    const pTrust = Array.isArray(prev.trust) ? prev.trust : [];
    content.trust = [0, 1, 2, 3].map(i => mergeRow(
      { ic: v('c_trust_ic' + i), t: v('c_trust_t' + i), s: v('c_trust_s' + i) }, pTrust[i] || {}));
    const pSteps = Array.isArray(prev.steps) ? prev.steps : [];
    content.steps = [0, 1, 2].map(i => mergeRow(
      { ic: v('c_step_ic' + i), t: v('c_step_t' + i), s: v('c_step_s' + i) }, pSteps[i] || {}));
    const pPages = prev.pages || {};
    content.pages = Object.assign({}, pPages);
    pgKeys.forEach(([k]) => {
      const t = v('c_pg_t_' + k), bdy = $('#c_pg_b_' + k).value.trim();
      const o = pPages[k] || {};
      if (t || bdy || o.title || o.body) content.pages[k] = { title: t || o.title || '', body: bdy || o.body || '' };
    });
    const msg = $('#c_msg');
    msg.textContent = 'Saving…';
    msg.className = 'msg';
    const ok = await DB.saveSettings({ content });
    msg.textContent = ok ? 'Content saved successfully.' : 'Save failed. Check your connection and try again.';
    msg.className = 'msg ' + (ok ? 'ok' : 'bad');
    if (ok) window.scrollTo(0, 0);
  };
}

/* ================= settings ================= */
function vSettings() {
  const s = DB.getSettings();
  const rulesText = s.deliveryRules !== undefined ? s.deliveryRules : ('Lahore: ' + (s.deliveryLahore !== undefined ? s.deliveryLahore : 250));
  const defFee = s.deliveryDefault !== undefined ? s.deliveryDefault : (s.deliveryOther !== undefined ? s.deliveryOther : 350);
  $('#page').innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p class="sub">Store configuration</p></div></div>

    <div class="card"><h3>Store</h3>
      <div class="frow">
        <div><label class="fl">Store Name</label><input class="fi" id="s_name" value="${esc(s.storeName || 'Al Tejarat')}"></div>
        <div><label class="fl">Tagline</label><input class="fi" id="s_tag" value="${esc(s.tagline || '')}"></div>
      </div>
      <div class="frow">
        <div><label class="fl">WhatsApp Number <small>(country code, no + — used for the chat bubble)</small></label><input class="fi" id="s_wa" value="${esc(s.whatsapp || '')}" placeholder="923001234567"></div>
        <div><label class="fl">Announcement Bar</label><input class="fi" id="s_ann" value="${esc(s.announcements || '')}"></div>
      </div>
    </div>

    <div class="card"><h3>Delivery Charges</h3>
      <div><label class="fl">City-wise charges <small>(one per line: City: Fee — use the same city names as checkout)</small></label>
      <textarea class="fi" id="s_fee_rules" rows="5" placeholder="Lahore: 250&#10;Karachi: 300&#10;Islamabad: 300">${esc(rulesText)}</textarea></div>
      <div class="frow" style="margin-top:12px;margin-bottom:0">
        <div><label class="fl">Default Fee — Other Cities (Rs)</label><input class="fi" id="s_fee_def" type="number" min="0" value="${esc(String(defFee))}"></div>
        <div></div>
      </div>
      <div class="lock">The checkout applies the matching city fee automatically. Cities not listed use the default fee.</div>
    </div>

    <div class="card"><h3>Social & Tracking</h3>
      <div class="frow">
        <div><label class="fl">TikTok Profile</label><input class="fi" id="s_tt" value="${esc(s.tiktok || '')}" placeholder="https://tiktok.com/@…"></div>
        <div><label class="fl">Facebook</label><input class="fi" id="s_fb" value="${esc(s.facebook || '')}" placeholder="https://facebook.com/…"></div>
      </div>
      <div class="frow">
        <div><label class="fl">Instagram</label><input class="fi" id="s_ig" value="${esc(s.instagram || '')}" placeholder="https://instagram.com/…"></div>
        <div><label class="fl">TikTok Pixel ID</label><input class="fi" id="s_pixel" value="${esc(s.tiktokPixel || '')}" placeholder="e.g. ABC123…"></div>
      </div>
    </div>

    <div class="card"><h3>Promo Banner <span class="hint">(full-width banner on home page)</span></h3>
      <div class="toggle-row"><label class="switch"><input type="checkbox" id="s_bshow" ${s.bannerShow ? 'checked' : ''}><span class="sl"></span></label> Show banner</div>
      <div class="frow">
        <div><label class="fl">Kicker</label><input class="fi" id="s_bkick" value="${esc(s.bannerKicker || '')}"></div>
        <div><label class="fl">Title</label><input class="fi" id="s_btitle" value="${esc(s.bannerTitle || '')}"></div>
      </div>
      <div class="frow">
        <div><label class="fl">Subtitle</label><input class="fi" id="s_bsub" value="${esc(s.bannerSub || '')}"></div>
        <div><label class="fl">Button Text</label><input class="fi" id="s_bbtn" value="${esc(s.bannerBtn || '')}"></div>
      </div>
      <div><label class="fl">Button Link</label><input class="fi" id="s_blink" value="${esc(s.bannerLink || '/shop')}"></div>
    </div>

    <div class="card"><h3>Security</h3>
      <div class="lock" style="margin-top:0">Leave blank to keep the current password.</div>
      <div class="frow" style="margin-bottom:0">
        <div><label class="fl">New Admin Password</label><input class="fi" id="s_p1" type="password" autocomplete="new-password"></div>
        <div><label class="fl">Confirm Password</label><input class="fi" id="s_p2" type="password" autocomplete="new-password"></div>
      </div>
    </div>

    <button class="btn btn-green" id="s_save" style="min-width:200px">Save Settings</button>
    <p class="msg" id="s_msg"></p>`;

  $('#s_save').onclick = async () => {
    const p1 = $('#s_p1').value, p2 = $('#s_p2').value;
    const msg = $('#s_msg');
    if (p1 || p2) {
      if (p1 !== p2) { msg.textContent = 'Passwords do not match.'; msg.className = 'msg bad'; return; }
      if (p1.length < 4) { msg.textContent = 'Password must be at least 4 characters.'; msg.className = 'msg bad'; return; }
    }
    const upd = {
      storeName: $('#s_name').value.trim() || 'Al Tejarat',
      tagline: $('#s_tag').value.trim(),
      whatsapp: $('#s_wa').value.replace(/\D/g, '') || s.whatsapp,
      deliveryRules: $('#s_fee_rules').value,
      deliveryDefault: Math.max(0, Number($('#s_fee_def').value) || 0),
      announcements: $('#s_ann').value.trim(),
      tiktok: $('#s_tt').value.trim(),
      facebook: $('#s_fb').value.trim(),
      instagram: $('#s_ig').value.trim(),
      tiktokPixel: $('#s_pixel').value.trim(),
      bannerKicker: $('#s_bkick').value.trim(),
      bannerTitle: $('#s_btitle').value.trim(),
      bannerSub: $('#s_bsub').value.trim(),
      bannerBtn: $('#s_bbtn').value.trim(),
      bannerLink: $('#s_blink').value.trim() || '/shop',
      bannerShow: $('#s_bshow').checked
    };
    if (p1) upd.adminPass = p1;
    msg.textContent = 'Saving…';
    msg.className = 'msg';
    const ok = await DB.saveSettings(upd);
    msg.textContent = ok ? 'Settings saved successfully.' : 'Save failed. Check your connection and try again.';
    msg.className = 'msg ' + (ok ? 'ok' : 'bad');
    $('#s_p1').value = $('#s_p2').value = '';
  };
}

})();
