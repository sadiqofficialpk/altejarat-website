# Al Tejarat — E-commerce Website

**Tagline:** Everything You Need, Every Day!

Static e-commerce website (HTML/CSS/JS) — no server, no monthly cost. Deploy free on Netlify.

## Storefront (`index.html`)
- Home (hero + trust bar + Shop By Category circles + Best Sellers + Featured Collections + per-category sections + promos + Follow Us + How To Order, purple theme), Shop (search + category filter + price sort), Product page (color pills, quantity), Wishlist page (header ♥ button)
- Cart drawer, Checkout with Cash on Delivery
- **City autocomplete:** type to get suggestions from 69 Pakistani cities; delivery fee auto-applies — **Lahore Rs 250, other cities Rs 350** (both editable in admin Settings)
- **Address format:** House No → Area/Street → City (shown in admin + WhatsApp message in the same order)
- **Info pages:** About Us, Contact Us, Privacy Policy, Refund Policy (**no returns/refunds/exchanges**), Shipping Policy, Terms of Service — linked in the footer
- **WhatsApp ordering:** customer presses "WhatsApp par Order Karein" → their own WhatsApp opens with the full order (Order ID, items, color, price, total, name/phone/address) pre-written to your number — they just press Send. The message comes **from the customer's own number**.
- Every order gets a unique **Order ID** (AT-0001, AT-0002…), shown on the success page, in the admin panel, and in the WhatsApp message.

## Admin Panel (`admin.html`)
Password protected (default: `admin123` — **change it in Settings after first login**).
- **Dashboard:** revenue / **wholesale** / profit / orders / items with **time filter (Today, Yesterday, Last 7/30 Days, custom calendar range, All Time)**, new-order alerts, recent orders
- **Categories:** create / rename / delete / **reorder (↑↓)** / **custom image** categories (product form mein dropdown se select hoti hain; home page order follows admin order)
- **Products:** add / edit / delete products, stock, **Active/Draft status** (draft = website par hidden, delete kiye baghair) — product **image** (path to `images/` folder, live preview) and **colors** (add/remove list) are separate options
- **💰 Profit section (admin only):** wholesale price per product, auto-calculated profit per piece, full **Profit Report** (units sold, revenue, wholesale cost, profit, margin %, grand totals). Wholesale prices and profit are **never shown** on the customer website.
- **Orders:** full order list with Order ID, customer details, status (Pending → Confirmed → Delivered / Cancelled), order detail view
- **Settings:** store name, tagline, WhatsApp number, **delivery fees (Lahore / other cities)**, announcement bar, **social media links (TikTok/Facebook/Instagram — footer + Follow Us section)**, admin password

## ☁️ Firebase Backend (multi-device sync)
Website 2 modes mein chalti hai — khud select ho jata hai:

- **Cloud mode** (recommended): `js/firebase-config.js` mein apna Firebase config paste karo →
  products, categories, orders, settings sab devices par synced. Kisi bhi mobile/laptop se
  admin kholo — sab kuch nazar aayega. **Photos direct device se upload** hoti hain
  (browser mein compress hokar database mein save — koi credit card nahi chahiye).
- **Local mode**: config nahi lagi to website purani tarah browser localStorage
  mein chalti hai (single device).

**Firebase setup (ek dafa):**
1. console.firebase.google.com → project `al-tejarat` banao
2. **Firestore Database** → Create database → **Start in test mode** → Enable
3. ~~**Storage**~~ → SKIP (credit card mangta hai, zaroorat nahi)
4. ⚙️ Project settings → Your apps → `</>` Web → config copy karo →
   `js/firebase-config.js` mein `window.FIREBASE_CONFIG = {...}` mein paste karo
5. Firestore → **Rules** tab → `firestore.rules` file ka content paste → Publish
6. ~~Storage rules~~ → SKIP
7. GitHub par upload karo → Netlify deploy. Admin mein **☁️ Cloud connected** nazar aayega.

## Deploy: GitHub → Netlify
1. Create a new repo on GitHub, upload all these files (keep the folder structure).
2. Netlify → **Add new site → Import an existing project** → connect GitHub → select the repo → Deploy. Done — no build settings needed.
3. (Optional) **Email notification on every order:** Netlify Dashboard → your site → **Forms** → **Form notifications** → add your email. The checkout form posts to Netlify Forms automatically.

## Notes
- **Local mode** mein products/orders/settings browser localStorage mein hote hain (single device).
  **Cloud mode** (Firebase config lagi ho) mein sab kuch cloud mein synced rehta hai —
  kisi bhi device se admin kholo, sab nazar aayega.
- The admin login is basic client-side protection — fine for a small store; don't share the password.
