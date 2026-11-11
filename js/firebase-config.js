/* Firebase web config for the Rada Republic project.
   These values are public by design (they identify the project, they are not passwords).
   Access to data is controlled by the Firestore security rules in firestore.rules. */
window.RR_FIREBASE = {
  apiKey: "AIzaSyA_mhpr5En2Hryzn1oEYUk-Zh6zTY3jJNE",
  authDomain: "radarepublic-bdf80.firebaseapp.com",
  projectId: "radarepublic-bdf80",
  storageBucket: "radarepublic-bdf80.firebasestorage.app",
  messagingSenderId: "683664885710",
  appId: "1:683664885710:web:556934705bbe4f04484d9f"
};

/* Server functions run on Netlify. On the Netlify site they're same-origin;
   anywhere else (GitHub Pages, local preview) we call the Netlify site directly. */
window.RR_API = /netlify\.app$/.test(location.hostname) ? "" : "https://radarepublic.netlify.app";
