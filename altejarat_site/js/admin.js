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
    ({ dash: vDash, products: vProducts, categories: vCategories, orders: vOrders, reviews: vReviews, profit: vProfit, settings: vSettings })[tab]();
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
        ${DB.newFirst(DB.getProducts()).map(p => {
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
    const imgList0 = DB.productImages(p);
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
        <label class="fl">Product Images <small style="color:var(--mut)">(ek se zyada select kar sakte ho — pehli wali main photo hogi)</small></label>
        <div id="imgList" class="img-list"></div>
        <div class="img-row">
          <div style="flex:1">
            <input type="file" id="f_imgfile" accept="image/*" multiple class="fi" style="padding:8px">
            <small style="color:var(--mut)">📱 Device se photos select karein — khud chhoti hokar save ho jayengi. <span id="f_upmsg"></span></small>
            <div style="display:flex;gap:8px;margin-top:8px">
              <input class="fi" id="f_imgpath" placeholder="images/my-photo.jpg" style="flex:1;margin-top:0">
              <button class="btn btn-ghost" id="f_addpath" type="button">Add</button>
            </div>
          </div>
        </div>
        <div class="frow3">
          <div><label class="fl">Selling Price (Rs) *</label><input class="fi" id="f_price" type="number" min="0" value="${p.price}"></div>
          <div><label class="fl">Wholesale Price (Rs) 🔒 sirf admin</label><input class="fi" id="f_cost" type="number" min="0" value="${cost}" placeholder="e.g. 1200"></div>
          <div><label class="fl">Stock</label><input class="fi" id="f_stock" type="number" min="0" value="${p.stock}"></div>
        </div>
        <label class="fl">Description</label><textarea class="fi" id="f_desc">${DB.esc(p.description || '')}</textarea>
        <label class="fl">Colors <small style="color:var(--mut)">(har color ke saath uski photo bhi laga sakte ho)</small></label>
        <div id="colorRows"></div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="addColor" type="button">＋ Add Color</button>
          <button class="btn btn-ghost" id="detectColors" type="button">🎨 Photo se colors detect karo</button>
        </div>
        <div id="colorSuggest" class="suggest-row"></div>
        <datalist id="colorDatalist">${DB.COLOR_PALETTE.map(c => `<option value="${DB.esc(c.name)}">`).join('')}</datalist>
        <label class="fl" style="margin-top:12px">Sizes <small style="color:var(--mut)">(jaise 36, 37… ya S, M, L — khaali chhor do agar size nahi hai)</small></label>
        <div id="sizeRows"></div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-ghost" id="addSize" type="button">＋ Add Size</button>
          <button class="btn btn-ghost" id="sizePresetFoot" type="button">👟 36–41</button>
          <button class="btn btn-ghost" id="sizePresetCloth" type="button">👕 S–XL</button>
        </div>
        <label class="fl"><input type="checkbox" id="f_feat" ${p.featured ? 'checked' : ''}> Home page par featured dikhayein</label>
        <div class="row-actions">
          <button class="btn btn-green" id="f_save">Save Product</button>
          <button class="btn btn-ghost" id="f_cancel">Cancel</button>
        </div>
      </div>`;
    // colors ab objects hain: {name, img}
    let colorObjs = DB.normColors(p);
    if (!colorObjs.length) colorObjs = [{name: ''}];
    const readColorRows = () => [...$('#colorRows').querySelectorAll('.color-row')].map(row => ({
      name: row.querySelector('[data-cname]').value.trim(),
      img: row.querySelector('[data-cimg]').value
    }));
    const renderColorRows = vals => {
      $('#colorRows').innerHTML = vals.map((c, i) => `
        <div class="color-row">
          <input class="fi" data-cname list="colorDatalist" value="${DB.esc(c.name)}" placeholder="e.g. Red">
          <input type="hidden" data-cimg value="${DB.esc(c.img || '')}">
          <img class="cimg-thumb" src="${DB.esc(c.img || '')}" ${c.img ? '' : 'hidden'} alt="">
          <button class="btn btn-ghost" data-cimgbtn="${i}" type="button" title="Is color ki photo">🖼️</button>
          <button class="btn btn-red" data-rmcolor="${i}" type="button">✕</button>
        </div>`).join('');
      $('#colorRows').querySelectorAll('[data-cimgbtn]').forEach(b => b.onclick = () => {
        let fi = document.getElementById('colorImgFile');
        if (!fi) {
          fi = document.createElement('input');
          fi.type = 'file'; fi.accept = 'image/*'; fi.id = 'colorImgFile'; fi.style.display = 'none';
          document.body.appendChild(fi);
        }
        fi.onchange = async e => {
          const file = e.target.files[0]; fi.value = '';
          if (!file) return;
          try {
            const url = await DB.uploadImage(file, 'colors');
            const v = readColorRows(); v[+b.dataset.cimgbtn].img = url;
            renderColorRows(v);
          } catch (err) { alert('Upload fail: ' + ((err && err.message) || err)); }
        };
        fi.click();
      });
      $('#colorRows').querySelectorAll('[data-rmcolor]').forEach(b => b.onclick = () => {
        const v = readColorRows();
        v.splice(+b.dataset.rmcolor, 1);
        renderColorRows(v.length ? v : [{name: ''}]);
      });
    };
    renderColorRows(colorObjs);
    $('#addColor').onclick = () => { renderColorRows([...readColorRows(), {name: ''}]); };
    // photo se auto color detect
    $('#detectColors').onclick = async e => {
      const btn = e.currentTarget;
      const mainImg = imgList[0] || '';
      if (!mainImg) { alert('Pehle product ki photo upload karein.'); return; }
      btn.disabled = true; const oldT = btn.textContent; btn.textContent = '⏳ Detect ho raha hai...';
      const found = await DB.detectColors(mainImg);
      btn.disabled = false; btn.textContent = oldT;
      const box = $('#colorSuggest');
      if (!found.length) { box.innerHTML = '<small class="sub">Koi color detect nahi hua.</small>'; return; }
      box.innerHTML = '<small class="sub">Ye colors mile — Add dabao:</small> ' + found.map(n =>
        `<button class="btn btn-ghost suggest-chip" data-addcolor="${DB.esc(n)}" type="button">＋ ${DB.esc(n)}</button>`).join(' ');
      box.querySelectorAll('[data-addcolor]').forEach(b => b.onclick = () => {
        const v = readColorRows().filter(c => c.name);
        if (!v.some(c => c.name.toLowerCase() === b.dataset.addcolor.toLowerCase())) v.push({name: b.dataset.addcolor});
        renderColorRows(v.length ? v : [{name: ''}]);
        b.disabled = true; b.textContent = '✓ ' + b.dataset.addcolor;
      });
    };
    // ---- sizes ----
    const readSizeRowsRaw = () => [...$('#sizeRows').querySelectorAll('[data-size]')].map(inp => inp.value);
    const readSizeRows = () => readSizeRowsRaw().map(x => x.trim()).filter(Boolean);
    const renderSizeRows = vals => {
      $('#sizeRows').innerHTML = vals.map((sv, i) => `
        <div class="color-row">
          <input class="fi" data-size value="${DB.esc(sv)}" placeholder="e.g. 38 ya M">
          <button class="btn btn-red" data-rmsize="${i}" type="button">✕</button>
        </div>`).join('') || '<p class="sub">Koi size nahi — zaroorat ho to add karein.</p>';
      $('#sizeRows').querySelectorAll('[data-rmsize]').forEach(b => b.onclick = () => {
        const v = readSizeRowsRaw(); v.splice(+b.dataset.rmsize, 1); renderSizeRows(v);
      });
    };
    renderSizeRows((p.sizes || []).slice());
    $('#addSize').onclick = () => { renderSizeRows([...readSizeRowsRaw(), '']); };
    $('#sizePresetFoot').onclick = () => renderSizeRows(['36','37','38','39','40','41']);
    $('#sizePresetCloth').onclick = () => renderSizeRows(['S','M','L','XL']);
    let imgList = imgList0.slice();
    const renderImgList = () => {
      $('#imgList').innerHTML = imgList.map((u, i) => `
        <div class="img-item ${i === 0 ? 'primary' : ''}">
          <img src="${DB.esc(u)}" alt="">
          <div class="img-btns">
            ${i === 0 ? '<span class="prim-tag">★ Main</span>' : `<button class="btn btn-ghost" data-mkprim="${i}" type="button" title="Main photo banayein">★</button>`}
            <button class="btn btn-red" data-rmimg="${i}" type="button">✕</button>
          </div>
        </div>`).join('') || '<p class="sub">Koi photo nahi — neeche se select karein.</p>';
      $('#imgList').querySelectorAll('[data-rmimg]').forEach(b => b.onclick = () => { imgList.splice(+b.dataset.rmimg, 1); renderImgList(); });
      $('#imgList').querySelectorAll('[data-mkprim]').forEach(b => b.onclick = () => { const u = imgList.splice(+b.dataset.mkprim, 1)[0]; imgList.unshift(u); renderImgList(); });
    };
    renderImgList();
    // database ka 1MB limit hai — is liye total size check (count ki koi limit nahi)
    const imgsTooBig = arr => arr.join('').length > 850000;
    $('#f_imgfile').onchange = async e => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;
      const msg = $('#f_upmsg');
      msg.textContent = '⏳ Photos taiyar ho rahi hain...';
      for (const file of files) {
        try {
          const url = await DB.uploadImage(file, 'products');
          if (imgsTooBig([...imgList, url])) { alert('⚠️ Itni photos ka size zyada ho jayega — database mein save nahi hoga. Pehle 1-2 photos hatao, phir add karo.'); break; }
          imgList.push(url);
        }
        catch (err) { alert('Fail: ' + ((err && err.message) || err)); break; }
      }
      msg.textContent = '✅ Ho gayi!';
      renderImgList();
    };
    $('#f_addpath').onclick = () => {
      const v = $('#f_imgpath').value.trim();
      if (!v) return;
      if (imgsTooBig([...imgList, v])) { alert('⚠️ Photos ka total size zyada ho jayega — database limit hai.'); return; }
      if (!imgList.includes(v)) imgList.push(v);
      $('#f_imgpath').value = '';
      renderImgList();
    };

    $('#f_save').onclick = () => {
      const name = $('#f_name').value.trim();
      const price = Number($('#f_price').value);
      if (!name || isNaN(price)) { alert('Naam aur price zaroor likhein.'); return; }
      colorVals = readColorRows().filter(c => c.name);
      DB.saveProduct({
        id: p.id, name, category: $('#f_cat').value.trim(), price,
        status: $('#f_status').value === 'draft' ? 'draft' : 'active',
        stock: Number($('#f_stock').value) || 0,
        description: $('#f_desc').value.trim(),
        image: imgList[0] || '',
        images: imgList.slice(1),
        colors: colorVals,
        sizes: readSizeRows(),
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
  async function vReviews() {
    const main = document.getElementById('main');
    main.innerHTML = '<h2>⭐ Reviews</h2><p class="sub">Customers ke reviews — delete karne ke liye 🗑️ dabao.</p><div id="revList"><p class="sub">⏳ Load ho raha hai...</p></div>';
    const render = async () => {
      const revs = await DB.getReviews();
      const box = document.getElementById('revList');
      if (!revs.length) { box.innerHTML = '<p class="sub">Abhi koi review nahi hai.</p>'; return; }
      const stars = r => '★'.repeat(r) + '☆'.repeat(5 - r);
      box.innerHTML = revs.map(r => {
        const prod = DB.getProduct(r.productId);
        return `<div class="rev-admin">
          ${r.img ? `<img src="${DB.esc(r.img)}" class="rev-admin-img" alt="">` : ''}
          <div style="flex:1">
            <b>${DB.esc(r.name || 'Customer')}</b> <span class="stars">${stars(+r.rating || 5)}</span>
            <div class="sub">${DB.esc(prod ? prod.name : '')} · ${new Date(r.createdAt || Date.now()).toLocaleDateString('en-GB')}</div>
            <div>${DB.esc(r.text || '')}</div>
          </div>
          <button class="btn btn-red" data-delrev="${DB.esc(r.id)}" type="button">🗑️</button>
        </div>`;
      }).join('');
      box.querySelectorAll('[data-delrev]').forEach(b => b.onclick = async () => {
        if (!confirm('Ye review delete kar doon?')) return;
        await DB.deleteReview(b.dataset.delrev);
        render();
      });
    };
    render();
  }
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
      <div class="form-card"><h3>📊 TikTok Pixel <small style="color:var(--mut);font-weight:400">(ads ke liye — Events Manager se Pixel ID copy karke yahan paste karein)</small></h3>
        <div class="frow">
          <div><label class="fl">TikTok Pixel ID</label><input class="fi" id="s_pixel" value="${DB.esc(s.tiktokPixel || '')}" placeholder="e.g. D0ABC1234567890"></div>
          <div><label class="fl">&nbsp;</label><div class="lock" style="margin-top:0">💡 ID lagate hi website par pixel auto chal jayega — PageView, ViewContent, AddToCart, Checkout, Order sab track hoga.</div></div>
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
        instagram: $('#s_ig').value.trim(),
        tiktokPixel: $('#s_pixel').value.trim()
      };
      if (p1) upd.adminPass = p1;
      DB.saveSettings(upd);
      $('#s_msg').textContent = '✓ Settings save ho gayi.';
      $('#s_p1').value = $('#s_p2').value = '';
    };
  }
})();
