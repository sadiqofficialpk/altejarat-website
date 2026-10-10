/* ============================================================
   Al Tejarat - data layer
   CLOUD MODE:  Firebase (Firestore + Storage) — sab devices synced
   LOCAL MODE:  browser localStorage — purani tarah, single device
   Mode khud select hota hai: js/firebase-config.js mein
   FIREBASE_CONFIG laga to CLOUD, warna LOCAL.
   ------------------------------------------------------------
   Public API bilkul same hai dono modes mein — baqi code
   (store.js / admin.js) ko farq nahi parta.
   ============================================================ */
const DB = (() => {
  const K = {
    products: 'altejarat_products_v1',
    costs: 'altejarat_costs_v1',       // wholesale prices - ADMIN ONLY
    orders: 'altejarat_orders_v1',
    settings: 'altejarat_settings_v1',
    seq: 'altejarat_seq_v1',
    lastSeen: 'altejarat_lastseen_v1',
    categories: 'altejarat_categories_v1',
    catImages: 'altejarat_cat_images_v1'
  };

  const read = (k, fb) => {
    try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : fb; }
    catch (e) { return fb; }
  };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const money = n => 'Rs ' + (Number(n) || 0).toLocaleString('en-PK');
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Pakistan cities for the checkout autocomplete
  const CITIES = ['Lahore','Karachi','Islamabad','Rawalpindi','Faisalabad','Multan','Peshawar','Quetta',
    'Sialkot','Gujranwala','Hyderabad','Bahawalpur','Sargodha','Abbottabad','Attock','Bahawalnagar','Bannu',
    'Chakwal','Chiniot','Dera Ghazi Khan','Dera Ismail Khan','Gujrat','Hafizabad','Haripur','Jacobabad',
    'Jhang','Jhelum','Kamalia','Kasur','Khanewal','Kharian','Khushab','Kohat','Larkana','Layyah','Lodhran',
    'Mailsi','Mandi Bahauddin','Mansehra','Mardan','Mianwali','Mirpur','Mirpur Khas','Muzaffargarh',
    'Nankana Sahib','Narowal','Nawabshah','Nowshera','Okara','Pakpattan','Rahim Yar Khan','Rajanpur',
    'Sahiwal','Sheikhupura','Shikarpur','Mingora','Tando Adam','Taxila','Vehari','Wah Cantt',
    'Wazirabad','Zhob','Chaman','Gwadar','Hub','Turbat','Dadu','Khairpur','Yazman'];

  const SEED_PRODUCTS = [
    {
      id: 'p1', name: 'Michael Kors Style Handbag', status: 'active', category: 'Handbags',
      price: 1999, stock: 50, featured: true,
      image: 'images/bag_8_lavender.jpg',
      colors: ['Lavender','Rose Pink','Sage Green','Royal Navy','Maroon','Tan','Dark Brown','Black'],
      description: 'Premium quality stylish handbag with leather flower charm. Perfect for daily use and parties. 8 khoobsurat colors mein available!'
    },
    {
      id: 'p2', name: 'Royal Bow Kids Slippers', status: 'active', category: 'Footwear',
      price: 1499, stock: 40, featured: true,
      image: 'images/slippers.jpg',
      colors: ['Pink','Purple'],
      description: 'Beautiful jeweled bow design, soft finish & comfy fit. Sizes 36 to 41. Cute, comfy, sparkly!'
    },
    {
      id: 'p3', name: 'Smart Hair Brush', status: 'active', category: 'Beauty',
      price: 2499, stock: 30, featured: true,
      image: 'images/hairbrush.jpg',
      colors: ['White'],
      description: 'Electric smart hair brush with display and gold-accented handle. Smooth, shiny hair in minutes!'
    }
  ];
  const SEED_SETTINGS = {
    storeName: 'Al Tejarat',
    tagline: 'Everything You Need, Every Day!',
    whatsapp: '923348954786',
    deliveryLahore: 250,
    deliveryOther: 350,
    adminPass: 'admin123',       // admin MUST change after first login
    announcements: 'Cash on Delivery available all over Pakistan!',
    tiktok: '', facebook: '', instagram: ''
  };
  const DEFAULT_CATS = ['Handbags', 'Footwear', 'Beauty', 'Health'];

  /* ================= LOCAL (localStorage) implementation ================= */

  function L_seedIfEmpty() {
    if (read(K.products, null)) return;
    write(K.products, SEED_PRODUCTS);
    write(K.costs, {});
    write(K.orders, []);
    write(K.seq, 0);
    L_seedCategories();
    write(K.settings, Object.assign({}, SEED_SETTINGS));
  }

  function L_migrate() {
    L_seedCategories();
    let changed = false;
    const products = L_getProducts();
    products.forEach(p => {
      if (!p.status) { p.status = 'active'; changed = true; }
      if (p.colors && p.colors.length && typeof p.colors[0] === 'object') {
        p.image = (p.colors[0] && p.colors[0].img) || p.image || '';
        p.colors = p.colors.map(c => (c && c.name) || '').filter(Boolean);
        changed = true;
      }
      if (!Array.isArray(p.colors)) { p.colors = []; changed = true; }
    });
    if (changed) write(K.products, products);
    const s = L_getSettings();
    ['tiktok', 'facebook', 'instagram'].forEach(k => { if (s[k] === undefined) { s[k] = ''; changed = true; } });
    if (changed) write(K.settings, s);
    if (s.deliveryFee !== undefined && s.deliveryLahore === undefined) {
      s.deliveryLahore = s.deliveryFee;
      s.deliveryOther = 350;
      delete s.deliveryFee;
      write(K.settings, s);
    }
  }

  const L_getProducts = () => read(K.products, []);
  const L_getProduct = id => L_getProducts().find(p => p.id === id);
  const L_saveProduct = p => {
    const all = L_getProducts();
    const i = all.findIndex(x => x.id === p.id);
    if (i >= 0) all[i] = p; else all.push(p);
    write(K.products, all);
  };
  const L_deleteProduct = id => write(K.products, L_getProducts().filter(p => p.id !== id));

  const L_getCosts = () => read(K.costs, {});
  const L_setCost = (pid, cost) => { const c = L_getCosts(); c[pid] = cost; write(K.costs, c); };

  const L_nextOrderId = () => {
    const n = (read(K.seq, 0) || 0) + 1;
    write(K.seq, n);
    return 'AT-' + String(n).padStart(4, '0');
  };

  const L_addOrder = o => { const all = read(K.orders, []); all.unshift(o); write(K.orders, all); };
  const L_getOrders = () => read(K.orders, []);
  const L_setOrderStatus = (id, status) => {
    const all = L_getOrders(); const o = all.find(x => x.id === id);
    if (o) { o.status = status; write(K.orders, all); }
  };

  const L_getSettings = () => read(K.settings, {});
  const L_saveSettings = s => write(K.settings, Object.assign(L_getSettings(), s));

  const L_getCategories = () => read(K.categories, null) || [];
  const L_saveCategories = list => write(K.categories, list);
  const L_addCategory = name => {
    name = String(name || '').trim();
    if (!name) return false;
    const list = L_getCategories();
    if (list.some(c => c.toLowerCase() === name.toLowerCase())) return false;
    list.push(name); L_saveCategories(list); return true;
  };
  const L_renameCategory = (oldName, newName) => {
    newName = String(newName || '').trim();
    if (!newName) return false;
    const list = L_getCategories();
    const i = list.indexOf(oldName);
    if (i < 0) return false;
    if (list.some((c, j) => j !== i && c.toLowerCase() === newName.toLowerCase())) return false;
    list[i] = newName; L_saveCategories(list);
    const m = L_getCatImages();
    if (m[oldName] !== undefined) { m[newName] = m[oldName]; delete m[oldName]; write(K.catImages, m); }
    const prods = L_getProducts();
    let changed = false;
    prods.forEach(p => { if (p.category === oldName) { p.category = newName; changed = true; } });
    if (changed) write(K.products, prods);
    return true;
  };
  const L_deleteCategory = name => {
    L_saveCategories(L_getCategories().filter(c => c !== name));
    const m = L_getCatImages();
    if (m[name] !== undefined) { delete m[name]; write(K.catImages, m); }
  };
  const L_moveCategory = (name, dir) => {
    const list = L_getCategories();
    const i = list.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    L_saveCategories(list);
    return true;
  };
  const L_seedCategories = () => {
    if (read(K.categories, null)) return;
    const fromProducts = [...new Set(L_getProducts().map(p => (p.category || '').trim()).filter(Boolean))];
    L_saveCategories(fromProducts.length ? fromProducts : DEFAULT_CATS.slice());
  };
  const L_getCatImages = () => read(K.catImages, {});
  const L_getCategoryImage = name => L_getCatImages()[name] || '';
  const L_setCategoryImage = (name, path) => {
    const m = L_getCatImages();
    path = String(path || '').trim();
    if (path) m[name] = path; else delete m[name];
    write(K.catImages, m);
  };

  /* ================= CLOUD (Firestore) implementation ================= */

  let CLOUD = false;
  let fdb = null, fstore = null;
  let cache = null;                    // {products, categories, settings, orders, seq}
  const orderDocIds = new Map();       // order.id -> firestore doc id
  let ordersCb = null;

  const clean = o => {                 // Firestore hates undefined
    const c = {};
    Object.keys(o || {}).forEach(k => { if (o[k] !== undefined) c[k] = o[k]; });
    return c;
  };
  const bg = p => p.catch(e => console.warn('Cloud write failed:', e && e.message));

  async function cloudLoad() {
    const [ps, cs, ss, os, meta] = await Promise.all([
      fdb.collection('products').get(),
      fdb.collection('categories').get(),
      fdb.collection('settings').doc('main').get(),
      fdb.collection('orders').orderBy('date', 'desc').limit(1000).get(),
      fdb.collection('meta').doc('counters').get()
    ]);
    cache = {
      products: ps.docs.map(d => Object.assign({ id: d.id }, d.data())),
      categories: cs.docs.map(d => Object.assign({ name: d.id }, d.data())),
      settings: ss.exists ? ss.data() : null,
      orders: [],
      seq: meta.exists ? (meta.data().seq || 0) : 0
    };
    os.docs.forEach(d => {
      const o = Object.assign({ id: d.id }, d.data());
      orderDocIds.set(o.id, d.id);
      cache.orders.push(o);
    });
    if (!cache.settings) await cloudSeed();   // pehli dafa: sample data
  }

  async function cloudSeed() {
    const batch = fdb.batch();
    SEED_PRODUCTS.forEach(p => batch.set(fdb.collection('products').doc(p.id), clean(p)));
    DEFAULT_CATS.forEach((c, i) => batch.set(fdb.collection('categories').doc(c), { name: c, image: '', order: i }));
    batch.set(fdb.collection('settings').doc('main'), clean(SEED_SETTINGS));
    batch.set(fdb.collection('meta').doc('counters'), { seq: 0 });
    await batch.commit();
    await cloudLoad();
  }

  function cloudListen() {
    fdb.collection('products').onSnapshot(snap => {
      if (!cache) return;
      cache.products = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    });
    fdb.collection('categories').onSnapshot(snap => {
      if (!cache) return;
      cache.categories = snap.docs.map(d => Object.assign({ name: d.id }, d.data()));
    });
    fdb.collection('settings').doc('main').onSnapshot(doc => {
      if (!cache || !doc.exists) return;
      cache.settings = doc.data();
    });
    fdb.collection('orders').orderBy('date', 'desc').limit(1000).onSnapshot(snap => {
      if (!cache) return;
      cache.orders = [];
      snap.docs.forEach(d => {
        const o = Object.assign({ id: d.id }, d.data());
        orderDocIds.set(o.id, d.id);
        cache.orders.push(o);
      });
      if (ordersCb) { try { ordersCb(); } catch (e) {} }
    });
  }

  const C_getProducts = () => cache.products.map(p => Object.assign({}, p));
  const C_getProduct = id => {
    const p = cache.products.find(x => x.id === id);
    return p ? Object.assign({}, p) : undefined;
  };
  const C_saveProduct = p => {
    const i = cache.products.findIndex(x => x.id === p.id);
    const keep = i >= 0 ? cache.products[i] : {};
    const doc = Object.assign({}, p);
    if (doc.wholesale === undefined) doc.wholesale = keep.wholesale;
    if (i >= 0) cache.products[i] = doc; else cache.products.push(doc);
    bg(fdb.collection('products').doc(p.id).set(clean(doc), { merge: true }));
  };
  const C_deleteProduct = id => {
    cache.products = cache.products.filter(p => p.id !== id);
    bg(fdb.collection('products').doc(id).delete());
  };

  // wholesale cloud mein product doc ke andar rehta hai
  const C_getCosts = () => {
    const c = {};
    cache.products.forEach(p => {
      if (p.wholesale !== undefined && p.wholesale !== '' && !isNaN(Number(p.wholesale))) c[p.id] = p.wholesale;
    });
    return c;
  };
  const C_setCost = (pid, cost) => {
    const p = cache.products.find(x => x.id === pid);
    if (p) p.wholesale = cost;
    bg(fdb.collection('products').doc(pid).set({ wholesale: cost }, { merge: true }));
  };

  const C_nextOrderId = () =>
    fdb.runTransaction(async t => {
      const ref = fdb.collection('meta').doc('counters');
      const d = await t.get(ref);
      const cur = d.exists ? (d.data().seq || 0) : 0;
      t.set(ref, { seq: cur + 1 }, { merge: true });
      return cur + 1;
    }).then(n => 'AT-' + String(n).padStart(4, '0'));

  const C_addOrder = o => {
    cache.orders.unshift(Object.assign({}, o));
    bg(fdb.collection('orders').add(clean(o)).then(ref => orderDocIds.set(o.id, ref.id)));
  };
  const C_getOrders = () => cache.orders.map(o => Object.assign({}, o));
  const C_setOrderStatus = (id, status) => {
    const o = cache.orders.find(x => x.id === id);
    if (o) o.status = status;
    const docId = orderDocIds.get(id);
    if (docId) bg(fdb.collection('orders').doc(docId).update({ status }));
  };

  const C_getSettings = () => Object.assign({}, cache.settings || SEED_SETTINGS);
  const C_saveSettings = s => {
    cache.settings = Object.assign({}, cache.settings, s);
    bg(fdb.collection('settings').doc('main').set(clean(cache.settings), { merge: true }));
  };

  const C_getCategories = () =>
    cache.categories.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(c => c.name);
  const C_addCategory = name => {
    name = String(name || '').trim();
    if (!name) return false;
    if (cache.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return false;
    const order = cache.categories.reduce((m, c) => Math.max(m, c.order || 0), -1) + 1;
    cache.categories.push({ name, image: '', order });
    bg(fdb.collection('categories').doc(name).set({ name, image: '', order }));
    return true;
  };
  // rename: category doc + saare products update (batch, optimistic)
  const C_renameCategory = (oldName, newName) => {
    newName = String(newName || '').trim();
    if (!newName) return false;
    const cat = cache.categories.find(c => c.name === oldName);
    if (!cat) return false;
    if (cache.categories.some(c => c.name !== oldName && c.name.toLowerCase() === newName.toLowerCase())) return false;
    const batch = fdb.batch();
    batch.delete(fdb.collection('categories').doc(oldName));
    batch.set(fdb.collection('categories').doc(newName), clean({ name: newName, image: cat.image || '', order: cat.order || 0 }));
    cache.products.forEach(p => {
      if (p.category === oldName) {
        p.category = newName;
        batch.update(fdb.collection('products').doc(p.id), { category: newName });
      }
    });
    bg(batch.commit());
    cat.name = newName;
    return true;
  };
  const C_deleteCategory = name => {
    cache.categories = cache.categories.filter(c => c.name !== name);
    bg(fdb.collection('categories').doc(name).delete());
  };
  const C_moveCategory = (name, dir) => {
    const sorted = cache.categories.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const i = sorted.findIndex(c => c.name === name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return false;
    const a = sorted[i], b = sorted[j];
    const t = a.order; a.order = b.order; b.order = t;
    bg(fdb.collection('categories').doc(a.name).update({ order: a.order }));
    bg(fdb.collection('categories').doc(b.name).update({ order: b.order }));
    return true;
  };
  const C_getCategoryImage = name => {
    const c = cache.categories.find(x => x.name === name);
    return (c && c.image) || '';
  };
  const C_setCategoryImage = (name, path) => {
    const c = cache.categories.find(x => x.name === name);
    if (c) c.image = String(path || '').trim();
    bg(fdb.collection('categories').doc(name).set({ image: String(path || '').trim() }, { merge: true }));
  };

  /* ---- image upload: browser mein resize+compress → base64 ----
     Firebase Storage ke liye credit card chahiye, is liye photo
     yahin chhoti karke database mein save hoti hai. Koi card nahi! */
  function resizeImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          let w = img.width, h = img.height;
          const sc = Math.min(1, maxSize / Math.max(w, h));
          w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', quality));
        } catch (e) { reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo parh nahi saki')); };
      img.src = url;
    });
  }
  async function uploadImage(file, folder) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Sirf photo select karein');
    return await resizeImage(file, 800, 0.72);
  }

  /* ================= INIT ================= */

  async function init() {
    const cfg = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) || null;
    if (cfg && typeof firebase !== 'undefined') {
      try {
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        fdb = firebase.firestore();
        try { await fdb.enablePersistence(); } catch (e) { /* private mode etc. */ }
        fstore = firebase.storage();
        await cloudLoad();
        CLOUD = true;
        try { cloudListen(); } catch (e) { console.warn('Realtime listeners off:', e); }
      } catch (e) { console.warn('Firebase init failed — local mode:', e); }
    }
    if (!CLOUD) { L_seedIfEmpty(); L_migrate(); }
  }

  /* ================= PUBLIC API (mode-independent) ================= */

  const getProducts = () => CLOUD ? C_getProducts() : L_getProducts();
  const getProduct = id => CLOUD ? C_getProduct(id) : L_getProduct(id);
  const saveProduct = p => CLOUD ? C_saveProduct(p) : L_saveProduct(p);
  const deleteProduct = id => CLOUD ? C_deleteProduct(id) : L_deleteProduct(id);

  const getCosts = () => CLOUD ? C_getCosts() : L_getCosts();
  const setCost = (pid, cost) => CLOUD ? C_setCost(pid, cost) : L_setCost(pid, cost);

  // NOTE: hamesha Promise return karta hai (cloud mein transaction lagta hai)
  const nextOrderId = () => CLOUD ? C_nextOrderId() : Promise.resolve(L_nextOrderId());

  const addOrder = o => CLOUD ? C_addOrder(o) : L_addOrder(o);
  const getOrders = () => CLOUD ? C_getOrders() : L_getOrders();
  const setOrderStatus = (id, status) => CLOUD ? C_setOrderStatus(id, status) : L_setOrderStatus(id, status);

  const getSettings = () => CLOUD ? C_getSettings() : L_getSettings();
  const saveSettings = s => CLOUD ? C_saveSettings(s) : L_saveSettings(s);

  const getCategories = () => CLOUD ? C_getCategories() : L_getCategories();
  const addCategory = name => CLOUD ? C_addCategory(name) : L_addCategory(name);
  const renameCategory = (a, b) => CLOUD ? C_renameCategory(a, b) : L_renameCategory(a, b);
  const deleteCategory = name => CLOUD ? C_deleteCategory(name) : L_deleteCategory(name);
  const moveCategory = (name, dir) => CLOUD ? C_moveCategory(name, dir) : L_moveCategory(name, dir);
  const getCategoryImage = name => CLOUD ? C_getCategoryImage(name) : L_getCategoryImage(name);
  const setCategoryImage = (name, path) => CLOUD ? C_setCategoryImage(name, path) : L_setCategoryImage(name, path);

  // lastSeen device-local rehta hai (har device ka apna "naya order" hisaab)
  const markSeen = () => write(K.lastSeen, Date.now());
  const newOrderCount = () => {
    const seen = read(K.lastSeen, 0);
    return getOrders().filter(o => new Date(o.date).getTime() > seen).length;
  };
  const onOrdersChanged = cb => { ordersCb = cb; };

  // City-wise delivery fee: Lahore special, everything else standard
  function deliveryFeeFor(city) {
    const s = getSettings();
    const lahore = (s.deliveryLahore !== undefined) ? s.deliveryLahore : 250;
    const other = (s.deliveryOther !== undefined) ? s.deliveryOther : 350;
    return (String(city || '').trim().toLowerCase() === 'lahore') ? lahore : other;
  }

  function productImage(p) {
    if (p.image) return p.image;
    if (p.colors && p.colors[0] && p.colors[0].img) return p.colors[0].img; // very old data
    return '';
  }
  // gallery: primary image + extra images
  function productImages(p) {
    const arr = [];
    if (p.image) arr.push(p.image);
    (p.images || []).forEach(u => { if (u && !arr.includes(u)) arr.push(u); });
    if (!arr.length && p.colors && p.colors[0] && p.colors[0].img) arr.push(p.colors[0].img);
    return arr;
  }

  // storefront par sirf wahi products: active + jin ki category maujood ho
  const visibleProducts = () => {
    const cats = getCategories();
    return getProducts().filter(p => p.status !== 'draft' && p.category && cats.includes(p.category));
  };

  // profit math (admin only)
  function profitStats(fromTs, toTs) {
    const costs = getCosts();
    let orders = getOrders().filter(o => o.status !== 'Cancelled');
    if (fromTs !== undefined && fromTs !== null) {
      orders = orders.filter(o => {
        const t = new Date(o.date).getTime();
        return t >= fromTs && (toTs === undefined || toTs === null || t < toTs);
      });
    }
    let revenue = 0, cost = 0, units = 0;
    const perProduct = {};
    orders.forEach(o => {
      (o.items || []).forEach(it => {
        const pid = it.pid;
        const c = Number(costs[pid]);
        const hasCost = costs[pid] !== undefined && costs[pid] !== '' && !isNaN(c);
        revenue += it.price * it.qty;
        units += it.qty;
        if (!perProduct[pid]) perProduct[pid] = { name: it.name, units: 0, revenue: 0, cost: 0, hasCost: true };
        perProduct[pid].units += it.qty;
        perProduct[pid].revenue += it.price * it.qty;
        if (hasCost) perProduct[pid].cost += c * it.qty;
        else perProduct[pid].hasCost = false;
        if (hasCost) cost += c * it.qty;
      });
    });
    const allHaveCost = Object.keys(perProduct).every(pid => perProduct[pid].hasCost);
    return { revenue, cost: allHaveCost ? cost : null, profit: allHaveCost ? revenue - cost : null, units, perProduct, allHaveCost };
  }

  return {
    init, ready: () => CLOUD, isCloud: () => CLOUD, uploadImage, onOrdersChanged,
    money, esc, CITIES, deliveryFeeFor, productImage, productImages,
    getCategories, addCategory, renameCategory, deleteCategory, moveCategory,
    getCategoryImage, setCategoryImage,
    getProducts, getProduct, saveProduct, deleteProduct, visibleProducts,
    getCosts, setCost,
    nextOrderId, addOrder, getOrders, setOrderStatus,
    getSettings, saveSettings,
    markSeen, newOrderCount, profitStats
  };
})();
