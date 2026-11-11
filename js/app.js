/* =========================================================
   RADA REPUBLIC — shared app logic
   Header, footer, search, auth (mock), cart, orders, toasts.

   NOTE: Auth, orders and payments are mocked with localStorage
   so the whole flow can be clicked through today. Every place
   that needs the real backend is marked with  // BACKEND:
   ========================================================= */
(function () {
  "use strict";
  const D = window.RR_DATA;
  const SAMPLE = JSON.parse(JSON.stringify(D));   // bundled starter data, before the database overrides it
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- storage ---------- */
  const mk = (area) => ({
    get(k, d) { try { const v = window[area].getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { window[area].setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { window[area].removeItem(k); } catch (e) {} }
  });
  const store = mk("localStorage");
  const sess = mk("sessionStorage");

  /* ---------- helpers ---------- */
  const fmt = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const qs = (k) => new URLSearchParams(location.search).get(k);
  const dt = (iso) => new Date(iso);
  const fmtDate = (iso) => dt(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtShort = (iso) => dt(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const fmtTime = (iso) => dt(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const minPrice = (e) => Math.min(...e.tiers.filter((t) => !t.soldOut).map((t) => t.price));
  const rid = (n = 8) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const getEvent = (id) => D.events.find((e) => e.id === id);
  const getProduct = (id) => D.products.find((p) => p.id === id);
  const upcomingEvents = () => D.events.filter((e) => dt(e.date) >= new Date(new Date().toDateString())).sort((a, b) => dt(a.date) - dt(b.date));
  const featuredEvent = () => upcomingEvents().find((e) => e.featured) || upcomingEvents()[0] || D.events[0];
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  /* ---------- icons ---------- */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.3l2.6 11.8a1 1 0 0 0 1 .8h9.4a1 1 0 0 0 1-.8L21 7.5H6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.700 9.700 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    ticket: '<path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z"/><path d="M14 5v2M14 11v2M14 17v2"/>',
    bag: '<path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    login: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
    userPlus: '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    mobile: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    truck: '<path d="M2 6h12v10H2zM14 9h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/>',
    star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.4-9.4C1.3 7.3 3.4 4 6.8 4c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.4 0 5.5 3.3 4.2 6.6C19.5 15.4 12 20 12 20z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    // filled brand icons
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.4" cy="6.6" r="1.2"/>',
    tiktok: '<path d="M16.2 3c.3 2.3 1.8 3.9 4 4.1v3.2a7.200 7.200 0 0 1-4-1.2v6.3A6.100 6.100 0 1 1 10 9.3v3.3a2.900 2.900 0 1 0 2.9 2.900V3z"/>',
    x: '<path d="M17.7 3h3.2l-7 8 8.2 10h-6.400l-5-6.5L4.900 21H1.700l7.500-8.600L1.300 3h6.600l4.500 6zm-1.100 16h1.800L7.400 4.900H5.500z"/>',
    facebook: '<path d="M14 8.5V7c0-.8.3-1.200 1.300-1.200H17V2.200a22 22 0 0 0-2.600-.2C11.700 2 10 3.600 10 6.600v1.900H7v3.700h3V22h4v-9.800h3l.5-3.700z"/>',
    youtube: '<path d="M22 8.200a3 3 0 0 0-2.100-2.100C18 5.600 12 5.600 12 5.600s-6 0-7.900.5A3 3 0 0 0 2 8.200 31 31 0 0 0 1.600 12 31 31 0 0 0 2 15.800a3 3 0 0 0 2.100 2.100c1.900.5 7.900.5 7.900.5s6 0 7.900-.5a3 3 0 0 0 2.100-2.100c.4-1.200.4-3.800.4-3.800s0-2.600-.4-3.800zM10 15.100V8.900l5.200 3.100z"/>',
    whatsapp: '<path d="M12 2a10 10 0 0 0-8.600 15.100L2 22l5-1.300A10 10 0 1 0 12 2zm5.400 14.200c-.2.600-1.300 1.200-1.800 1.300-.5 0-1 .2-3.200-.7-2.700-1.100-4.400-3.800-4.500-4-.1-.2-1.100-1.400-1.100-2.700s.7-1.900.9-2.200c.2-.3.500-.3.700-.3h.5c.2 0 .4 0 .6.500l.8 2c.1.200.1.400 0 .600l-.4.600-.4.400c-.1.200-.3.300-.1.600.2.300.8 1.300 1.700 2.100 1.200 1 2.100 1.300 2.400 1.500.3.100.5.100.7-.1l1-1.200c.2-.3.4-.2.700-.1l2 1c.3.100.5.200.5.300.1.100.1.700-.1 1.300z"/>'
  };
  const FILLED = new Set(["instagram", "tiktok", "x", "facebook", "youtube", "whatsapp"]);
  function icon(name, cls = "") {
    const d = ICONS[name] || "";
    return FILLED.has(name)
      ? `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`
      : `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  /* ---------- visuals ---------- */
  function poster(e, size = "") {
    if (e.image) return `<div class="poster has-img ${size}"><img class="real" src="${esc(e.image)}" alt="${esc(e.title)}" loading="lazy"></div>`;
    const img = "";
    return `<div class="poster ${size}" style="--a:${e.a || "#ff2e93"};--b:${e.b || "#b44dff"}">
      ${img}<span class="ring"></span><span class="ring r2"></span>
      <span class="p-cat">${esc(e.category)}</span><span class="p-brand">RR</span>
      <div class="p-date">${esc(fmtShort(e.date))} · ${esc(e.city)}</div>
      <div class="p-title">${esc(e.title)}</div>
    </div>`;
  }
  const SHAPES = {
    tee: '<path d="M8.300 3 3 6l2.200 5 2.800-1.200V21h8V9.800L18.800 11 21 6l-5.300-3c-.6 1.700-2 2.700-3.700 2.700S8.900 4.700 8.300 3z"/>',
    hoodie: '<path d="M8 3.500C8.500 5.700 10 7 12 7s3.500-1.300 4-3.500L21 7l-2 6-2.200-1V21H7.200v-9L5 13 3 7z"/><path d="M10.500 7.500v4M13.500 7.500v4" stroke="rgba(0,0,0,.35)" stroke-width=".7"/><rect x="9" y="15" width="6" height="3" rx=".8" fill="rgba(0,0,0,.18)"/>',
    cap: '<path d="M3.500 15a8.500 8.500 0 0 1 17 0z"/><path d="M12 15h10.500a1.500 1.500 0 0 1-1.500 1.500H12z"/><circle cx="12" cy="6.300" r=".9"/>',
    bag: '<path d="M5 8.500h14L18 21H6z"/><path d="M8.800 8.500V6.300a3.200 3.200 0 0 1 6.400 0v2.200" fill="none" stroke="#fff" stroke-width="1.300"/>',
    band: '<circle cx="12" cy="12" r="7.500" fill="none" stroke="#fff" stroke-width="2.600"/><circle cx="12" cy="12" r="4.500" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.600"/>',
    bucket: '<path d="M7.500 13 8.600 6.500h6.800L16.500 13z"/><ellipse cx="12" cy="14" rx="9.500" ry="2.600"/>',
    pants: '<path d="M7 3h10l1.300 18h-4.500L12 10.500 10.200 21H5.700z"/>'
  };
  function productArt(p) {
    if (p.image) return `<div class="product-art"><img src="${esc(p.image)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`;
    const mono = ["tee", "hoodie", "bag"].includes(p.shape) ? '<span class="mono">RR</span>' : "";
    return `<div class="product-art" style="--a:${p.a}55;--b:${p.b}44"><svg viewBox="0 0 24 24" fill="#f4eefa">${SHAPES[p.shape] || SHAPES.tee}</svg>${mono}</div>`;
  }

  // Event card: banner image on top, plain details underneath.
  // opts.price = false → just the name and when (used on the homepage).
  function eventCard(e, opts) {
    const showPrice = !(opts && opts.price === false);
    const when = showPrice
      ? `${fmtShort(e.date).toUpperCase()} · ${esc(e.city)}`
      : `${esc(fmtDate(e.date))} · ${esc(fmtTime(e.date))}`;
    return `<a class="ev-card" href="event.html?id=${e.id}">
      <div class="ev-media"><span class="ev-cat">${esc(e.category)}</span>${poster(e)}</div>
      <div class="ev-title">${esc(e.title)}</div>
      <div class="ev-meta">${when}</div>
      ${showPrice ? `<div class="ev-price">From <b>${fmt(minPrice(e))}</b></div>` : ""}
    </a>`;
  }
  // Merch card: same layout as the event card (image on top, details underneath).
  function productCard(p) {
    const sizes = p.sizes.length === 1 ? p.sizes[0] : `Sizes ${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}`;
    return `<a class="ev-card" href="product.html?id=${p.id}">
      <div class="ev-media"><span class="ev-cat">${esc(p.category)}</span>${productArt(p)}</div>
      <div class="ev-title">${esc(p.name)}</div>
      <div class="ev-meta">${p.badge ? `<span class="ev-flag">${esc(p.badge)}</span> · ` : ""}${esc(sizes)}</div>
      <div class="ev-price solo"><b>${fmt(p.price)}</b></div>
    </a>`;
  }

  /* =========================================================
     AUTH — Firebase
     Sign in with Google, email + password, or phone + password.
     Phone + password: a Netlify function (netlify/functions/phone-login.mjs) looks up the
     account linked to the phone, checks the password, and returns a one-time sign-in token.
     Profiles live in Firestore at users/{uid}; phones/{phone} maps a phone number to its account.
     ========================================================= */
  const normPhone = (p) => { p = String(p || "").replace(/\D/g, ""); if (p.startsWith("254")) p = p.slice(3); if (p.startsWith("0")) p = p.slice(1); return p; };
  const validPhone = (p) => /^[71]\d{8}$/.test(normPhone(p));
  const validEmail = (e) => /^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(String(e || "").trim());
  const prettyPhone = (p) => { p = normPhone(p); return p ? `0${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : ""; };

  const fb = window.firebase && window.RR_FIREBASE ? (firebase.apps.length ? firebase.app() : firebase.initializeApp(window.RR_FIREBASE)) : null;
  const auth = fb ? firebase.auth() : null;
  const db = fb ? firebase.firestore() : null;
  const serverTs = () => firebase.firestore.FieldValue.serverTimestamp();
  const today = () => new Date().toISOString().slice(0, 10);
  const API = (path) => (window.RR_API || "") + path;

  // The signed-in user's profile. Cached in this browser so the header shows instantly on page load;
  // Firebase confirms (or clears) it a moment later.
  let profile = store.get("rr_profile", null);
  ["rr_users", "rr_session"].forEach((k) => { store.del(k); sess.del(k); });   // leftovers from the old demo login
  let creatingAccount = false;

  function currentUser() { return profile; }
  function setProfile(p) { profile = p; if (p) store.set("rr_profile", p); else store.del("rr_profile"); onAuthChange(); }
  function onAuthChange() {
    renderUserMenu();
    document.dispatchEvent(new CustomEvent("rr:auth", { detail: currentUser() }));
  }

  // Read users/{uid}; create it the first time (e.g. first Google sign-in).
  async function loadProfile(user) {
    const ref = db.doc("users/" + user.uid);
    let snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ name: user.displayName || "", email: user.email || "", phone: "", city: "", gender: "", dob: "", joined: today(), createdAt: serverTs() });
      snap = await ref.get();
    }
    const d = snap.data() || {};
    return {
      id: user.uid, name: d.name || user.displayName || "", email: user.email || d.email || "",
      phone: d.phone || "", city: d.city || "", gender: d.gender || "", dob: d.dob || "", joined: d.joined || today(),
      providers: (user.providerData || []).map((x) => x.providerId),
      isAdmin: await db.doc("admins/" + user.uid).get().then((a) => a.exists).catch(() => false)
    };
  }

  const SAME = "Those details don't match an account. Check and try again.";
  const AUTH_ERRORS = {
    "auth/invalid-credential": SAME, "auth/invalid-login-credentials": SAME, "auth/wrong-password": SAME, "auth/user-not-found": SAME,
    "auth/email-already-in-use": "An account with that email already exists. Try signing in (or use Google).",
    "auth/account-exists-with-different-credential": "That email already has an account. Sign in with your email and password.",
    "auth/weak-password": "Use a stronger password (at least 8 characters).",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "No connection. Check your internet and try again.",
    "auth/popup-closed-by-user": "", "auth/cancelled-popup-request": "", "auth/user-cancelled": "",
    "auth/operation-not-allowed": "This sign-in method isn't switched on yet.",
    "auth/unauthorized-domain": "Sign-in isn't enabled on this web address yet.",
    "auth/requires-recent-login": "For your security, log out and sign in again, then retry.",
    "permission-denied": "That wasn't allowed. Refresh the page and try again."
  };
  const authMsg = (e) => (e && e.code in AUTH_ERRORS ? AUTH_ERRORS[e.code] : (e && e.message) || "Something went wrong. Try again.");
  const needFirebase = () => { if (!auth) throw { message: "Sign-in is unavailable right now. Refresh the page and try again." }; };
  const keepSignedIn = (keep) => auth.setPersistence(keep ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);

  if (auth) {
    auth.onAuthStateChanged(async (user) => {
      if (!user) { setProfile(null); return; }
      if (creatingAccount) return;           // signup() finishes the profile itself
      try {
        const p = await loadProfile(user); setProfile(p);
        // Self-repair: make sure the profile's phone is linked for phone sign-in (create-only, so it can't take anyone's number).
        const k = "rr_phlink_" + user.uid;
        if (p && p.phone && store.get(k, "") !== p.phone) {
          db.doc("phones/" + p.phone).set({ uid: user.uid }).catch(() => {}).finally(() => store.set(k, p.phone));
        }
      }
      catch (e) { console.error(e); toast("Couldn't load your profile. Check your connection.", "err"); }
    });
    auth.getRedirectResult().catch((e) => { const m = authMsg(e); if (m) toast(m, "err"); });   // Google redirect fallback
  } else {
    profile = null;
  }

  async function login(identifier, password, mode, keep) {
    try {
      needFirebase();
      await keepSignedIn(keep);
      if (mode === "phone") {
        const r = await fetch(API("/api/phone-login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: normPhone(identifier), password }) });
        let data = {}; try { data = await r.json(); } catch (_) {}
        if (!r.ok || !data.token) return { error: data.error || "Phone sign-in isn't available right now. Use the Email tab instead." };
        await auth.signInWithCustomToken(data.token);
      } else {
        await auth.signInWithEmailAndPassword(String(identifier).trim(), password);
      }
      const p = await loadProfile(auth.currentUser); setProfile(p);
      return { user: p };
    } catch (e) { return { error: authMsg(e) }; }
  }

  async function signup({ phone, name, email, password }) {
    let cred;
    try {
      needFirebase();
      await keepSignedIn(true);
      creatingAccount = true;
      cred = await auth.createUserWithEmailAndPassword(email.trim(), password);
    } catch (e) { creatingAccount = false; return { error: authMsg(e) }; }
    const uid = cred.user.uid, ph = normPhone(phone);
    // Claim the phone number. The rules only allow creating phones/{phone} if nobody has it yet.
    try { await db.doc("phones/" + ph).set({ uid }); }
    catch (e) {
      try { await cred.user.delete(); } catch (_) {}
      creatingAccount = false;
      return { error: "That phone number is already linked to an account. Try signing in with it." };
    }
    try {
      await cred.user.updateProfile({ displayName: name.trim() });
      await db.doc("users/" + uid).set({ name: name.trim(), email: email.trim(), phone: ph, city: "", gender: "", dob: "", joined: today(), createdAt: serverTs() });
      cred.user.sendEmailVerification().catch(() => {});   // also protects the account if they later use Google with the same email
      const p = await loadProfile(cred.user);
      creatingAccount = false; setProfile(p);
      return { user: p };
    } catch (e) { creatingAccount = false; return { error: authMsg(e) }; }
  }

  async function googleSignIn() {
    try {
      needFirebase();
      await keepSignedIn(true);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      let res;
      try { res = await auth.signInWithPopup(provider); }
      catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") { await auth.signInWithRedirect(provider); return { redirect: true }; }
        throw e;
      }
      const p = await loadProfile(res.user); setProfile(p);
      return { user: p };
    } catch (e) { return { error: authMsg(e) }; }
  }

  async function resetPassword(email) {
    try { needFirebase(); await auth.sendPasswordResetEmail(email.trim()); return { ok: true }; }
    catch (e) { if (e.code === "auth/user-not-found") return { ok: true }; return { error: authMsg(e) }; }   // don't reveal which emails have accounts
  }

  // Update editable profile fields. Changing the phone moves the phones/{phone} link too.
  async function updateUser(patch) {
    const u = currentUser();
    if (!u || !auth || !auth.currentUser) return { error: "Please sign in again." };
    try {
      const clean = {};
      ["name", "phone", "city", "gender", "dob"].forEach((k) => { if (k in patch) clean[k] = String(patch[k] || "").trim(); });
      if ("phone" in clean) {
        clean.phone = normPhone(clean.phone);
        if (clean.phone !== u.phone) {
          if (clean.phone) {
            try { await db.doc("phones/" + clean.phone).set({ uid: u.id }); }
            catch (e) { return { error: "That phone number is already linked to another account." }; }
          }
          if (u.phone) { try { await db.doc("phones/" + u.phone).delete(); } catch (_) {} }
        }
      }
      await db.doc("users/" + u.id).update(clean);
      if (clean.name && auth.currentUser.displayName !== clean.name) await auth.currentUser.updateProfile({ displayName: clean.name });
      const p = { ...u, ...clean }; setProfile(p);
      return { user: p };
    } catch (e) { return { error: authMsg(e) }; }
  }

  async function changePassword(oldPw, newPw) {
    try {
      const user = auth.currentUser;
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, oldPw);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(newPw);
      return { ok: true };
    } catch (e) { return { error: e.code && /wrong-password|invalid-credential|invalid-login/.test(e.code) ? "Current password is incorrect." : authMsg(e) }; }
  }

  async function logout() {
    try { if (auth) await auth.signOut(); } catch (_) {}
    setProfile(null);
    toast("You've been logged out.");
    if (["profile", "tickets"].includes(document.body.dataset.page)) setTimeout(() => (location.href = "index.html"), 600);
  }

  /* ---------- Contact messages & newsletter → Firestore ---------- */
  async function saveMessage(m) {
    if (!db) return { error: "Couldn't send your message right now. Refresh and try again." };
    try {
      await db.collection("messages").add({ topic: m.topic, name: m.name, email: m.email, phone: m.phone || "", message: m.message, uid: profile ? profile.id : null, status: "new", createdAt: serverTs() });
      return { ok: true };
    } catch (e) { console.error(e); return { error: "Couldn't send your message. Check your connection and try again." }; }
  }
  async function subscribe(email, source = "footer") {
    if (!db) return { error: "Couldn't sign you up right now. Refresh and try again." };
    const id = String(email).trim().toLowerCase();
    try { await db.doc("subscribers/" + id).set({ email: id, source, createdAt: serverTs() }); return { ok: true }; }
    catch (e) { if (e.code === "permission-denied") return { ok: true, already: true }; console.error(e); return { error: "Couldn't sign you up. Check your connection and try again." }; }
  }

  /* =========================================================
     LIVE CATALOGUE — events, merch and site content from Firestore
     Pages run their code through RR.ready(fn), which waits for this.
     Until the admin imports data (content/site exists), the bundled js/data.js is used.
     ========================================================= */
  const CATALOG_KEY = "rr_catalog";
  const plain = (o) => { const x = { ...o }; delete x.createdAt; delete x.updatedAt; return x; };
  async function fetchCatalog() {
    const [ev, pr, site, faq] = await Promise.all([
      db.collection("events").where("published", "==", true).get(),
      db.collection("products").where("published", "==", true).get(),
      db.doc("content/site").get(),
      db.doc("content/faq").get()
    ]);
    if (!site.exists) return null;   // nothing imported yet → keep bundled data
    return {
      events: ev.docs.map((d) => ({ ...plain(d.data()), id: d.id })),
      products: pr.docs.map((d) => ({ ...plain(d.data()), id: d.id })).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(b.name)),
      site: plain(site.data()),
      faq: faq.exists ? (faq.data().groups || []) : null
    };
  }
  function applyCatalog(c) {
    if (!c) return;
    D.events = c.events || [];
    D.products = c.products || [];
    if (c.site) {
      if (c.site.contact) D.contact = { ...D.contact, ...c.site.contact, socials: { ...D.contact.socials, ...(c.site.contact.socials || {}) } };
      if (Array.isArray(c.site.delivery) && c.site.delivery.length) D.delivery = c.site.delivery;
      if (c.site.heroBadge) D.heroBadge = c.site.heroBadge;
    }
    if (c.faq) D.faq = c.faq;
  }
  const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
  const catalogReady = (async () => {
    if (!db || document.body.dataset.page === "admin") return;
    let fresh = null;
    try { fresh = await Promise.race([fetchCatalog(), timeout(6000)]); }
    catch (e) { console.warn("Using saved catalogue:", e.message); applyCatalog(store.get(CATALOG_KEY, null)); return; }
    if (fresh) { store.set(CATALOG_KEY, fresh); applyCatalog(fresh); } else store.del(CATALOG_KEY);
  })().catch((e) => console.error(e)).then(() => { renderFooter(); updateBadge(); });
  function ready(fn) { catalogReady.then(() => { try { fn(); } catch (e) { console.error(e); } }); }

  /* =========================================================
     CART
     ========================================================= */
  const cart = () => store.get("rr_cart", []);
  const saveCart = (c) => { store.set("rr_cart", c); updateBadge(); document.dispatchEvent(new CustomEvent("rr:cart")); };
  function addToCart(item) {
    const c = cart(); const key = `${item.type}:${item.id}:${item.variant}`;
    const ex = c.find((x) => x.key === key);
    if (ex) ex.qty = Math.min(ex.qty + item.qty, 20); else c.push({ ...item, key });
    saveCart(c);
  }
  function setQty(key, qty) { saveCart(cart().map((x) => (x.key === key ? { ...x, qty: Math.max(1, Math.min(20, qty)) } : x))); }
  function removeItem(key) { saveCart(cart().filter((x) => x.key !== key)); }
  function clearCart() { saveCart([]); }
  const cartCount = () => cart().reduce((s, x) => s + x.qty, 0);
  const cartSubtotal = () => cart().reduce((s, x) => s + x.qty * x.price, 0);
  function updateBadge() { $$(".cart-badge").forEach((b) => { const n = cartCount(); b.textContent = n || ""; b.dataset.count = n; }); }
  function cartThumb(item) {
    if (item.type === "ticket") { const e = getEvent(item.id); return e ? poster(e) : ""; }
    const p = getProduct(item.id); return p ? productArt(p) : "";
  }

  /* =========================================================
     ORDERS & TICKETS (mock)
     BACKEND: create order → trigger M-Pesa STK push (Daraja) →
     on callback success, issue tickets + email QR codes.
     ========================================================= */
  function createOrder({ items, contact, delivery, mpesaPhone, deliveryFee }) {
    const user = currentUser();
    const id = "RR-" + rid(6);
    const tickets = [];
    items.filter((i) => i.type === "ticket").forEach((i) => {
      for (let n = 0; n < i.qty; n++) tickets.push({ code: `RR-${rid(4)}-${rid(4)}`, orderId: id, eventId: i.id, tier: i.variant, price: i.price, email: contact.email, name: contact.name, userId: user ? user.id : null, issued: new Date().toISOString() });
    });
    const subtotal = items.reduce((s, x) => s + x.qty * x.price, 0);
    const order = { id, items, contact, delivery: delivery || null, deliveryFee: deliveryFee || 0, subtotal, total: subtotal + (deliveryFee || 0), mpesaPhone: normPhone(mpesaPhone), mpesaRef: "S" + rid(9), userId: user ? user.id : null, created: new Date().toISOString(), status: "paid" };
    store.set("rr_orders", [...store.get("rr_orders", []), order]);
    store.set("rr_tickets", [...store.get("rr_tickets", []), ...tickets]);
    return order;
  }
  const getOrder = (id) => store.get("rr_orders", []).find((o) => o.id === id);
  const orderTickets = (id) => store.get("rr_tickets", []).filter((t) => t.orderId === id);
  function userTickets(u = currentUser()) {
    if (!u) return [];
    return store.get("rr_tickets", []).filter((t) => t.userId === u.id || (t.email || "").toLowerCase() === u.email.toLowerCase());
  }
  const userOrders = (u = currentUser()) => (u ? store.get("rr_orders", []).filter((o) => o.userId === u.id || o.contact.email.toLowerCase() === u.email.toLowerCase()) : []);

  /* ---------- QR ---------- */
  function renderQR(el, text) {
    el.innerHTML = "";
    if (window.QRCode) { new window.QRCode(el, { text, width: 260, height: 260, colorDark: "#07060b", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M }); }
    else el.innerHTML = `<div style="color:#07060b;font:600 12px monospace;text-align:center">${esc(text)}</div>`;
  }

  /* =========================================================
     HEADER
     ========================================================= */
  const NAV = [
    { href: "index.html", label: "Home", page: "home" },
    { href: "events.html", label: "Events", page: "events" },
    { href: "merch.html", label: "Merch", page: "merch" },
    { href: "contact.html", label: "Contact", page: "contact" }
  ];
  const brand = () => `<a class="brand" href="index.html" aria-label="Rada Republic home">
      <span class="brand-mark"><img src="assets/logo-sm.png" alt=""></span>
      <span class="brand-name">Rada<span>Republic</span></span></a>`;
  const searchBox = (id) => `<div class="search" data-search>
      ${icon("search")}<input id="${id}" type="search" placeholder="Search events and merch..." autocomplete="off" aria-label="Search events and merch">
      <div class="search-results" role="listbox"></div></div>`;

  function renderHeader() {
    const host = $("#site-header"); if (!host) return;
    const page = document.body.dataset.page;
    host.outerHTML = `<header class="site-header">
      <div class="container">
        <nav class="nav" aria-label="Main">
          ${brand()}
          ${searchBox("q-desk")}
          <ul class="nav-links">${NAV.filter((n) => n.page !== "home").map((n) => `<li><a href="${n.href}" class="${n.page === page ? "active" : ""}">${n.label}</a></li>`).join("")}</ul>
          <div class="nav-actions">
            <a class="icon-btn" href="cart.html" aria-label="Cart">${icon("cart")}<span class="badge cart-badge"></span></a>
            <div class="user-menu" id="user-menu">
              <button class="icon-btn" id="user-btn" aria-haspopup="true" aria-label="Account">${icon("user")}</button>
              <div class="dropdown"><div class="dropdown-inner" id="user-dd"></div></div>
            </div>
            <button class="icon-btn menu-toggle" id="menu-btn" aria-label="Menu">${icon("menu")}</button>
          </div>
        </nav>
        <div class="mobile-menu" id="mobile-menu">
          ${searchBox("q-mob")}
          ${NAV.map((n) => `<a class="m-link ${n.page === page ? "active" : ""}" href="${n.href}">${n.label}</a>`).join("")}        </div>
      </div>
    </header>`;

    // mobile menu
    // phone menu drops down OVER the page (doesn't push it down); tap outside to close
    const mm = $("#mobile-menu"), mb = $("#menu-btn");
    const setMenu = (open) => { mm.classList.toggle("open", open); mb.innerHTML = icon(open ? "close" : "menu"); mb.setAttribute("aria-expanded", open); };
    mb.addEventListener("click", (ev) => { ev.stopPropagation(); setMenu(!mm.classList.contains("open")); });
    document.addEventListener("click", (ev) => { if (mm.classList.contains("open") && !mm.contains(ev.target)) setMenu(false); });
    window.addEventListener("resize", () => { if (innerWidth > 1024) setMenu(false); });
    // user dropdown: opens on hover (CSS) + click/tap for touch screens
    const um = $("#user-menu");
    $("#user-btn").addEventListener("click", (ev) => { ev.stopPropagation(); um.classList.toggle("open"); });
    document.addEventListener("click", (ev) => { if (!um.contains(ev.target)) um.classList.remove("open"); });
    um.addEventListener("mouseleave", () => um.classList.remove("open"));

    renderUserMenu();
    updateBadge();
    $$("[data-search]").forEach(initSearch);
  }

  function renderUserMenu() {
    const dd = $("#user-dd"); if (!dd) return;
    const u = currentUser();
    const btn = $("#user-btn");
    if (u) {
      btn.classList.add("avatar"); btn.innerHTML = esc(initials(u.name));
      dd.innerHTML = `<div class="dd-head"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div>
        <a class="dd-item" href="profile.html">${icon("user")} My Profile</a>
        <a class="dd-item" href="tickets.html">${icon("ticket")} My Tickets</a>
        ${u.isAdmin ? `<a class="dd-item" href="admin.html">${icon("chart")} Admin panel</a>` : ""}
        <div class="dd-sep"></div>
        <button class="dd-item danger" data-logout>${icon("logout")} Log out</button>`;
    } else {
      btn.classList.remove("avatar"); btn.innerHTML = icon("user");
      dd.innerHTML = `<button class="dd-item" data-auth="login">${icon("login")} Log in</button>
        <button class="dd-item" data-auth="signup">${icon("userPlus")} Sign up</button>`;
    }
    $$("[data-auth]", dd).forEach((b) => b.addEventListener("click", () => { $("#user-menu").classList.remove("open"); openAuth(b.dataset.auth); }));
    const lo = $("[data-logout]", dd); if (lo) lo.addEventListener("click", logout);
  }

  function initSearch(wrap) {
    const input = $("input", wrap), box = $(".search-results", wrap);
    let hl = -1;
    const run = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.classList.remove("open"); return; }
      const ev = D.events.filter((e) => [e.title, e.venue, e.city, e.category].join(" ").toLowerCase().includes(q)).slice(0, 4);
      const pr = D.products.filter((p) => [p.name, p.category].join(" ").toLowerCase().includes(q)).slice(0, 4);
      hl = -1;
      box.innerHTML = (!ev.length && !pr.length) ? `<div class="sr-empty">No results for "${esc(input.value)}"</div>` :
        (ev.length ? `<div class="sr-label">Events</div>` + ev.map((e) => `<a class="sr-item" href="event.html?id=${e.id}"><span class="sr-thumb">${poster(e)}</span><span><b>${esc(e.title)}</b><small>${esc(fmtShort(e.date))} · ${esc(e.venue)}</small></span></a>`).join("") : "") +
        (pr.length ? `<div class="sr-label">Merch</div>` + pr.map((p) => `<a class="sr-item" href="product.html?id=${p.id}"><span class="sr-thumb">${productArt(p)}</span><span><b>${esc(p.name)}</b><small>${fmt(p.price)}</small></span></a>`).join("") : "");
      box.classList.add("open");
    };
    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("keydown", (e) => {
      const items = $$(".sr-item", box);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (!items.length) return;
        hl = (hl + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((x, i) => x.classList.toggle("hl", i === hl));
      } else if (e.key === "Enter") {
        if (hl >= 0 && items[hl]) location.href = items[hl].href;
        else if (input.value.trim()) location.href = "events.html?q=" + encodeURIComponent(input.value.trim());
      } else if (e.key === "Escape") box.classList.remove("open");
    });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) box.classList.remove("open"); });
  }

  /* =========================================================
     FOOTER
     ========================================================= */
  function socialsHTML() {
    const s = D.contact.socials;
    return `<div class="socials">
      <a href="${s.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${icon("facebook")}</a>
      <a href="${s.x}" target="_blank" rel="noopener" aria-label="X">${icon("x")}</a>
      <a href="${s.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${icon("instagram")}</a>
      <a href="${s.tiktok}" target="_blank" rel="noopener" aria-label="TikTok">${icon("tiktok")}</a>
      <a href="${s.youtube}" target="_blank" rel="noopener" aria-label="YouTube">${icon("youtube")}</a>
    </div>`;
  }
  function renderFooter() {
    const host = $("#site-footer"); if (!host) return;
    host.outerHTML = `<footer class="site-footer" id="site-footer">
      <span class="glow pink"></span><span class="glow purple"></span>
      <div class="container">
        <section class="news">
          <span class="pill">Don't miss out</span>
          <h2>Be first through<br><span class="grad-text">the door.</span></h2>
          <p>Early-bird drops, secret lineups and merch restocks, straight to your inbox before anyone else. No spam, unsubscribe with one tap.</p>
          <form class="news-form" id="news-form" novalidate>
            <input class="input" type="email" placeholder="you@example.com" aria-label="Email address" required>
            <button class="btn btn-primary" type="submit">Sign me up</button>
          </form>
          <small>Join the Republic — thousands already don't miss a thing.</small>
        </section>
        <div class="foot-grid">
          <div class="foot-brand">
            ${brand()}
            <p>Tickets, merch and the nights you'll talk about for years. Built in Eldoret, paid with M-Pesa.</p>
            ${socialsHTML()}
          </div>
          <div class="foot-col"><h4>Discover</h4><ul>
            <li><a href="events.html">Events</a></li><li><a href="merch.html">Merch</a></li><li><a href="index.html#partner">Partners</a></li></ul></div>
          <div class="foot-col"><h4>Help</h4><ul>
            <li><a href="contact.html">Contact us</a></li><li><a href="contact.html?topic=support">Support</a></li><li><a href="faq.html#refunds">Refunds</a></li></ul></div>
          <div class="foot-col"><h4>Company</h4><ul>
            <li><a href="faq.html">FAQs</a></li><li><a href="#">Privacy policy</a></li><li><a href="#">Terms of use</a></li></ul></div>
        </div>
        <div class="foot-bottom">
          <a class="credit" href="https://aureliusgithaka.netlify.app/" target="_blank" rel="noopener">Paper &amp; Potion</a>
          <span>© ${new Date().getFullYear()} Rada Republic. All rights reserved.</span>
        </div>
      </div>
    </footer>`;
    $("#news-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const i = $("input", e.target), btn = $("button", e.target);
      if (!validEmail(i.value)) { i.classList.add("err"); toast("Enter a valid email address.", "err"); return; }
      i.classList.remove("err"); btn.disabled = true;
      const r = await subscribe(i.value);
      btn.disabled = false;
      if (r.error) return toast(r.error, "err");
      i.value = "";
      toast(r.already ? "You're already on the list. See you soon!" : "You're in! Watch your inbox.", "ok");
    });
  }

  /* =========================================================
     MODALS
     ========================================================= */
  let overlay;
  function openModal(html, { onClose, dismissable = true } = {}) {
    closeModal(true);
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-logo"><img src="assets/logo-sm.png" alt="Rada Republic"></div>
      ${dismissable ? `<button class="modal-close" aria-label="Close">${icon("close")}</button>` : ""}
      <div class="modal-scroll">${html}</div></div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => overlay.classList.add("open"));
    overlay._onClose = onClose;
    if (dismissable) {
      $(".modal-close", overlay).addEventListener("click", () => closeModal());
      overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeModal(); });
      overlay._esc = (e) => { if (e.key === "Escape") closeModal(); };
      document.addEventListener("keydown", overlay._esc);
    }
    return overlay;
  }
  function closeModal(instant) {
    if (!overlay) return;
    const o = overlay; overlay = null;
    if (o._esc) document.removeEventListener("keydown", o._esc);
    document.body.style.overflow = "";
    if (o._onClose) o._onClose();
    if (instant) o.remove(); else { o.classList.remove("open"); setTimeout(() => o.remove(), 250); }
  }

  const phoneField = (id, label = "Phone number", value = "") => `<div class="field" data-f="${id}">
      <label class="label" for="${id}">${label}</label>
      <div class="phone-group"><span class="prefix"><span class="flag-ke"></span>+254</span>
      <input class="input" id="${id}" type="tel" inputmode="numeric" placeholder="712 345 678" value="${esc(value)}" autocomplete="tel-national"></div>
      <span class="err-msg">Enter a valid Safaricom/Kenyan number, e.g. 0712 345 678</span></div>`;
  const pwField = (id, label, ph, extra = "") => `<div class="field" data-f="${id}">
      <div class="label-row"><label class="label" for="${id}">${label}</label>${extra}</div>
      <div class="pw-wrap"><input class="input" id="${id}" type="password" placeholder="${ph}" autocomplete="${id.includes("new") ? "new-password" : "current-password"}">
      <button type="button" data-eye aria-label="Show password">${icon("eye")}</button></div>
      <span class="err-msg"></span></div>`;
  function wireEyes(root) {
    $$("[data-eye]", root).forEach((b) => b.addEventListener("click", () => {
      const i = b.previousElementSibling; const show = i.type === "password";
      i.type = show ? "text" : "password"; b.innerHTML = icon(show ? "eyeOff" : "eye");
    }));
  }
  function fieldErr(root, id, msg) {
    const f = $(`[data-f="${id}"]`, root); if (!f) return;
    f.classList.toggle("has-err", !!msg);
    if (msg) { const m = $(".err-msg", f); if (m && msg !== true) m.textContent = msg; }
  }

  const GOOGLE_G = '<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  function openAuth(mode = "login", { onSuccess } = {}) {
    let loginMode = "phone", busy = false;
    const o = openModal('<div id="auth-body"></div>');
    const body = $("#auth-body", o);
    const googleBtn = (label) => `<button type="button" class="btn btn-google btn-block btn-lg" id="google-btn">${GOOGLE_G}<span>${label}</span></button>
      <div class="or-div"><span>or</span></div>`;
    const render = () => {
      if (mode === "login") {
        body.innerHTML = `<h2>Welcome back</h2>
          <p class="sub">Sign in with Google, or your phone or email and password.</p>
          <div class="form-err" id="auth-err"></div>
          ${googleBtn("Continue with Google")}
          <div class="seg" style="margin-bottom:18px"><div class="seg-inner">
            <button type="button" data-lm="phone" class="${loginMode === "phone" ? "active" : ""}">Phone</button>
            <button type="button" data-lm="email" class="${loginMode === "email" ? "active" : ""}">Email</button></div></div>
          <form novalidate id="auth-form">
            ${loginMode === "phone" ? phoneField("li-id") : `<div class="field" data-f="li-id"><label class="label" for="li-id">Email address</label><input class="input" id="li-id" type="email" placeholder="you@example.com" autocomplete="email"><span class="err-msg">Enter a valid email address</span></div>`}
            ${pwField("li-pw", "Password", "Password", '<a href="#" id="forgot">Forgot?</a>')}
            <label class="check"><input type="checkbox" id="li-keep" checked> Keep me signed in on this device</label>
            <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit">Sign in ${icon("arrow")}</button>
          </form>
          <p class="switch">New to Rada Republic? <button type="button" data-switch="signup">Create an account</button></p>`;
      } else if (mode === "signup") {
        body.innerHTML = `<h2>Create your account</h2>
          <p class="sub">One tap with Google, or just the basics: phone, name, email &amp; a password.</p>
          <div class="form-err" id="auth-err"></div>
          ${googleBtn("Sign up with Google")}
          <form novalidate id="auth-form">
            ${phoneField("su-phone", "Phone")}
            <div class="field" data-f="su-name"><label class="label" for="su-name">Full name</label><input class="input" id="su-name" placeholder="Full name" autocomplete="name"><span class="err-msg">Enter your full name</span></div>
            <div class="field" data-f="su-email"><label class="label" for="su-email">Email</label><input class="input" id="su-email" type="email" placeholder="Email address" autocomplete="email"><span class="err-msg">Enter a valid email address</span></div>
            ${pwField("su-newpw", "Password", "Password (8+ characters)")}
            <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit">Create account ${icon("arrow")}</button>
          </form>
          <p class="switch">Already on Rada Republic? <button type="button" data-switch="login">Sign in</button></p>`;
      } else {
        body.innerHTML = `<h2>Reset your password</h2>
          <p class="sub">Enter your account email and we'll send you a link to set a new password.</p>
          <div class="form-err" id="auth-err"></div>
          <form novalidate id="auth-form">
            <div class="field" data-f="rs-email"><label class="label" for="rs-email">Email address</label><input class="input" id="rs-email" type="email" placeholder="you@example.com" autocomplete="email"><span class="err-msg">Enter a valid email address</span></div>
            <button class="btn btn-primary btn-block btn-lg" type="submit" id="auth-submit">Send reset link ${icon("arrow")}</button>
          </form>
          <p class="switch">Remembered it? <button type="button" data-switch="login">Back to sign in</button></p>`;
      }
      wireEyes(body);
      $$("[data-lm]", body).forEach((b) => b.addEventListener("click", () => { loginMode = b.dataset.lm; render(); }));
      $$("[data-switch]", body).forEach((b) => b.addEventListener("click", () => { mode = b.dataset.switch; render(); }));
      const fg = $("#forgot", body);
      if (fg) fg.addEventListener("click", (e) => { e.preventDefault(); mode = "reset"; render(); });
      const gb = $("#google-btn", body);
      if (gb) gb.addEventListener("click", async () => {
        if (busy) return;
        setBusy(true, gb);
        const r = await googleSignIn();
        setBusy(false, gb);
        if (r.redirect) return;
        if (r.error) return showErr(r.error);
        if (r.user) done(r.user, true);
      });
      $("#auth-form", body).addEventListener("submit", submit);
      const first = $("form input", body); if (first) setTimeout(() => first.focus(), 60);
    };
    const showErr = (m) => { if (!m) return; const e = $("#auth-err", body); e.textContent = m; e.classList.add("show"); };
    const setBusy = (on, btn) => {
      busy = on;
      $$("button", body).forEach((b) => (b.disabled = on));
      if (btn) {
        if (on) { btn.dataset.html = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span> Please wait…'; }
        else if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
      }
    };
    const done = (user, isGoogle) => {
      closeModal();
      const first = (user.name || "").split(" ")[0] || "there";
      toast(mode === "signup" && !isGoogle ? `Karibu, ${first}! Your account is ready.` : `Welcome, ${first}!`, "ok");
      if (onSuccess) onSuccess(user);
    };
    async function submit(ev) {
      ev.preventDefault();
      if (busy) return;
      $("#auth-err", body).classList.remove("show");
      const btn = $("#auth-submit", body);
      if (mode === "login") {
        const id = $("#li-id", body).value, pw = $("#li-pw", body).value;
        const idOk = loginMode === "phone" ? validPhone(id) : validEmail(id);
        fieldErr(body, "li-id", !idOk); fieldErr(body, "li-pw", pw ? "" : "Enter your password");
        if (!idOk || !pw) return;
        setBusy(true, btn);
        const r = await login(id, pw, loginMode, $("#li-keep", body).checked);
        setBusy(false, btn);
        if (r.error) return showErr(r.error);
        done(r.user);
      } else if (mode === "signup") {
        const v = { phone: $("#su-phone", body).value, name: $("#su-name", body).value, email: $("#su-email", body).value, password: $("#su-newpw", body).value };
        const errs = { "su-phone": !validPhone(v.phone), "su-name": v.name.trim().length < 2, "su-email": !validEmail(v.email), "su-newpw": v.password.length < 8 ? "Use at least 8 characters" : "" };
        Object.entries(errs).forEach(([k, m]) => fieldErr(body, k, m));
        if (Object.values(errs).some(Boolean)) return;
        setBusy(true, btn);
        const r = await signup(v);
        setBusy(false, btn);
        if (r.error) return showErr(r.error);
        done(r.user);
      } else {
        const em = $("#rs-email", body).value;
        fieldErr(body, "rs-email", !validEmail(em));
        if (!validEmail(em)) return;
        setBusy(true, btn);
        const r = await resetPassword(em);
        setBusy(false, btn);
        if (r.error) return showErr(r.error);
        body.innerHTML = `<h2>Check your inbox</h2><p class="sub">If an account exists for <b style="color:var(--text)">${esc(em)}</b>, a reset link is on its way. It can take a minute, so check spam too.</p>
          <button class="btn btn-primary btn-block btn-lg" type="button" id="back-login">Back to sign in</button>`;
        $("#back-login", body).addEventListener("click", () => { mode = "login"; loginMode = "email"; render(); });
      }
    }
    render();
  }

  /* ---------- toast ---------- */
  function toast(msg, type = "", html = "") {
    let wrap = $(".toasts");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toasts"; wrap.setAttribute("aria-live", "polite"); document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.innerHTML = esc(msg) + html;
    wrap.appendChild(t);
    setTimeout(() => { t.style.transition = ".3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ---------- reveal on scroll ---------- */
  function initReveal() {
    const els = $$(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: .12 });
    els.forEach((e) => io.observe(e));
  }

  // keep header/badge in sync across tabs
  window.addEventListener("storage", (e) => { if (e.key === "rr_cart") updateBadge(); if (e.key === "rr_session") renderUserMenu(); });

  /* ---------- public API ---------- */
  window.RR = {
    $, $$, store, fmt, esc, qs, fmtDate, fmtShort, fmtTime, minPrice, rid, icon, poster, productArt, eventCard, productCard,
    getEvent, getProduct, upcomingEvents, featuredEvent, initials,
    currentUser, updateUser, changePassword, logout, openAuth, normPhone, validPhone, validEmail, prettyPhone, saveMessage, subscribe,
    cart, addToCart, setQty, removeItem, clearCart, cartCount, cartSubtotal, cartThumb,
    createOrder, getOrder, orderTickets, userTickets, userOrders, renderQR,
    openModal, closeModal, phoneField, fieldErr, toast, socialsHTML, initReveal, ready, SAMPLE, db: () => db, auth: () => auth, fetchCatalog
  };

  renderHeader();
  renderFooter();
  if (qs("auth") === "login" || qs("auth") === "signup") setTimeout(() => openAuth(qs("auth")), 100);
  document.addEventListener("DOMContentLoaded", initReveal);
})();
