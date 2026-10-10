/* Al Tejarat admin panel */
(async () => {
  await DB.init();
  const $ = sel => document.querySelector(sel);
  const main = $('#main');

  // address text with backward compatibility for old orders
  const addrText = cust => {
    if (cust.house || cust.area) return [cust.house, cust.area, cust.city].filter(Boolean).join(', ');
    return [cust.address, cust.city].filter(Boolean).join(', ');
  };

  /* ---------- dashboard time range (declared early: used on login) ---------- */
  let dashRange = 'all'; // today | yesterday | week | month | custom | all
  let dashCustom = null; // {from:'YYYY-MM-DD', to:'YYYY-MM-DD'}
  const RANGES = [
    ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 Days'],
    ['month', 'Last 30 Days'], ['all', 'All Time']
  ];
  function dashWindow(range) {
    const now = Date.now();
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const sod = d.getTime();
    if (range === 'custom' && dashCustom && dashCustom.from && dashCustom.to) {
      const f = new Date(dashCustom.from + 'T00:00:00').getTime();
      const t = new Date(dashCustom.to + 'T00:00:00').getTime() + 86400000;
      if (!isNaN(f) && !isNaN(t) && t > f) return [f, t];
      return [null, null];
    }
    switch (range) {
      case 'today': return [sod, null];
      case 'yesterday': return [sod - 86400000, sod];
      case 'week': return [now - 7 * 86400000, null];
      case 'month': return [now - 30 * 86400000, null];
      default: return [null, null];
    }
  }
  const fmtD = iso => {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  };

  let curTab = 'dash';
  /* ---------- login ---------- */
  const authed = () => sessionStorage.getItem('altejarat_admin') === '1';
  function showLogin() { $('#loginWrap').hidden = false; $('#panel').hidden = true; }
  function showPanel() { $('#loginWrap').hidden = true; $('#panel').hidden = false; go('dash'); refreshBadges(); }

  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    const typed = $('#passInput').value.trim();
    if (typed === DB.getSettings().adminPass) {
      sessionStorage.setItem('altejarat_admin', '1');
      $('#passInput').value = ''; $('#loginErr').textContent = '';
      showPanel();
    } else $('#loginErr').textContent = 'Ghalat password. Dobara try karein.';
  };
  $('#logoutBtn').onclick = () => { sessionStorage.removeItem('altejarat_admin'); showLogin(); };
  if (authed()) showPanel(); else showLogin();

  /* ---------- tabs ---------- */
  document.querySelectorAll('.side nav button').forEach(b => b.onclick = () => go(b.dataset.tab));
  function go(tab) {
    curTab = tab;
    document.querySelectorAll('.side nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    ({ dash: vDash, products: vProducts, categories: vCategories, orders: vOrders, profit: vProfit, settings: vSettings })[tab]();
    window.scrollTo(0, 0);
  }
  // cloud mode: naya order aate hi badge + list refresh
  DB.onOrdersChanged(() => {
    refreshBadges();
    if (curTab === 'orders' || curTab === 'dash') go(curTab);
  });
  // cloud badge
  const cb = document.getElementById('cloudBadge');
  if (cb) {
    cb.textContent = DB.isCloud() ? '☁️ Cloud connected' : '💾 Local mode';
    cb.classList.add(DB.isCloud() ? 'on' : 'off');
  }
  function refreshBadges() {
    const n = DB.newOrderCount();
    ['badgeDash', 'badgeOrders'].forEach(id => {
      const el = document.getElementById(id);
      el.hidden = n === 0; el.textContent = n;
    });
  }

  /* ---------- dashboard ---------- */
  function vDash() {
    const [from, to] = dashWindow(dashRange);
    const inRange = o => {
      if (from === null) return true;
      const t = new Date(o.date).getTime();
      return t >= from && (to === null || t < to);
    };
    const orders = DB.getOrders().filter(inRange);
    const active = orders.filter(o => o.status !== 'Cancelled');
    const revenue = active.reduce((a, o) => a + o.total, 0);
    const st = DB.profitStats(from, to);
    const n = DB.newOrderCount();
    const missingCost = DB.getProducts().some(p => {
      const c = DB.getCosts()[p.id];
      return c === undefined || c === '' || isNaN(Number(c));
    });
    const rangeLabel = dashRange === 'custom' && dashCustom
      ? fmtD(dashCustom.from) + ' – ' + fmtD(dashCustom.to)
      : ((RANGES.find(r => r[0] === dashRange) || [])[1] || '');
    main.innerHTML = `
      <h1>Dashboard</h1><p class="sub">Assalam-o-Alaikum! Aapke store ki khabar:</p>
      ${n ? `<div class="alert">🔔 <b>${n} naya order</b> aaya hai! <a href="#" id="goOrders" style="color:var(--green);font-weight:700">Orders dekhein →</a></div>` : ''}
      ${missingCost ? `<div class="alert">⚠️ Kuch products ki <b>wholesale price</b> set nahi — sahi profit ke liye Products tab mein har product ki wholesale price likhein.</div>` : ''}
      <div class="range-row">${RANGES.map(([k, label]) => `<button class="range-btn ${dashRange === k ? 'on' : ''}" data-range="${k}">${label}</button>`).join('')}</div>
      <div class="range-row custom-row">
        <span class="custom-label">📅 Custom:</span>
        <input type="date" id="drFrom" class="date-in" value="${dashCustom ? dashCustom.from : ''}">
        <span class="custom-label">to</span>
        <input type="date" id="drTo" class="date-in" value="${dashCustom ? dashCustom.to : ''}">
        <button class="range-btn ${dashRange === 'custom' ? 'on' : ''}" id="drApply">Apply</button>
      </div>
      <div class="cards">
        <div class="stat green"><small>Revenue · ${rangeLabel}</small><b>${DB.money(revenue)}</b></div>
        <div class="stat"><small>Wholesale · ${rangeLabel}</small><b>${st.cost === null ? '—' : DB.money(st.cost)}</b></div>
        <div class="stat gold"><small>Profit · ${rangeLabel}</small><b>${st.profit === null ? '—' : DB.money(st.profit)}</b></div>
        <div class="stat"><small>Orders · ${rangeLabel}</small><b>${orders.length}</b></div>
        <div class="stat"><small>Items Sold · ${rangeLabel}</small><b>${st.units}</b></div>
      </div>
      <div class="toolbar"><h3 style="margin:0">Recent Orders · ${rangeLabel}</h3></div>
      <div class="tbl-wrap"><table>
        <tr><th>Order ID</th><th>Date</th><th>Customer</th><th class="num">Total</th><th>Status</th></tr>
        ${orders.slice(0, 8).map(o => `<tr>
          <td><b>${DB.esc(o.id)}</b></td><td>${new Date(o.date).toLocaleString('en-PK')}</td>
          <td>${DB.esc(o.customer.name)}<br><small style="color:var(--mut)">${DB.esc(o.customer.phone)}</small></td>
          <td class="num">${DB.money(o.total)}</td><td><span class="pill ${o.status}">${o.status}</span></td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--mut)">Is period mein koi order nahi.</td></tr>'}
      </table></div>`;
    main.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { dashRange = b.dataset.range; dashCustom = null; vDash(); });
    $('#drApply').onclick = () => {
      const f = $('#drFrom').value, t = $('#drTo').value;
      if (!f || !t) { alert('Dono dates select karein (from aur to).'); return; }
      if (t < f) { alert('"To" date "From" se pehle nahi ho sakti.'); return; }
      dashCustom = { from: f, to: t };
      dashRange = 'custom';
      vDash();
    };
    const g = $('#goOrders');
    if (g) g.onclick = e => { e.preventDefault(); go('orders'); };
    DB.markSeen(); refreshBadges();
  }

  /* ---------- products ---------- */
  let editingId = null;
  function vProducts() {
    const costs = DB.getCosts();
    main.innerHTML = `
      <div class="toolbar"><div><h1 style="margin:0">Products</h1><p class="sub" style="margin:0">Naya product add karein ya purana edit karein.</p></div>
      <button class="btn btn-green" id="addBtn">+ Naya Product</button></div>
      <div id="pform"></div>
      <div class="lock" style="margin-bottom:14px">💡 <b>Draft</b> ya <b>bina category</b> wale products website par nahi dikhenge — status par click karke Active/Draft badlein.</div>
      <div class="tbl-wrap"><table>
        <tr><th></th><th>Product</th><th>Category</th><th>Status</th><th class="num">Selling Price</th><th class="num">Wholesale 🔒</th><th class="num">Profit/pc 🔒</th><th class="num">Stock</th><th></th></tr>
        ${DB.getProducts().map(p => {
          const c = costs[p.id];
          const hasCost = c !== undefined && c !== '' && !isNaN(Number(c));
          const profit = hasCost ? p.price - Number(c) : null;
          const img = DB.productImage(p);
          const colorTxt = (p.colors || []).join(', ');
          const isDraft = p.status === 'draft';
          const noCat = !p.category || !DB.getCategories().includes(p.category);
          return `<tr>
            <td><img class="pthumb" src="${DB.esc(img)}"></td>
            <td><b>${DB.esc(p.name)}</b>${colorTxt ? `<br><small style="color:var(--mut)">${DB.esc(colorTxt)}</small>` : ''}${noCat ? '<br><small style="color:#c98a24">⚠ no category — hidden</small>' : ''}</td><td>${DB.esc(p.category || '')}</td>
            <td><button class="pill ${isDraft ? 'Draft' : 'Active'}" data-toggle="${p.id}" title="Click karke badlein" style="border:0;cursor:pointer">${isDraft ? 'Draft' : 'Active'}</button></td>
            <td class="num">${DB.money(p.price)}</td>
            <td class="num">${hasCost ? DB.money(c) : '<span style="color:#c98a24">set karein</span>'}</td>
            <td class="num">${profit === null ? '—' : DB.money(profit)}</td>
            <td class="num">${p.stock}</td>
            <td style="white-space:nowrap"><button class="btn btn-ghost" data-edit="${p.id}" style="padding:6px 12px">Edit</button>
            <button class="btn btn-red" data-del="${p.id}" style="padding:6px 12px">✕</button></td>
          </tr>`;
        }).join('')}
      </table></div>
      <div class="lock">🔒 Wholesale price aur profit <b>sirf admin panel</b> mein nazar aate hain — customer website par kabhi nahi dikhenge.</div>`;
    $('#addBtn').onclick = () => { editingId = 'new'; pForm(); };
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editingId = b.dataset.edit; pForm(); });
    main.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
      const p = DB.getProduct(b.dataset.toggle);
      if (p) { DB.saveProduct({ ...p, status: p.status === 'draft' ? 'active' : 'draft' }); vProducts(); }
    });
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (confirm('Ye product delete kar dein?')) { DB.deleteProduct(b.dataset.del); vProducts(); }
    });
  }

  function pForm() {
    const p = editingId === 'new' ? { id: 'p' + Date.now(), name: '', category: '', price: '', stock: 100, featured: false, description: '', image: '', colors: [] }
      : Object.assign({}, DB.getProduct(editingId));
    const costs = DB.getCosts();
    const cost = costs[p.id] !== undefined ? costs[p.id] : '';
    const imgVal = p.image || DB.productImage(p);
    const colorList = (p.colors || []).filter(c => typeof c === 'string');
    const cats = DB.getCategories();
    const catOpts = cats.map(c => `<option value="${DB.esc(c)}" ${p.category === c ? 'selected' : ''}>${DB.esc(c)}</option>`).join('');
    const curExtra = (p.category && !cats.includes(p.category)) ? `<option value="${DB.esc(p.category)}" selected>${DB.esc(p.category)}</option>` : '';
    $('#pform').innerHTML = `
      <div class="form-card"><h3>${editingId === 'new' ? 'Naya Product' : 'Edit Product'}</h3>
        <div class="frow">
          <div><label class="fl">Product Name *</label><input class="fi" id="f_name" value="${DB.esc(p.name)}"></div>
          <div><label class="fl">Category *</label><select class="fi" id="f_cat">${catOpts}${curExtra || '<option value="">— Select —</option>'}</select>
          ${cats.length ? '' : '<small style="color:#c98a24">Pehle Categories tab mein category banao.</small>'}</div>
        </div>
        <div class="frow">
          <div><label class="fl">Status</label><select class="fi" id="f_status">
            <option value="active" ${p.status !== 'draft' ? 'selected' : ''}>Active — website par show ho</option>
            <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Draft — chhupa rahe (baad mein active kar sakte ho)</option>
          </select></div>
          <div><label class="fl">&nbsp;</label><div class="lock" style="margin-top:0">💡 Draft products website par nahi dikhenge — delete karne ki zaroorat nahi.</div></div>
        </div>
        <label class="fl">Product Image</label>
        <div class="img-row">
          <img id="f_preview" class="img-preview" src="${DB.esc(imgVal)}" ${imgVal ? '' : 'hidden'}>
          <div style="flex:1">
            <input type="file" id="f_imgfile" accept="image/*" class="fi" style="padding:8px">
            <small style="color:var(--mut)">📱 Device se photo select karein — khud chhoti hokar save ho jayegi. <span id="f_upmsg"></span></small>
            <input class="fi" id="f_img" value="${DB.esc(imgVal)}" placeholder="images/my-photo.jpg" style="margin-top:8px">
            <small style="color:var(--mut)">Ya GitHub <b>images/</b> folder ka path likhein.</small>
          </div>
        </div>
        <div class="frow3">
          <div><label class="fl">Selling Price (Rs) *</label><input class="fi" id="f_price" type="number" min="0" value="${p.price}"></div>
          <div><label class="fl">Wholesale Price (Rs) 🔒 sirf admin</label><input class="fi" id="f_cost" type="number" min="0" value="${cost}" placeholder="e.g. 1200"></div>
          <div><label class="fl">Stock</label><input class="fi" id="f_stock" type="number" min="0" value="${p.stock}"></div>
        </div>
        <label class="fl">Description</label><textarea class="fi" id="f_desc">${DB.esc(p.description || '')}</textarea>
        <label class="fl">Colors <small style="color:var(--mut)">(ek-ek karke add karein)</small></label>
        <div id="colorRows"></div>
        <button class="btn btn-ghost" id="addColor" type="button" style="margin-top:8px">＋ Add Color</button>
        <label class="fl"><input type="checkbox" id="f_feat" ${p.featured ? 'checked' : ''}> Home page par featured dikhayein</label>
        <div class="row-actions">
          <button class="btn btn-green" id="f_save">Save Product</button>
          <button class="btn btn-ghost" id="f_cancel">Cancel</button>
        </div>
      </div>`;
    const renderColorRows = vals => {
      $('#colorRows').innerHTML = vals.map((c, i) => `
        <div class="color-row">
          <input class="fi" data-ci="${i}" value="${DB.esc(c)}" placeholder="e.g. Red">
          <button class="btn btn-red" data-rmcolor="${i}" type="button">✕</button>
        </div>`).join('');
      $('#colorRows').querySelectorAll('[data-rmcolor]').forEach(b => b.onclick = () => {
        const v = readColorInputs();
        v.splice(+b.dataset.rmcolor, 1);
        renderColorRows(v);
      });
    };
    // jo colors abhi likhe hue hain, unhein parh lo (taake add/remove par na urein)
    const readColorInputs = () => [...$('#colorRows').querySelectorAll('[data-ci]')].map(inp => inp.value);
    let colorVals = colorList.length ? colorList.slice() : [''];
    renderColorRows(colorVals);
    $('#addColor').onclick = () => { renderColorRows([...readColorInputs(), '']); };
    $('#f_img').oninput = e => {
      const pv = $('#f_preview');
      pv.src = e.target.value.trim();
      pv.hidden = !e.target.value.trim();
    };
    const ffile = $('#f_imgfile');
    if (ffile) ffile.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const msg = $('#f_upmsg');
      msg.textContent = '⏳ Photo taiyar ho rahi hai...';
      try {
        const url = await DB.uploadImage(file, 'products');
        $('#f_img').value = url;
        const pv = $('#f_preview'); pv.src = url; pv.hidden = false;
        msg.textContent = '✅ Ho gayi!';
      } catch (err) { msg.textContent = '❌ Fail: ' + ((err && err.message) || err); }
    };

    $('#f_save').onclick = () => {
      const name = $('#f_name').value.trim();
      const price = Number($('#f_price').value);
      if (!name || isNaN(price)) { alert('Naam aur price zaroor likhein.'); return; }
      colorVals = [...$('#colorRows').querySelectorAll('[data-ci]')].map(inp => inp.value.trim()).filter(Boolean);
      DB.saveProduct({
        id: p.id, name, category: $('#f_cat').value.trim(), price,
        status: $('#f_status').value === 'draft' ? 'draft' : 'active',
        stock: Number($('#f_stock').value) || 0,
        description: $('#f_desc').value.trim(),
        image: $('#f_img').value.trim(),
        colors: colorVals,
        featured: $('#f_feat').checked
      });
      const cv = $('#f_cost').value.trim();
      DB.setCost(p.id, cv === '' ? '' : Number(cv));
      editingId = null; vProducts();
    };
    $('#f_cancel').onclick = () => { editingId = null; vProducts(); };
    window.scrollTo(0, 0);
  }

  /* ---------- categories ---------- */
  function vCategories() {
    const cats = DB.getCategories();
    const counts = {};
    DB.getProducts().forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    main.innerHTML = `
      <h1>Categories</h1><p class="sub">Yahan nayi category banao — phir product add karte waqt dropdown se select kar sako ge.</p>
      <div class="form-card"><h3>+ Nayi Category</h3>
        <div style="display:flex;gap:10px">
          <input class="fi" id="cat_new" placeholder="e.g. Shoes" style="flex:1">
          <button class="btn btn-green" id="cat_add">Add Category</button>
        </div>
      </div>
      <div class="tbl-wrap"><table>
        <tr><th>Image</th><th>Category</th><th class="num">Products</th><th></th></tr>
        ${cats.map((c, i) => {
          const cimg = DB.getCategoryImage(c);
          return `<tr>
          <td>${cimg ? `<img class="cat-thumb" src="${DB.esc(cimg)}">` : '<span class="cat-thumb none">📁</span>'}</td>
          <td><b>${DB.esc(c)}</b></td>
          <td class="num">${counts[c] || 0}</td>
          <td style="white-space:nowrap;text-align:right">
            <button class="btn btn-ghost" data-moveup="${DB.esc(c)}" style="padding:6px 10px" title="Upar karo" ${i === 0 ? 'disabled style="opacity:.35;padding:6px 10px"' : ''}>↑</button>
            <button class="btn btn-ghost" data-movedown="${DB.esc(c)}" style="padding:6px 10px" title="Neeche karo" ${i === cats.length - 1 ? 'disabled style="opacity:.35;padding:6px 10px"' : ''}>↓</button>
            <button class="btn btn-ghost" data-catimg="${DB.esc(c)}" style="padding:6px 10px" title="Category image lagayein">🖼️</button>
            <button class="btn btn-ghost" data-rename="${DB.esc(c)}" style="padding:6px 12px">Rename</button>
            <button class="btn btn-red" data-delcat="${DB.esc(c)}" style="padding:6px 12px">✕</button>
          </td>
        </tr>`; }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--mut)">Koi category nahi — upar se add karo.</td></tr>'}
      </table></div>
      <div class="lock">💡 Category rename karne par uske products khud update ho jayenge. Delete karne par products delete <b>nahi</b> honge.</div>`;
    const add = () => {
      const v = $('#cat_new').value;
      if (!DB.addCategory(v)) { alert('Naam khaali hai ya ye category pehle se hai.'); return; }
      vCategories();
    };
    $('#cat_add').onclick = add;
    $('#cat_new').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    let fi = document.getElementById('catImgFile');
    if (!fi) {
      fi = document.createElement('input');
      fi.type = 'file'; fi.accept = 'image/*'; fi.id = 'catImgFile'; fi.style.display = 'none';
      document.body.appendChild(fi);
    }
    main.querySelectorAll('[data-catimg]').forEach(b => b.onclick = () => {
      const name = b.dataset.catimg;
      fi.onchange = async e => {
        const file = e.target.files[0];
        fi.value = '';
        if (!file) return;
        b.disabled = true;
        try {
          const url = await DB.uploadImage(file, 'categories');
          DB.setCategoryImage(name, url);
        } catch (err) { alert('Upload fail: ' + ((err && err.message) || err)); }
        vCategories();
      };
      fi.click();
    });
    main.querySelectorAll('[data-moveup]').forEach(b => b.onclick = () => { DB.moveCategory(b.dataset.moveup, -1); vCategories(); });
    main.querySelectorAll('[data-movedown]').forEach(b => b.onclick = () => { DB.moveCategory(b.dataset.movedown, 1); vCategories(); });
    main.querySelectorAll('[data-rename]').forEach(b => b.onclick = () => {
      const nv = prompt('Naya naam likhein:', b.dataset.rename);
      if (nv === null) return;
      if (!DB.renameCategory(b.dataset.rename, nv)) alert('Naam khaali hai ya pehle se maujood hai.');
      vCategories();
    });
    main.querySelectorAll('[data-delcat]').forEach(b => b.onclick = () => {
      if (confirm(`"${b.dataset.delcat}" delete kar dein? (uske products delete nahi honge)`)) {
        DB.deleteCategory(b.dataset.delcat); vCategories();
      }
    });
  }

  /* ---------- orders ---------- */
  function vOrders() {
    const orders = DB.getOrders();
    main.innerHTML = `
      <h1>Orders</h1><p class="sub">Kul ${orders.length} orders. Status change karne ke liye dropdown use karein.</p>
      <div id="odetail"></div>
      <div class="tbl-wrap"><table>
        <tr><th>Order ID</th><th>Date</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Status</th><th></th></tr>
        ${orders.map(o => `<tr>
          <td><b>${DB.esc(o.id)}</b></td>
          <td>${new Date(o.date).toLocaleString('en-PK')}</td>
          <td>${DB.esc(o.customer.name)}<br><small style="color:var(--mut)">${DB.esc(o.customer.phone)}</small></td>
          <td>${o.items.reduce((a, i) => a + i.qty, 0)}</td>
          <td class="num">${DB.money(o.total)}</td>
          <td><select class="status" data-st="${o.id}">
            ${['Pending', 'Confirmed', 'Delivered', 'Cancelled'].map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></td>
          <td><button class="btn btn-ghost" data-view="${o.id}" style="padding:6px 12px">View</button></td>
        </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--mut)">Abhi koi order nahi aaya.</td></tr>'}
      </table></div>`;
    main.querySelectorAll('[data-st]').forEach(s => s.onchange = () => { DB.setOrderStatus(s.dataset.st, s.value); vOrders(); });
    main.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
      const o = DB.getOrders().find(x => x.id === b.dataset.view);
      $('#odetail').innerHTML = `
        <div class="odetail" style="margin-bottom:20px">
          <h3>Order ${DB.esc(o.id)} <span class="pill ${o.status}">${o.status}</span></h3>
          <dl class="kv">
            <dt>Date</dt><dd>${new Date(o.date).toLocaleString('en-PK')}</dd>
            <dt>Name</dt><dd>${DB.esc(o.customer.name)}</dd>
            <dt>Phone</dt><dd>${DB.esc(o.customer.phone)}</dd>
            <dt>Address</dt><dd>${DB.esc(addrText(o.customer))}</dd>
          </dl>
          <div class="tbl-wrap"><table>
            <tr><th>Item</th><th>Color</th><th class="num">Price</th><th class="num">Qty</th><th class="num">Line Total</th></tr>
            ${o.items.map(i => `<tr><td>${DB.esc(i.name)}</td><td>${DB.esc(i.color || '—')}</td>
              <td class="num">${DB.money(i.price)}</td><td class="num">${i.qty}</td><td class="num">${DB.money(i.price * i.qty)}</td></tr>`).join('')}
            <tr><td colspan="4">Delivery</td><td class="num">${DB.money(o.delivery)}</td></tr>
            <tr class="tot"><td colspan="4">Grand Total</td><td class="num">${DB.money(o.total)}</td></tr>
          </table></div>
          <div class="row-actions"><button class="btn btn-ghost" id="odClose">Close</button></div>
        </div>`;
      $('#odClose').onclick = () => $('#odetail').innerHTML = '';
      window.scrollTo(0, 0);
    });
    DB.markSeen(); refreshBadges();
  }

  /* ---------- profit report ---------- */
  function vProfit() {
    const st = DB.profitStats();
    const rows = Object.entries(st.perProduct);
    main.innerHTML = `
      <h1>💰 Profit Report</h1><p class="sub">Har product par kitna kamaya — ye sirf aap dekh sakte hain.</p>
      ${!st.allHaveCost ? `<div class="alert">⚠️ Jin products ki wholesale price set nahi, unka profit <b>—</b> dikhega. Products tab mein wholesale price likhein.</div>` : ''}
      <div class="cards">
        <div class="stat green"><small>Total Revenue</small><b>${DB.money(st.revenue)}</b></div>
        <div class="stat"><small>Total Wholesale Cost</small><b>${st.cost === null ? '—' : DB.money(st.cost)}</b></div>
        <div class="stat gold"><small>Total Profit</small><b>${st.profit === null ? '—' : DB.money(st.profit)}</b></div>
      </div>
      <div class="tbl-wrap"><table>
        <tr><th>Product</th><th class="num">Sold</th><th class="num">Revenue</th><th class="num">Wholesale Cost</th><th class="num">Profit</th><th class="num">Margin</th></tr>
        ${rows.map(([pid, r]) => {
          const p = DB.getProduct(pid);
          const img = p ? DB.productImage(p) : '';
          const profit = r.hasCost ? r.revenue - r.cost : null;
          const margin = profit !== null && r.revenue ? Math.round(profit / r.revenue * 100) : null;
          return `<tr>
            <td>${img ? `<img class="pthumb" src="${DB.esc(img)}" style="vertical-align:middle;margin-right:8px">` : ''}<b>${DB.esc(r.name)}</b></td>
            <td class="num">${r.units}</td><td class="num">${DB.money(r.revenue)}</td>
            <td class="num">${r.hasCost ? DB.money(r.cost) : '—'}</td>
            <td class="num" style="color:${profit > 0 ? 'var(--green)' : 'inherit'};font-weight:700">${profit === null ? '—' : DB.money(profit)}</td>
            <td class="num">${margin === null ? '—' : margin + '%'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--mut)">Abhi koi sale nahi hui.</td></tr>'}
        ${rows.length ? `<tr class="tot"><td>GRAND TOTAL</td><td class="num">${st.units}</td><td class="num">${DB.money(st.revenue)}</td>
          <td class="num">${st.cost === null ? '—' : DB.money(st.cost)}</td>
          <td class="num">${st.profit === null ? '—' : DB.money(st.profit)}</td><td></td></tr>` : ''}
      </table></div>
      <div class="lock">🔒 Wholesale price, cost aur profit <b>sirf admin panel</b> mein hain — customer website par sirf selling price dikhti hai.</div>`;
  }

  /* ---------- settings ---------- */
  function vSettings() {
    const s = DB.getSettings();
    main.innerHTML = `
      <h1>Settings</h1><p class="sub">Store ki settings yahan se change karein.</p>
      <div class="form-card"><h3>Store Settings</h3>
        <div class="frow">
          <div><label class="fl">Store Name</label><input class="fi" id="s_name" value="${DB.esc(s.storeName)}"></div>
          <div><label class="fl">Tagline</label><input class="fi" id="s_tag" value="${DB.esc(s.tagline)}"></div>
        </div>
        <div class="frow">
          <div><label class="fl">WhatsApp Number <small style="color:var(--mut)">(country code ke saath, bina + ke — orders isi par aayenge)</small></label>
            <input class="fi" id="s_wa" value="${DB.esc(s.whatsapp)}" placeholder="923001234567"></div>
          <div><label class="fl">Announcement Bar (home page ke upar)</label><input class="fi" id="s_ann" value="${DB.esc(s.announcements || '')}"></div>
        </div>
        <div class="frow">
          <div><label class="fl">Delivery Fee — Lahore (Rs)</label><input class="fi" id="s_fee_lhr" type="number" min="0" value="${s.deliveryLahore !== undefined ? s.deliveryLahore : 250}"></div>
          <div><label class="fl">Delivery Fee — Baqi Cities (Rs)</label><input class="fi" id="s_fee_oth" type="number" min="0" value="${s.deliveryOther !== undefined ? s.deliveryOther : 350}"></div>
        </div>
        <div class="lock">💡 Checkout par city select hote hi delivery fee <b>khud</b> lag jayegi — Lahore wali ya baqi cities wali.</div>
      </div>
      <div class="form-card"><h3>📱 Social Media Links <small style="color:var(--mut);font-weight:400">(footer mein icons ke saath show honge)</small></h3>
        <div class="frow">
          <div><label class="fl">TikTok Profile Link</label><input class="fi" id="s_tt" value="${DB.esc(s.tiktok || '')}" placeholder="https://tiktok.com/@..."></div>
          <div><label class="fl">Facebook Page Link</label><input class="fi" id="s_fb" value="${DB.esc(s.facebook || '')}" placeholder="https://facebook.com/..."></div>
        </div>
        <div class="frow">
          <div><label class="fl">Instagram Profile Link</label><input class="fi" id="s_ig" value="${DB.esc(s.instagram || '')}" placeholder="https://instagram.com/..."></div>
          <div><label class="fl">&nbsp;</label><div class="lock" style="margin-top:0">💡 Khali chhoro to wo icon show nahi hoga. WhatsApp icon number se khud ban jata hai.</div></div>
        </div>
      </div>
      <div class="form-card"><h3>🔐 Change Admin Password</h3>
        <div class="frow">
          <div><label class="fl">New Password</label><input class="fi" id="s_p1" type="password"></div>
          <div><label class="fl">Confirm Password</label><input class="fi" id="s_p2" type="password"></div>
        </div>
        <div class="lock">Password sirf aapko pata hona chahiye. Kisi se share na karein.</div>
      </div>
      <div class="row-actions"><button class="btn btn-green" id="s_save">Save Settings</button></div>
      <p class="sub" id="s_msg" style="margin-top:12px"></p>`;
    $('#s_save').onclick = () => {
      const p1 = $('#s_p1').value, p2 = $('#s_p2').value;
      if (p1 || p2) {
        if (p1 !== p2) { $('#s_msg').textContent = 'Passwords match nahi ho rahe.'; return; }
        if (p1.length < 4) { $('#s_msg').textContent = 'Password kam az kam 4 characters ka ho.'; return; }
      }
      const upd = {
        storeName: $('#s_name').value.trim() || 'Al Tejarat',
        tagline: $('#s_tag').value.trim(),
        whatsapp: $('#s_wa').value.replace(/\D/g, '') || s.whatsapp,
        deliveryLahore: Math.max(0, Number($('#s_fee_lhr').value) || 0),
        deliveryOther: Math.max(0, Number($('#s_fee_oth').value) || 0),
        announcements: $('#s_ann').value.trim(),
        tiktok: $('#s_tt').value.trim(),
        facebook: $('#s_fb').value.trim(),
        instagram: $('#s_ig').value.trim()
      };
      if (p1) upd.adminPass = p1;
      DB.saveSettings(upd);
      $('#s_msg').textContent = '✓ Settings save ho gayi.';
      $('#s_p1').value = $('#s_p2').value = '';
    };
  }
})();
