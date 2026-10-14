/* ============================================================
   Al Tejarat — Firebase Config
   ------------------------------------------------------------
   STEP 1: Firebase console kholo (console.firebase.google.com)
   STEP 2: Apna project "al-tejarat" kholo
   STEP 3: Top-left ⚙️ Project settings → neeche "Your apps"
           →  </>  (Web) icon → nickname likho → Register app
   STEP 4: Wahan jo config code mile (apiKey, authDomain...),
           usay neeche FIREBASE_CONFIG mein paste kar do.

   Agar ye null raha to website purani tarah localStorage
   mode mein chalegi — kuch nahi tootega.
   ============================================================ */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDpjC93vBSQyJo-303oCIEaGm9krM8oxb0",
  authDomain: "al-tejarat.firebaseapp.com",
  projectId: "al-tejarat",
  storageBucket: "al-tejarat.firebasestorage.app",
  messagingSenderId: "692258813850",
  appId: "1:692258813850:web:b037b43d7308fa2173ac23"
};

/* --- APNA CONFIG YAHAN PASTE KARO (example): ---
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "al-tejarat.firebaseapp.com",
  projectId: "al-tejarat",
  storageBucket: "al-tejarat.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
*/
