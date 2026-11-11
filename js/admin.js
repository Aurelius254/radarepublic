/* =========================================================
   RADA REPUBLIC — Admin panel
   Only accounts listed in Firestore "admins" can use it (the security rules enforce this too).
   Sections: Dashboard · Events · Merch · Site content · FAQs · Inbox · Subscribers
   ========================================================= */
(function () {
  "use strict";
  const { $, $$, esc, icon, fmt, toast, fmtDate, fmtTime } = RR;
  const db = RR.db(), auth = RR.auth();
  const root = $("#admin-root");
  const TS = () => firebase.firestore.FieldValue.serverTimestamp();
  const API = (p) => (window.RR_API || "") + p;

  const TABS = [
    ["dashboard", "Dashboard", "chart"],
    ["orders", "Orders", "cart"],
    ["scan", "Gate scanner", "qr"],
    ["events", "Events", "ticket"],
    ["merch", "Merch", "bag"],
    ["content", "Site content", "edit"],
    ["faq", "FAQs", "info"],
    ["inbox", "Inbox", "mail"],
    ["subscribers", "Subscribers", "users"]
  ];
  const SHAPES = [["tee", "T-shirt"], ["hoodie", "Hoodie"], ["cap", "Cap"], ["bucket", "Bucket hat"], ["bag", "Tote bag"], ["band", "Wristband"], ["pants", "Joggers"]];
  let tab = TABS.some((t) => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
  const S = { events: [], products: [], messages: [], subscribers: [], orders: [], site: null, faq: null, loaded: false };
  let started = false, authKnown = false;

  /* ---------- helpers ---------- */
  const slug = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40) || "item";
  const rid = (n = 4) => Math.random().toString(36).slice(2, 2 + n);
  const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; return new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 16); };   // shown in Kenya time
  const fromLocalInput = (v) => (v ? v + ":00+03:00" : "");
  const when = (ts) => { const d = ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null; return d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; };
  const isPast = (e) => new Date(e.date) < new Date(new Date().toDateString());
  const minPrice = (e) => { const p = (e.tiers || []).filter((t) => !t.soldOut).map((t) => +t.price || 0); return p.length ? Math.min(...p) : 0; };
  const fld = (id, label, val = "", o = {}) => `<div class="field ${o.span ? "span-2" : ""}" data-f="${id}"><label class="label" for="${id}">${label}${o.req ? '<span class="req">*</span>' : ""}</label>
      <input class="input" id="${id}" type="${o.type || "text"}" value="${esc(val ?? "")}" placeholder="${esc(o.ph || "")}" ${o.attrs || ""}>${o.hint ? `<span class="hint">${o.hint}</span>` : ""}<span class="err-msg">${o.err || "Required"}</span></div>`;
  const area = (id, label, val = "", o = {}) => `<div class="field ${o.span === false ? "" : "span-2"}" data-f="${id}"><label class="label" for="${id}">${label}${o.req ? '<span class="req">*</span>' : ""}</label>
      <textarea class="input" id="${id}" rows="${o.rows || 4}" placeholder="${esc(o.ph || "")}" style="height:auto">${esc(val ?? "")}</textarea>${o.hint ? `<span class="hint">${o.hint}</span>` : ""}<span class="err-msg">Required</span></div>`;
  const chk = (id, label, on, hint = "") => `<label class="check cp-check"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span></label>`;
  const val = (root, id) => ($("#" + id, root) || {}).value ?? "";
  const need = (root, ids) => { let ok = true; ids.forEach((id) => { const bad = !String(val(root, id)).trim(); RR.fieldErr(root, id, bad); if (bad) ok = false; }); return ok; };
  const busy = (btn, on, label = "Saving…") => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.html = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span> ${label}`; } else if (btn.dataset.html) btn.innerHTML = btn.dataset.html; };
  const fail = (e, what = "save") => { console.error(e); toast(e && e.code === "permission-denied" ? "Not allowed. Make sure your account is in the admins list." : `Couldn't ${what}. Check your connection and try again.`, "err"); };

  /* ---------- access gate ---------- */
  function locked(title, msg, signIn) {
    root.innerHTML = `<div class="empty"><div class="em-ic">${icon("lock")}</div><h2>${title}</h2><p>${msg}</p>
      ${signIn ? `<div class="actions"><button class="btn btn-primary" id="cp-login">Log in</button></div>` : `<div class="actions"><a class="btn btn-ghost" href="index.html">Back to the site</a></div>`}</div>`;
    const b = $("#cp-login"); if (b) b.addEventListener("click", () => RR.openAuth("login"));
  }
  function status(msg) { root.innerHTML = `<div class="empty"><div class="em-ic"><span class="spinner" style="width:30px;height:30px"></span></div><h2>${msg}</h2></div>`; }
  function crashed(e) {
    console.error(e);
    root.innerHTML = `<div class="empty"><div class="em-ic">${icon("info")}</div><h2>The admin panel hit a problem</h2>
      <p>Refresh the page. If it keeps happening, send this message to your developer:</p>
      <pre style="white-space:pre-wrap;text-align:left;font-size:12.5px;color:#ff8b96;background:var(--surface);padding:12px;border-radius:12px">${esc((e && (e.code || e.name)) + ": " + (e && e.message))}</pre></div>`;
  }
  // Checks the admins list directly (not the cached profile), so a stale profile can't block or blank the page.
  let checking = null;
  async function gate() {
    if (started) return;
    try {
      if (!auth || !db) return locked("Admin panel unavailable", "Couldn't connect to the database. Refresh the page.", false);
      if (!authKnown) return;
      const user = auth.currentUser;
      if (!user) { checking = null; return locked("Admins only", "Log in with an admin account to manage the site.", true); }
      if (checking === user.uid) return;
      checking = user.uid;
      status("Checking your access…");
      const isAdmin = (await db.doc("admins/" + user.uid).get()).exists;
      if (!auth.currentUser || auth.currentUser.uid !== user.uid) { checking = null; return gate(); }
      if (!isAdmin) return locked("You don't have admin access", `This account isn't on the admins list. Your user ID is <code style="user-select:all">${esc(user.uid)}</code>.`, false);
      started = true; shell(); loadAll();
    } catch (e) { checking = null; crashed(e); }
  }
  if (auth) auth.onAuthStateChanged((user) => { authKnown = true; if (!user) { started = false; checking = null; } setTimeout(gate, 0); });

  /* ---------- data ---------- */
  async function loadAll() {
    try {
      const [ev, pr, site, faq, msg, sub] = await Promise.all([
        db.collection("events").get(),
        db.collection("products").get(),
        db.doc("content/site").get(),
        db.doc("content/faq").get(),
        db.collection("messages").orderBy("createdAt", "desc").limit(300).get(),
        db.collection("subscribers").orderBy("createdAt", "desc").limit(5000).get()
      ]);
      S.events = ev.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => new Date(a.date) - new Date(b.date));
      S.products = pr.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      S.site = site.exists ? site.data() : null;
      S.faq = faq.exists ? faq.data() : null;
      S.messages = msg.docs.map((d) => ({ ...d.data(), id: d.id }));
      S.subscribers = sub.docs.map((d) => ({ ...d.data(), id: d.id }));
      S.orders = await db.collection("orders").orderBy("createdAt", "desc").limit(500).get()
        .then((q) => q.docs.map((d) => ({ ...d.data(), id: d.id })))
        .catch((e) => { console.warn("orders", e); return []; });
      S.loaded = true;
    } catch (e) { S.error = (e.code || "") + " " + (e.message || e); fail(e, "load the admin data"); }
    renderNav(); view();
  }

  /* ---------- layout ---------- */
  function shell() {
    root.innerHTML = `<div class="admin">
      <aside class="cp-side"><div class="cp-brand"><span class="eyebrow">Admin</span><b>Rada Republic</b></div><nav class="cp-nav" id="cp-nav"></nav>
        <a class="cp-viewsite" href="index.html" target="_blank" rel="noopener">${icon("arrow")} View site</a></aside>
      <section class="cp-main" id="cp-main"><div class="empty"><span class="spinner"></span></div></section></div>`;
    renderNav();
    window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.some((t) => t[0] === h) && h !== tab) { tab = h; renderNav(); view(); } });
  }
  function renderNav() {
    const nav = $("#cp-nav"); if (!nav) return;
    const newMsgs = S.messages.filter((m) => m.status === "new").length;
    const counts = { events: S.events.length, merch: S.products.length, inbox: newMsgs, subscribers: S.subscribers.length, orders: S.orders.filter((o) => o.status === "paid" && o.fulfilment === "to-deliver").length };
    nav.innerHTML = TABS.map(([id, label, ic]) => `<a href="#${id}" class="${id === tab ? "active" : ""}">${icon(ic)}<span>${label}</span>${S.loaded && counts[id] ? `<em class="${id === "inbox" || id === "orders" ? "hot" : ""}">${counts[id]}</em>` : ""}</a>`).join("");
  }
  function view() {
    const m = $("#cp-main"); if (!m) return;
    if (!S.loaded) { m.innerHTML = S.error ? `<div class="empty"><h2>Couldn't load the admin data</h2><p class="muted">${esc(S.error)}</p><div class="actions"><button class="btn btn-primary" onclick="location.reload()">Try again</button></div></div>` : `<div class="empty"><span class="spinner"></span></div>`; return; }
    if (tab !== "scan") stopScan();
    try { ({ dashboard: vDashboard, orders: vOrders, scan: vScan, events: vEvents, merch: vMerch, content: vContent, faq: vFaq, inbox: vInbox, subscribers: vSubscribers }[tab] || vDashboard)(m); }
    catch (e) { console.error(e); m.innerHTML = `<div class="empty"><h2>This section hit a problem</h2><pre style="white-space:pre-wrap;text-align:left;font-size:12.5px;color:#ff8b96">${esc(e.message)}</pre></div>`; }
    m.scrollTop = 0;
  }
  const head = (title, sub, actions = "") => `<div class="cp-head"><div><h1 class="h2">${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ""}</div><div class="cp-head-actions">${actions}</div></div>`;
  const importBanner = () => S.site ? "" : `<div class="cp-banner">${icon("info")}<div><b>The site is still showing the built-in sample data.</b>
      <p>Import it into the database to start editing, or start fresh with no sample events or merch. The public site switches to the database as soon as you do.</p>
      <div class="cp-banner-actions"><button class="btn btn-primary btn-sm" data-import="sample">Import sample data</button><button class="btn btn-ghost btn-sm" data-import="fresh">Start fresh</button></div></div></div>`;
  function wireImport(m) {
    $$("[data-import]", m).forEach((b) => b.addEventListener("click", async () => {
      const fresh = b.dataset.import === "fresh";
      if (!confirm(fresh ? "Start fresh? The public site will show no events or merch until you add some." : "Import the sample events, merch, contact details and FAQs into the database?")) return;
      busy(b, true, "Importing…");
      try { await importStarter(fresh); toast("Done. The site now runs from the database.", "ok"); await loadAll(); }
      catch (e) { busy(b, false); fail(e, "import"); }
    }));
  }
  async function importStarter(fresh) {
    const D = RR.SAMPLE, batch = db.batch();
    if (!fresh) {
      D.events.forEach((e, i) => { const { id, ...rest } = e; batch.set(db.doc("events/" + id), { ...rest, featured: !!e.featured, published: true, order: i, updatedAt: TS() }); });
      D.products.forEach((p, i) => { const { id, ...rest } = p; batch.set(db.doc("products/" + id), { ...rest, featured: i < 4, published: true, stock: null, order: i, updatedAt: TS() }); });
    }
    batch.set(db.doc("content/site"), { contact: D.contact, delivery: D.delivery, heroBadge: D.heroBadge || "", updatedAt: TS() });
    batch.set(db.doc("content/faq"), { groups: D.faq || [], updatedAt: TS() });
    await batch.commit();
  }

  /* ---------- image upload (Cloudinary, signed by a Netlify function) ---------- */
  async function uploadImage(file) {
    if (!/^image\//.test(file.type)) throw new Error("Choose an image file.");
    if (file.size > 10 * 1024 * 1024) throw new Error("That image is over 10 MB. Use a smaller one.");
    const token = await auth.currentUser.getIdToken();
    const r = await fetch(API("/api/cloudinary-sign"), { method: "POST", headers: { Authorization: "Bearer " + token } });
    const sig = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(sig.error || "Upload isn't available right now.");
    const fd = new FormData();
    fd.append("file", file); fd.append("api_key", sig.apiKey); fd.append("timestamp", sig.timestamp); fd.append("signature", sig.signature); fd.append("folder", sig.folder);
    const up = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: "POST", body: fd });
    const out = await up.json().catch(() => ({}));
    if (!up.ok || !out.secure_url) throw new Error((out.error && out.error.message) || "Upload failed.");
    return out.secure_url.replace("/upload/", "/upload/f_auto,q_auto,w_1200/");   // auto format & quality, max 1200px wide
  }
  const imgBox = (label, url) => `<div class="field span-2"><span class="label">${label}</span><div class="img-box" data-imgbox>
      <div class="img-prev">${url ? `<img src="${esc(url)}" alt="">` : `<span>No image yet: the site shows a designed placeholder.</span>`}</div>
      <div class="img-side">
        <label class="btn btn-ghost btn-sm img-up">${icon("download")} <span>Upload image</span><input type="file" accept="image/*" hidden></label>
        <input class="input" data-url placeholder="…or paste an image link (https://…)" value="${esc(url || "")}">
        <button type="button" class="link img-clear" data-clear>Remove image</button>
      </div></div></div>`;
  function wireImgBox(box) {
    const prev = $(".img-prev", box), urlIn = $("[data-url]", box), file = $("input[type=file]", box), lbl = $(".img-up span", box);
    const show = (u) => { prev.innerHTML = u ? `<img src="${esc(u)}" alt="">` : `<span>No image yet: the site shows a designed placeholder.</span>`; };
    urlIn.addEventListener("change", () => show(urlIn.value.trim()));
    $("[data-clear]", box).addEventListener("click", () => { urlIn.value = ""; show(""); });
    file.addEventListener("change", async () => {
      const f = file.files[0]; if (!f) return;
      lbl.textContent = "Uploading…"; box.classList.add("uploading");
      try { const u = await uploadImage(f); urlIn.value = u; show(u); toast("Image uploaded.", "ok"); }
      catch (e) { toast(e.message, "err"); }
      finally { lbl.textContent = "Upload image"; box.classList.remove("uploading"); file.value = ""; }
    });
  }
  const imgVal = (root) => { const u = $("[data-imgbox] [data-url]", root); return u ? u.value.trim() : ""; };

  function editor(title, html) {
    const o = RR.openModal(`<div class="cp-editor"><h2>${title}</h2>${html}</div>`);
    $(".modal", o).classList.add("modal-wide");
    $$("[data-imgbox]", o).forEach(wireImgBox);
    return o;
  }

  /* =========================================================
     DASHBOARD
     ========================================================= */
  function vDashboard(m) {
    const pub = S.events.filter((e) => e.published !== false);
    const upcoming = pub.filter((e) => !isPast(e));
    const newMsgs = S.messages.filter((x) => x.status === "new");
    m.innerHTML = head("Dashboard", `Signed in as ${esc(((RR.currentUser() || {}).name) || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.phoneNumber)) || "admin")}`) + importBanner() + `
      <div class="cp-stats">
        <a class="stat" href="#events"><b class="grad-text">${upcoming.length}</b><span>Upcoming events live</span></a>
        <a class="stat" href="#merch"><b class="grad-text">${S.products.filter((p) => p.published !== false).length}</b><span>Merch items live</span></a>
        <a class="stat" href="#inbox"><b class="grad-text">${newMsgs.length}</b><span>New messages</span></a>
        <a class="stat" href="#subscribers"><b class="grad-text">${S.subscribers.length}</b><span>Newsletter subscribers</span></a>
      </div>
      <div class="cp-grid2">
        <div class="panel"><div class="panel-title"><h3>Next up</h3></div>
          ${upcoming.slice(0, 5).map((e) => `<div class="cp-mini"><span class="cp-thumb">${RR.poster(e)}</span><div><b>${esc(e.title)}</b><small>${esc(fmtDate(e.date))} · ${esc(e.venue)} · ${soldCount(e)} sold</small></div>${e.featured ? `<span class="tag pink">Featured</span>` : ""}</div>`).join("") || `<p class="muted">No upcoming events. <a class="link" href="#events">Add one</a>.</p>`}
        </div>
        <div class="panel"><div class="panel-title"><h3>Latest messages</h3></div>
          ${S.messages.slice(0, 5).map((x) => `<a class="cp-mini" href="#inbox"><span class="cp-dot ${x.status === "new" ? "on" : ""}"></span><div><b>${esc(x.name)}</b><small>${esc(topicName(x.topic))} · ${esc(when(x.createdAt))}</small></div></a>`).join("") || `<p class="muted">No messages yet.</p>`}
        </div>
      </div>
      ${salesPanel()}`;
    wireImport(m);
  }

  /* =========================================================
     EVENTS
     ========================================================= */
  let evFilter = "upcoming";
  function vEvents(m) {
    const list = S.events.filter((e) => evFilter === "all" ? true : evFilter === "hidden" ? e.published === false : evFilter === "past" ? isPast(e) : !isPast(e));
    m.innerHTML = head("Events", "Add, edit, hide or feature events. Changes show on the site straight away.", `<button class="btn btn-primary" id="ev-new" ${S.site ? "" : "disabled"}>${icon("ticket")} New event</button>`) + importBanner() + `
      <div class="tabs" id="ev-filter">${[["upcoming", "Upcoming"], ["past", "Past"], ["hidden", "Hidden"], ["all", "All"]].map(([k, l]) => `<button data-f="${k}" class="${evFilter === k ? "active" : ""}">${l}</button>`).join("")}</div>
      <div class="cp-list">${list.map((e) => `
        <div class="cp-row ${e.published === false ? "is-hidden" : ""}">
          <span class="cp-thumb">${RR.poster(e)}</span>
          <div class="cp-row-main"><b>${esc(e.title)}</b>
            <small>${esc(fmtDate(e.date))} · ${esc(fmtTime(e.date))} · ${esc(e.venue)}, ${esc(e.city)}</small>
            <div class="cp-chips">${e.published === false ? `<span class="tag">Hidden</span>` : `<span class="tag ok">Live</span>`}${e.featured ? `<span class="tag pink">★ Featured</span>` : ""}${isPast(e) ? `<span class="tag">Past</span>` : ""}<span class="tag">From ${fmt(minPrice(e))}</span><span class="tag">${(e.tiers || []).length} tier${(e.tiers || []).length === 1 ? "" : "s"}</span></div></div>
          <div class="cp-row-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${e.id}">${icon("edit")} Edit</button>
            <button class="btn btn-ghost btn-sm" data-feature="${e.id}" ${e.featured ? "disabled" : ""}>★ Feature</button>
            <button class="btn btn-ghost btn-sm" data-toggle="${e.id}">${e.published === false ? "Show" : "Hide"}</button>
            <button class="btn btn-ghost btn-sm danger" data-del="${e.id}" aria-label="Delete">${icon("trash")}</button>
          </div>
        </div>`).join("") || `<div class="results-empty">No events here.</div>`}</div>`;
    wireImport(m);
    $("#ev-new", m).addEventListener("click", () => editEvent(null));
    $("#ev-filter", m).addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) { evFilter = b.dataset.f; vEvents(m); } });
    $$("[data-edit]", m).forEach((b) => b.addEventListener("click", () => editEvent(S.events.find((e) => e.id === b.dataset.edit))));
    $$("[data-toggle]", m).forEach((b) => b.addEventListener("click", async () => {
      const e = S.events.find((x) => x.id === b.dataset.toggle); busy(b, true, "");
      try { await db.doc("events/" + e.id).update({ published: e.published === false, updatedAt: TS() }); e.published = e.published === false; toast(e.published ? "Event is live." : "Event hidden from the site.", "ok"); vEvents(m); }
      catch (err) { busy(b, false); fail(err); }
    }));
    $$("[data-feature]", m).forEach((b) => b.addEventListener("click", async () => {
      busy(b, true, "");
      try { await setFeatured(b.dataset.feature); toast("Featured event updated.", "ok"); vEvents(m); } catch (err) { busy(b, false); fail(err); }
    }));
    $$("[data-del]", m).forEach((b) => b.addEventListener("click", async () => {
      const e = S.events.find((x) => x.id === b.dataset.del);
      if (!confirm(`Delete "${e.title}" permanently? This can't be undone. (Tip: use Hide to take it off the site but keep it.)`)) return;
      try { await db.doc("events/" + e.id).delete(); S.events = S.events.filter((x) => x.id !== e.id); toast("Event deleted.", "ok"); renderNav(); vEvents(m); } catch (err) { fail(err, "delete"); }
    }));
  }
  async function setFeatured(id) {
    const batch = db.batch();
    S.events.forEach((e) => { if (e.featured && e.id !== id) batch.update(db.doc("events/" + e.id), { featured: false }); });
    batch.update(db.doc("events/" + id), { featured: true, updatedAt: TS() });
    await batch.commit();
    S.events.forEach((e) => (e.featured = e.id === id));
  }
  const tierRow = (t = {}) => `<div class="tier-row">
      <input class="input" data-k="name" placeholder="Tier name, e.g. Regular" value="${esc(t.name || "")}">
      <input class="input" data-k="price" type="number" min="0" step="50" placeholder="Price (KES)" value="${t.price ?? ""}">
      <input class="input" data-k="qty" type="number" min="0" placeholder="Tickets available" value="${t.qty ?? ""}">
      <input class="input" data-k="note" placeholder="Note (optional), e.g. Fast-track entry" value="${esc(t.note || "")}">
      <label class="check"><input type="checkbox" data-k="soldOut" ${t.soldOut ? "checked" : ""}> Sold out</label>
      <button type="button" class="icon-btn" data-rm aria-label="Remove tier">${icon("trash")}</button></div>`;
  function editEvent(e) {
    const isNew = !e; e = e || { tiers: [{ name: "Regular", price: "" }], a: "#ff2e93", b: "#b44dff", published: true, city: "Eldoret" };
    const cats = [...new Set(S.events.map((x) => x.category).filter(Boolean).concat(["Nightlife", "Music", "Comedy", "Festival", "Sports"]))];
    const o = editor(isNew ? "New event" : "Edit event", `<form class="form-grid" id="ev-form" novalidate>
      ${fld("e-title", "Event name", e.title, { req: true, span: true, ph: "e.g. Rada Nights: Neon Edition" })}
      ${fld("e-cat", "Category", e.category, { req: true, attrs: 'list="e-cats"', ph: "Pick or type one" })}<datalist id="e-cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      ${fld("e-date", "Date & time (Kenya time)", toLocalInput(e.date), { req: true, type: "datetime-local", attrs: 'style="color-scheme:dark"' })}
      ${fld("e-venue", "Venue", e.venue, { req: true, ph: "e.g. Eldoret Sports Club" })}
      ${fld("e-city", "Town", e.city, { req: true, ph: "e.g. Eldoret" })}
      ${area("e-desc", "Description", e.desc, { ph: "What's the night about?" })}
      ${area("e-lineup", "Lineup", (e.lineup || []).join("\n"), { rows: 3, ph: "One name per line", hint: "One per line. Shown as tags on the event page." })}
      <div class="field span-2"><span class="label">Ticket tiers<span class="req">*</span></span><div id="tiers">${(e.tiers || []).map(tierRow).join("")}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="add-tier" style="margin-top:8px;justify-self:start">+ Add tier</button><span class="err-msg" id="tier-err">Add at least one tier with a name and price.</span></div>
      ${imgBox("Poster image", e.image)}
      <div class="field"><span class="label">Placeholder colours</span><div class="cp-colors"><input type="color" id="e-a" value="${esc(e.a || "#ff2e93")}"><input type="color" id="e-b" value="${esc(e.b || "#b44dff")}"><span class="hint">Used only when there's no poster image.</span></div></div>
      <div class="field">${chk("e-pub", "Live on the site", e.published !== false, "Untick to hide it without deleting.")}${chk("e-feat", "Featured event", e.featured, "Shown in the big banner on the homepage and Events page.")}</div>
      <div class="span-2 cp-form-foot"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit" id="ev-save">${isNew ? "Create event" : "Save changes"}</button></div>
    </form>`);
    const f = $("#ev-form", o), tiers = $("#tiers", o);
    $("#add-tier", o).addEventListener("click", () => tiers.insertAdjacentHTML("beforeend", tierRow()));
    tiers.addEventListener("click", (ev) => { const b = ev.target.closest("[data-rm]"); if (b) b.closest(".tier-row").remove(); });
    $("[data-cancel]", o).addEventListener("click", () => RR.closeModal());
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const ok = need(f, ["e-title", "e-cat", "e-date", "e-venue", "e-city"]);
      const tierData = $$(".tier-row", tiers).map((r) => {
        const g = (k) => $(`[data-k="${k}"]`, r);
        const t = { name: g("name").value.trim(), price: Number(g("price").value), soldOut: g("soldOut").checked };
        if (g("qty").value !== "") t.qty = Number(g("qty").value);
        if (g("note").value.trim()) t.note = g("note").value.trim();
        return t;
      }).filter((t) => t.name);
      const tiersOk = tierData.length && tierData.every((t) => t.price >= 0 && !isNaN(t.price) && $$(".tier-row", tiers).length);
      $("#tier-err", o).style.display = tiersOk ? "none" : "block";
      if (!ok || !tiersOk) return;
      const data = {
        title: val(f, "e-title").trim(), category: val(f, "e-cat").trim(), date: fromLocalInput(val(f, "e-date")),
        venue: val(f, "e-venue").trim(), city: val(f, "e-city").trim(), desc: val(f, "e-desc").trim(),
        lineup: val(f, "e-lineup").split("\n").map((x) => x.trim()).filter(Boolean),
        tiers: tierData, image: imgVal(o), a: val(f, "e-a"), b: val(f, "e-b"),
        published: $("#e-pub", o).checked, featured: $("#e-feat", o).checked, updatedAt: TS()
      };
      const id = isNew ? slug(data.title) + "-" + rid() : e.id;
      const btn = $("#ev-save", o); busy(btn, true);
      try {
        if (isNew) { data.order = S.events.length; data.createdAt = TS(); }
        await db.doc("events/" + id).set(data, { merge: true });
        const local = { ...e, ...data, id };
        S.events = S.events.filter((x) => x.id !== id).concat(local).sort((a, b) => new Date(a.date) - new Date(b.date));
        if (data.featured) await setFeatured(id);
        RR.closeModal(); toast(isNew ? "Event created." : "Event saved.", "ok"); renderNav(); view();
      } catch (err) { busy(btn, false); fail(err); }
    });
  }

  /* =========================================================
     MERCH
     ========================================================= */
  function vMerch(m) {
    m.innerHTML = head("Merch", "Products, prices, sizes, stock and photos. Featured items show first on the homepage.", `<button class="btn btn-primary" id="pr-new" ${S.site ? "" : "disabled"}>${icon("bag")} New product</button>`) + importBanner() + `
      <div class="cp-list">${S.products.map((p) => `
        <div class="cp-row ${p.published === false ? "is-hidden" : ""}">
          <span class="cp-thumb sq">${RR.productArt(p)}</span>
          <div class="cp-row-main"><b>${esc(p.name)}</b><small>${esc(p.category)} · ${fmt(p.price)} · ${esc((p.sizes || []).join(", "))}</small>
            <div class="cp-chips">${p.published === false ? `<span class="tag">Hidden</span>` : `<span class="tag ok">Live</span>`}${p.featured ? `<span class="tag pink">★ Featured</span>` : ""}${p.badge ? `<span class="tag">${esc(p.badge)}</span>` : ""}${p.stock != null && p.stock !== "" ? `<span class="tag ${+p.stock === 0 ? "warn" : ""}">${+p.stock === 0 ? "Out of stock" : p.stock + " in stock"}</span>` : ""}</div></div>
          <div class="cp-row-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${p.id}">${icon("edit")} Edit</button>
            <button class="btn btn-ghost btn-sm" data-feat="${p.id}">${p.featured ? "Unfeature" : "★ Feature"}</button>
            <button class="btn btn-ghost btn-sm" data-toggle="${p.id}">${p.published === false ? "Show" : "Hide"}</button>
            <button class="btn btn-ghost btn-sm danger" data-del="${p.id}" aria-label="Delete">${icon("trash")}</button>
          </div></div>`).join("") || `<div class="results-empty">No products yet.</div>`}</div>`;
    wireImport(m);
    $("#pr-new", m).addEventListener("click", () => editProduct(null));
    $$("[data-edit]", m).forEach((b) => b.addEventListener("click", () => editProduct(S.products.find((p) => p.id === b.dataset.edit))));
    const flip = (attr, field, msgOn, msgOff) => $$(`[${attr}]`, m).forEach((b) => b.addEventListener("click", async () => {
      const p = S.products.find((x) => x.id === b.getAttribute(attr)); busy(b, true, "");
      const next = field === "published" ? p.published === false : !p.featured;
      try { await db.doc("products/" + p.id).update({ [field]: next, updatedAt: TS() }); p[field] = next; toast(next ? msgOn : msgOff, "ok"); vMerch(m); }
      catch (err) { busy(b, false); fail(err); }
    }));
    flip("data-toggle", "published", "Product is live.", "Product hidden from the site.");
    flip("data-feat", "featured", "Product featured on the homepage.", "Product no longer featured.");
    $$("[data-del]", m).forEach((b) => b.addEventListener("click", async () => {
      const p = S.products.find((x) => x.id === b.dataset.del);
      if (!confirm(`Delete "${p.name}" permanently? This can't be undone. (Tip: use Hide to keep it.)`)) return;
      try { await db.doc("products/" + p.id).delete(); S.products = S.products.filter((x) => x.id !== p.id); toast("Product deleted.", "ok"); renderNav(); vMerch(m); } catch (err) { fail(err, "delete"); }
    }));
  }
  function editProduct(p) {
    const isNew = !p; p = p || { sizes: ["S", "M", "L", "XL"], shape: "tee", a: "#ff2e93", b: "#7b2cff", published: true };
    const cats = [...new Set(S.products.map((x) => x.category).filter(Boolean).concat(["T-Shirts", "Hoodies", "Caps", "Accessories", "Bottoms"]))];
    const o = editor(isNew ? "New product" : "Edit product", `<form class="form-grid" id="pr-form" novalidate>
      ${fld("p-name", "Product name", p.name, { req: true, span: true, ph: "e.g. Crown Seal Tee" })}
      ${fld("p-cat", "Category", p.category, { req: true, attrs: 'list="p-cats"', ph: "Pick or type one" })}<datalist id="p-cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
      ${fld("p-price", "Price (KES)", p.price, { req: true, type: "number", attrs: 'min="0" step="50"' })}
      ${fld("p-sizes", "Sizes", (p.sizes || []).join(", "), { req: true, ph: "S, M, L, XL  or  One size", hint: "Separate with commas." })}
      ${fld("p-badge", "Label (optional)", p.badge, { attrs: 'list="p-badges"', ph: "e.g. New, Bestseller, Limited" })}<datalist id="p-badges"><option value="New"><option value="Bestseller"><option value="Limited"><option value="Restocked"></datalist>
      ${fld("p-stock", "Stock (optional)", p.stock ?? "", { type: "number", attrs: 'min="0"', hint: "Leave empty if you don't track stock. 0 shows as out of stock here." })}
      ${fld("p-order", "Display order", p.order ?? S.products.length, { type: "number", hint: "Lower numbers show first." })}
      ${area("p-desc", "Description", p.desc, { ph: "Fabric, fit, print…" })}
      ${imgBox("Product photo", p.image)}
      <div class="field"><span class="label">Placeholder (when there's no photo)</span><div class="cp-colors">
        <select class="input" id="p-shape" style="max-width:170px">${SHAPES.map(([k, l]) => `<option value="${k}" ${p.shape === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input type="color" id="p-a" value="${esc(p.a || "#ff2e93")}"><input type="color" id="p-b" value="${esc(p.b || "#7b2cff")}"></div></div>
      <div class="field">${chk("p-pub", "Live on the site", p.published !== false)}${chk("p-feat", "Featured", p.featured, "Featured items show first in the homepage Merch row.")}</div>
      <div class="span-2 cp-form-foot"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit" id="pr-save">${isNew ? "Create product" : "Save changes"}</button></div>
    </form>`);
    const f = $("#pr-form", o);
    $("[data-cancel]", o).addEventListener("click", () => RR.closeModal());
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!need(f, ["p-name", "p-cat", "p-price", "p-sizes"])) return;
      const stock = val(f, "p-stock").trim();
      const data = {
        name: val(f, "p-name").trim(), category: val(f, "p-cat").trim(), price: Number(val(f, "p-price")),
        sizes: val(f, "p-sizes").split(",").map((x) => x.trim()).filter(Boolean), badge: val(f, "p-badge").trim(),
        stock: stock === "" ? null : Number(stock), order: Number(val(f, "p-order")) || 0, desc: val(f, "p-desc").trim(),
        image: imgVal(o), shape: val(f, "p-shape"), a: val(f, "p-a"), b: val(f, "p-b"), colors: p.colors || ["Black"],
        published: $("#p-pub", o).checked, featured: $("#p-feat", o).checked, updatedAt: TS()
      };
      const id = isNew ? slug(data.name) + "-" + rid() : p.id;
      const btn = $("#pr-save", o); busy(btn, true);
      try {
        if (isNew) data.createdAt = TS();
        await db.doc("products/" + id).set(data, { merge: true });
        S.products = S.products.filter((x) => x.id !== id).concat({ ...p, ...data, id }).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        RR.closeModal(); toast(isNew ? "Product created." : "Product saved.", "ok"); renderNav(); view();
      } catch (err) { busy(btn, false); fail(err); }
    });
  }

  /* =========================================================
     SITE CONTENT
     ========================================================= */
  const zoneRow = (z = {}) => `<div class="zone-row"><input class="input" data-k="name" placeholder="Zone, e.g. Eldoret & environs" value="${esc(z.name || "")}"><input class="input" data-k="fee" type="number" min="0" step="10" placeholder="Fee (KES)" value="${z.fee ?? ""}"><button type="button" class="icon-btn" data-rm aria-label="Remove zone">${icon("trash")}</button></div>`;
  function vContent(m) {
    const site = S.site || { contact: RR.SAMPLE.contact, delivery: RR.SAMPLE.delivery, heroBadge: RR.SAMPLE.heroBadge };
    const c = site.contact || {}, so = c.socials || {};
    m.innerHTML = head("Site content", "Contact details, social links, homepage text and delivery fees.") + importBanner() + `
      <form id="ct-form" novalidate>
        <div class="panel"><div class="panel-title"><h3>Contact details</h3><p>Shown on the Contact page.</p></div><div class="form-grid">
          ${fld("c-email", "Email", c.email, { type: "email" })}${fld("c-phone", "Phone", c.phone)}
          ${fld("c-wa", "WhatsApp", c.whatsapp)}${fld("c-loc", "Location", c.location)}
          ${fld("c-hours", "Opening hours", c.hours, { span: true })}</div></div>
        <div class="panel"><div class="panel-title"><h3>Social links</h3><p>Full links, e.g. https://instagram.com/radarepublic. They appear in the footer.</p></div><div class="form-grid">
          ${fld("s-ig", "Instagram", so.instagram)}${fld("s-tt", "TikTok", so.tiktok)}${fld("s-x", "X (Twitter)", so.x)}${fld("s-fb", "Facebook", so.facebook)}${fld("s-yt", "YouTube", so.youtube, { span: true })}</div></div>
        <div class="panel"><div class="panel-title"><h3>Homepage</h3></div><div class="form-grid">
          ${fld("h-badge", "Badge above the heading", site.heroBadge, { span: true, ph: "e.g. Now selling · Eldoret & beyond" })}</div></div>
        <div class="panel"><div class="panel-title"><h3>Merch delivery zones</h3><p>The first zone is selected by default at checkout.</p></div>
          <div id="zones">${(site.delivery || []).map(zoneRow).join("")}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="add-zone" style="margin-top:10px">+ Add zone</button></div>
        <div class="cp-form-foot sticky"><button class="btn btn-primary" type="submit" id="ct-save" ${S.site ? "" : "disabled"}>Save site content</button></div>
      </form>`;
    wireImport(m);
    const zones = $("#zones", m);
    $("#add-zone", m).addEventListener("click", () => zones.insertAdjacentHTML("beforeend", zoneRow()));
    zones.addEventListener("click", (ev) => { const b = ev.target.closest("[data-rm]"); if (b) b.closest(".zone-row").remove(); });
    $("#ct-form", m).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const delivery = $$(".zone-row", zones).map((r, i) => ({ id: slug($('[data-k="name"]', r).value) || "zone-" + i, name: $('[data-k="name"]', r).value.trim(), fee: Number($('[data-k="fee"]', r).value) || 0 })).filter((z) => z.name);
      if (!delivery.length) return toast("Add at least one delivery zone.", "err");
      const data = {
        contact: { email: val(f, "c-email").trim(), phone: val(f, "c-phone").trim(), whatsapp: val(f, "c-wa").trim(), location: val(f, "c-loc").trim(), hours: val(f, "c-hours").trim(),
          socials: { instagram: val(f, "s-ig").trim(), tiktok: val(f, "s-tt").trim(), x: val(f, "s-x").trim(), facebook: val(f, "s-fb").trim(), youtube: val(f, "s-yt").trim() } },
        heroBadge: val(f, "h-badge").trim(), delivery, updatedAt: TS()
      };
      const btn = $("#ct-save", m); busy(btn, true);
      try { await db.doc("content/site").set(data, { merge: true }); S.site = { ...S.site, ...data }; toast("Site content saved.", "ok"); }
      catch (err) { fail(err); }
      busy(btn, false);
    });
  }

  /* =========================================================
     FAQS
     ========================================================= */
  const faqItem = (it = {}) => `<div class="faq-ed-item"><input class="input" data-k="q" placeholder="Question" value="${esc(it.q || "")}"><textarea class="input" data-k="a" rows="2" placeholder="Answer" style="height:auto">${esc(it.a || "")}</textarea><button type="button" class="icon-btn" data-rm-item aria-label="Remove question">${icon("trash")}</button></div>`;
  const faqGroup = (g = {}) => `<div class="panel faq-ed-group"><div class="faq-ed-head"><input class="input" data-k="title" placeholder="Section title, e.g. Tickets" value="${esc(g.title || "")}"><button type="button" class="btn btn-ghost btn-sm danger" data-rm-group>Remove section</button></div>
      <div class="faq-ed-items">${(g.items || []).map(faqItem).join("")}</div><button type="button" class="btn btn-ghost btn-sm" data-add-item>+ Add question</button></div>`;
  function vFaq(m) {
    const groups = (S.faq && S.faq.groups) || RR.SAMPLE.faq || [];
    m.innerHTML = head("FAQs", "Questions and answers on the FAQ page, grouped into sections.") + importBanner() + `
      <div id="faq-groups">${groups.map(faqGroup).join("")}</div>
      <button type="button" class="btn btn-ghost" id="add-group">+ Add section</button>
      <div class="cp-form-foot sticky"><button class="btn btn-primary" id="faq-save" ${S.site ? "" : "disabled"}>Save FAQs</button></div>`;
    wireImport(m);
    const wrap = $("#faq-groups", m);
    $("#add-group", m).addEventListener("click", () => wrap.insertAdjacentHTML("beforeend", faqGroup({ items: [{}] })));
    wrap.addEventListener("click", (ev) => {
      const t = ev.target;
      if (t.closest("[data-add-item]")) $(".faq-ed-items", t.closest(".faq-ed-group")).insertAdjacentHTML("beforeend", faqItem());
      else if (t.closest("[data-rm-item]")) t.closest(".faq-ed-item").remove();
      else if (t.closest("[data-rm-group]") && confirm("Remove this whole section?")) t.closest(".faq-ed-group").remove();
    });
    $("#faq-save", m).addEventListener("click", async (ev) => {
      const groupsOut = $$(".faq-ed-group", wrap).map((g) => {
        const title = $('[data-k="title"]', g).value.trim();
        return { id: slug(title), title, items: $$(".faq-ed-item", g).map((it) => ({ q: $('[data-k="q"]', it).value.trim(), a: $('[data-k="a"]', it).value.trim() })).filter((x) => x.q && x.a) };
      }).filter((g) => g.title);
      const btn = ev.currentTarget; busy(btn, true);
      try { await db.doc("content/faq").set({ groups: groupsOut, updatedAt: TS() }); S.faq = { groups: groupsOut }; toast("FAQs saved.", "ok"); }
      catch (err) { fail(err); }
      busy(btn, false);
    });
  }

  /* =========================================================
     INBOX
     ========================================================= */
  const TOPICS = { general: "General enquiry", support: "Support / technical", host: "Host an event", press: "Press & media", partner: "Partnership" };
  const topicName = (t) => TOPICS[t] || t || "Message";
  let inFilter = "new";
  function vInbox(m) {
    const list = S.messages.filter((x) => inFilter === "all" || (inFilter === "new" ? x.status === "new" : x.status === "done"));
    m.innerHTML = head("Inbox", "Messages from the Contact page.") + `
      <div class="tabs" id="in-filter">${[["new", "New"], ["done", "Done"], ["all", "All"]].map(([k, l]) => `<button data-f="${k}" class="${inFilter === k ? "active" : ""}">${l}</button>`).join("")}</div>
      <div class="cp-list">${list.map((x) => `
        <div class="cp-msg ${x.status === "new" ? "is-new" : ""}">
          <div class="cp-msg-top"><span class="tag ${x.topic === "partner" || x.topic === "host" ? "pink" : ""}">${esc(topicName(x.topic))}</span><small class="muted">${esc(when(x.createdAt))}</small></div>
          <b>${esc(x.name)}</b>
          <div class="cp-msg-meta"><a class="link" href="mailto:${esc(x.email)}">${esc(x.email)}</a>${x.phone ? ` · <a class="link" href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : ""}${x.uid ? ` · <span class="muted">has an account</span>` : ""}</div>
          <p>${esc(x.message)}</p>
          <div class="cp-row-actions">
            <a class="btn btn-ghost btn-sm" href="mailto:${esc(x.email)}?subject=${encodeURIComponent("Re: your message to Rada Republic")}">${icon("mail")} Reply</a>
            <button class="btn btn-ghost btn-sm" data-status="${x.id}">${x.status === "new" ? `${icon("check")} Mark done` : "Mark as new"}</button>
            <button class="btn btn-ghost btn-sm danger" data-del="${x.id}" aria-label="Delete">${icon("trash")}</button>
          </div></div>`).join("") || `<div class="results-empty">${inFilter === "new" ? "All caught up. No new messages." : "No messages here."}</div>`}</div>`;
    $("#in-filter", m).addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) { inFilter = b.dataset.f; vInbox(m); } });
    $$("[data-status]", m).forEach((b) => b.addEventListener("click", async () => {
      const x = S.messages.find((y) => y.id === b.dataset.status), next = x.status === "new" ? "done" : "new";
      busy(b, true, "");
      try { await db.doc("messages/" + x.id).update({ status: next }); x.status = next; renderNav(); vInbox(m); } catch (err) { busy(b, false); fail(err); }
    }));
    $$("[data-del]", m).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this message permanently?")) return;
      try { await db.doc("messages/" + b.dataset.del).delete(); S.messages = S.messages.filter((y) => y.id !== b.dataset.del); renderNav(); vInbox(m); toast("Message deleted.", "ok"); } catch (err) { fail(err, "delete"); }
    }));
  }

  /* =========================================================
     SALES (dashboard) & ORDERS
     ========================================================= */
  const soldCount = (e) => Object.values(e.sold || {}).reduce((s, n) => s + (+n || 0), 0);
  const tsMs = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
  function salesPanel() {
    const paidAll = S.orders.filter((o) => o.status === "paid");
    const live = paidAll.filter((o) => o.env === "production");
    const testOnly = !live.length && paidAll.length;
    const paid = testOnly ? paidAll : live;
    const week = Date.now() - 7 * 864e5;
    const sum = (list) => list.reduce((s, o) => s + (o.total || 0), 0);
    const tix = paid.reduce((s, o) => s + o.items.filter((i) => i.type === "ticket").reduce((a, i) => a + i.qty, 0), 0);
    const toDeliver = paid.filter((o) => o.fulfilment === "to-deliver").length;
    return `<div class="panel" style="margin-top:18px"><div class="panel-title"><h3>Sales</h3>${testOnly ? `<span class="tag warn" style="margin-left:auto">Test payments (sandbox)</span>` : ""}</div>
      ${paid.length ? `<div class="cp-stats" style="margin:0">
        <a class="stat" href="#orders"><b class="grad-text">${fmt(sum(paid))}</b><span>Total sales</span></a>
        <a class="stat" href="#orders"><b class="grad-text">${fmt(sum(paid.filter((o) => tsMs(o.paidAt || o.createdAt) > week)))}</b><span>Last 7 days</span></a>
        <a class="stat" href="#orders"><b class="grad-text">${tix}</b><span>Tickets sold</span></a>
        <a class="stat" href="#orders"><b class="grad-text">${toDeliver}</b><span>Merch to deliver</span></a></div>`
      : `<p class="muted">No paid orders yet. Once M-Pesa is connected, sales show up here and in <a class="link" href="#orders">Orders</a>.</p>`}</div>`;
  }

  let ordF = "paid", ordQ = "";
  const ORD_FILTERS = [
    ["paid", "Paid", (o) => o.status === "paid"],
    ["deliver", "To deliver", (o) => o.status === "paid" && o.fulfilment === "to-deliver"],
    ["pending", "Waiting", (o) => o.status === "pending"],
    ["failed", "Not paid", (o) => o.status === "failed" || o.status === "cancelled"],
    ["all", "All", () => true]
  ];
  const statusTag = (o) => o.status === "paid" ? `<span class="tag ok">Paid</span>` : o.status === "pending" ? `<span class="tag">Waiting</span>` : `<span class="tag warn">${o.status === "cancelled" ? "Cancelled" : "Failed"}</span>`;
  const itemsText = (o) => o.items.map((i) => `${i.qty}× ${i.type === "ticket" ? i.variant + " · " + i.name : i.name + " (" + i.variant + ")"}`).join(", ");
  function vOrders(m) {
    const f = (ORD_FILTERS.find((x) => x[0] === ordF) || ORD_FILTERS[0])[2];
    const q = ordQ.toLowerCase();
    const list = S.orders.filter(f).filter((o) => !q || [o.id, o.contact && o.contact.name, o.email, o.mpesaPhone, o.mpesaReceipt].some((v) => String(v || "").toLowerCase().includes(q)));
    m.innerHTML = head("Orders", "Every checkout, newest first. Tickets are issued and emailed automatically once M-Pesa confirms the payment.",
      `<button class="btn btn-ghost" id="ord-refresh">Refresh</button>`) + `
      <div class="tabs" style="margin-bottom:12px">${ORD_FILTERS.map(([id, label, fn]) => `<button class="${ordF === id ? "active" : ""}" data-of="${id}">${label} (${S.orders.filter(fn).length})</button>`).join("")}</div>
      <input class="input" id="ord-q" placeholder="Search order no., name, email, phone or M-Pesa ref…" value="${esc(ordQ)}" style="max-width:440px;margin-bottom:16px">
      <div class="cp-list">${list.map((o) => `<div class="cp-row">
          <div class="cp-row-main"><b>${esc(o.contact ? o.contact.name : "")} · ${fmt(o.total)}</b>
            <small>${esc(o.id)} · ${esc(when(o.createdAt))} · ${esc(o.email)}</small>
            <small>${esc(itemsText(o))}</small>
            <div class="cp-chips">${statusTag(o)}${o.env === "sandbox" ? `<span class="tag">Test</span>` : ""}${o.fulfilment === "to-deliver" ? `<span class="tag pink">To deliver</span>` : o.fulfilment === "delivered" ? `<span class="tag ok">Delivered</span>` : ""}${o.status === "paid" && !o.emailedAt ? `<span class="tag warn">Email not sent</span>` : ""}</div></div>
          <div class="cp-row-actions">
            <button class="btn btn-ghost btn-sm" data-od="${esc(o.id)}">Details</button>
            ${o.fulfilment === "to-deliver" ? `<button class="btn btn-ghost btn-sm" data-deliv="${esc(o.id)}">${icon("truck")} Delivered</button>` : ""}
          </div></div>`).join("") || `<div class="empty" style="padding:40px 20px"><p class="muted">No orders here${ordQ ? " match that search" : " yet"}.</p></div>`}</div>`;
    $$("[data-of]", m).forEach((b) => b.addEventListener("click", () => { ordF = b.dataset.of; vOrders(m); }));
    const qi = $("#ord-q", m);
    qi.addEventListener("input", () => { ordQ = qi.value.trim(); const pos = qi.selectionStart; vOrders(m); const n = $("#ord-q", m); n.focus(); n.setSelectionRange(pos, pos); });
    $("#ord-refresh", m).addEventListener("click", async (ev) => { busy(ev.currentTarget, true, "Refreshing…"); await loadAll(); });
    $$("[data-od]", m).forEach((b) => b.addEventListener("click", () => orderDetails(S.orders.find((o) => o.id === b.dataset.od))));
    $$("[data-deliv]", m).forEach((b) => b.addEventListener("click", () => markDelivered(b.dataset.deliv, b)));
  }
  async function markDelivered(id, btn) {
    busy(btn, true, "Saving…");
    try {
      await db.doc("orders/" + id).update({ fulfilment: "delivered", deliveredAt: TS() });
      const o = S.orders.find((x) => x.id === id); if (o) o.fulfilment = "delivered";
      toast("Marked as delivered.", "ok"); renderNav(); view();
    } catch (e) { busy(btn, false); fail(e); }
  }
  async function orderDetails(o) {
    if (!o) return;
    const link = `${location.origin}${location.pathname.replace(/admin\.html$/, "")}order.html?id=${encodeURIComponent(o.id)}&k=${encodeURIComponent(o.key || "")}`;
    const ov = editor(`Order ${esc(o.id)}`, `
      <div class="cp-chips" style="margin:-8px 0 16px">${statusTag(o)}${o.env === "sandbox" ? `<span class="tag">Test payment</span>` : ""}</div>
      <div class="sum-items">${o.items.map((i) => `<div class="sum-item"><span>${i.qty} × ${esc(i.type === "ticket" ? i.name + " · " + i.variant : i.name + " (" + i.variant + ")")}</span><span>${fmt(i.qty * i.price)}</span></div>`).join("")}</div>
      ${o.deliveryFee ? `<div class="sum-row"><span>Delivery</span><span>${fmt(o.deliveryFee)}</span></div>` : ""}
      <div class="sum-row total"><span>Total</span><span>${fmt(o.total)}</span></div>
      <div class="cp-grid2" style="margin-top:18px">
        <div><span class="label">Buyer</span><p>${esc(o.contact.name)}<br>${esc(o.email)}<br>${o.contact.phone ? "0" + esc(o.contact.phone) : ""}</p></div>
        <div><span class="label">M-Pesa</span><p>Paid from 0${esc(o.mpesaPhone)}<br>${o.mpesaReceipt ? "Ref " + esc(o.mpesaReceipt) : o.status === "paid" ? "Ref pending" : esc(o.resultDesc || "")}<br><span class="muted">${esc(when(o.paidAt || o.createdAt))}</span></p></div>
        ${o.delivery ? `<div><span class="label">Deliver to</span><p>${esc([o.delivery.street, o.delivery.area, o.delivery.town].join(", "))}<br>${esc(o.delivery.zone)} · call 0${esc(o.delivery.phone)}${o.delivery.notes ? "<br>" + esc(o.delivery.notes) : ""}</p></div>` : ""}
        ${o.emailError ? `<div><span class="label">Email problem</span><p style="color:#ff8b96;font-size:13px">${esc(o.emailError)}</p></div>` : ""}
      </div>
      <div id="od-tix"></div>
      <div class="cp-form-foot" style="flex-wrap:wrap;justify-content:flex-start">
        ${o.status === "paid" ? `<button class="btn btn-ghost btn-sm" id="od-mail">${icon("mail")} Resend ticket email</button>` : ""}
        ${o.key ? `<button class="btn btn-ghost btn-sm" id="od-link">Copy order link</button>` : ""}
      </div>`);
    const tl = $("#od-tix", ov);
    if (o.status === "paid" && (o.ticketCodes || []).length) {
      tl.innerHTML = `<p class="muted" style="font-size:13px">Loading tickets…</p>`;
      try {
        const snaps = await Promise.all(o.ticketCodes.map((c) => db.doc("tickets/" + c).get()));
        tl.innerHTML = `<span class="label" style="margin-top:14px;display:block">Tickets</span>` + snaps.filter((s) => s.exists).map((s) => { const t = s.data();
          return `<div class="cp-mini"><div><b style="font-family:monospace">${esc(t.code)}</b><small>${esc(t.tier)} · ${esc(t.eventTitle)}</small></div>${t.status === "used" ? `<span class="tag warn">Used ${esc(when(t.checkedInAt))}</span>` : `<span class="tag ok">Valid</span>`}</div>`; }).join("");
      } catch (e) { tl.innerHTML = ""; }
    }
    const lk = $("#od-link", ov); if (lk) lk.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); toast("Link copied. Anyone with it can see this order.", "ok"); } catch { prompt("Order link:", link); } });
    const ml = $("#od-mail", ov); if (ml) ml.addEventListener("click", async () => {
      busy(ml, true, "Sending…");
      try {
        const r = await fetch(API("/api/resend-email"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await auth.currentUser.getIdToken()) }, body: JSON.stringify({ id: o.id }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Couldn't send.");
        o.emailedAt = new Date(); delete o.emailError;
        toast(`Ticket email sent to ${o.email}.`, "ok");
      } catch (e) { toast(e.message, "err"); }
      busy(ml, false);
    });
  }

  /* =========================================================
     GATE SCANNER
     Reads the QR with the camera (BarcodeDetector where the browser has it, jsQR otherwise)
     and checks the ticket in with a transaction, so a code can only ever get in once.
     ========================================================= */
  const scan = { stream: null, timer: null, detector: null, canvas: null, last: "", lastAt: 0, busy: false, eventId: "" };
  const TICKET_RE = /^RR-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
  function stopScan() {
    clearTimeout(scan.timer); scan.timer = null;
    if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
    scan.stream = null;
  }
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((res, rej) => {
      const el = document.createElement("script");
      el.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
      el.onload = res; el.onerror = () => rej(new Error("Couldn't load the scanner. Check your connection."));
      document.head.appendChild(el);
    });
  }
  function vScan(m) {
    const evs = S.events.filter((e) => Date.now() - new Date(e.date) < 2 * 864e5).concat(S.events.filter((e) => Date.now() - new Date(e.date) >= 2 * 864e5).reverse());
    m.innerHTML = head("Gate scanner", "Scan tickets at the entrance. Each ticket gets in once; a second scan shows when it was used.") + `
      <div class="scan-wrap">
        <div class="panel">
          <label class="label" for="sc-ev">Event at this gate</label>
          <select class="input" id="sc-ev"><option value="">Any event</option>${evs.map((e) => `<option value="${esc(e.id)}" ${e.id === scan.eventId ? "selected" : ""}>${esc(e.title)} · ${esc(fmtDate(e.date))}</option>`).join("")}</select>
          <div id="sc-count" class="muted" style="font-size:13px;margin-top:8px"></div>
          <div class="scan-cam"><video id="sc-video" playsinline muted></video><div class="scan-frame"></div>
            <button class="btn btn-primary" id="sc-start">${icon("qr")} Start camera</button></div>
          <form id="sc-man" class="scan-man"><input class="input" id="sc-code" placeholder="Or type the code: RR-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn btn-ghost" type="submit">Check</button></form>
        </div>
        <div id="sc-result" class="scan-result idle"><div class="sr-ic">${icon("qr")}</div><h3>Ready</h3><p>Start the camera and point it at a ticket QR code.</p></div>
      </div>`;
    const sel = $("#sc-ev", m);
    sel.addEventListener("change", () => { scan.eventId = sel.value; countIn(); });
    countIn();
    $("#sc-start", m).addEventListener("click", startCam);
    $("#sc-man", m).addEventListener("submit", (ev) => { ev.preventDefault(); const c = $("#sc-code", m); checkIn(c.value); c.value = ""; });
    if (scan.stream) startCam();
  }
  async function countIn() {
    const el = $("#sc-count"); if (!el) return;
    if (!scan.eventId) { el.textContent = ""; return; }
    el.textContent = "Counting…";
    try {
      const q = await db.collection("tickets").where("eventId", "==", scan.eventId).get();
      const used = q.docs.filter((d) => d.data().status === "used").length;
      if ($("#sc-count")) $("#sc-count").textContent = `${used} of ${q.size} ticket${q.size === 1 ? "" : "s"} checked in`;
    } catch (e) { el.textContent = ""; }
  }
  async function startCam() {
    const btn = $("#sc-start"), video = $("#sc-video");
    if (!video) return;
    try {
      if (!scan.stream) {
        if (btn) busy(btn, true, "Starting…");
        scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      }
      if ("BarcodeDetector" in window && !scan.detector) {
        try { const f = await window.BarcodeDetector.getSupportedFormats(); if (f.includes("qr_code")) scan.detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (_) {}
      }
      if (!scan.detector) await loadJsQR();
      video.srcObject = scan.stream; await video.play();
      if (btn) btn.style.display = "none";
      video.parentElement.classList.add("on");
      loop();
    } catch (e) {
      stopScan();
      if (btn) busy(btn, false);
      showResult("bad", "Camera not available", e && e.name === "NotAllowedError" ? "Allow camera access for this site in your browser settings, then try again." : (e.message || "Use the code box instead."));
    }
  }
  async function loop() {
    const video = $("#sc-video");
    if (!scan.stream || !video) return;
    if (!scan.busy && video.readyState >= 2) {
      let code = "";
      try {
        if (scan.detector) { const r = await scan.detector.detect(video); code = r[0] ? r[0].rawValue : ""; }
        else if (window.jsQR) {
          const w = video.videoWidth, h = video.videoHeight, k = Math.min(1, 640 / Math.max(w, h));
          const c = scan.canvas || (scan.canvas = document.createElement("canvas"));
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(video, 0, 0, c.width, c.height);
          const r = window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
          code = r ? r.data : "";
        }
      } catch (_) {}
      code = (code || "").trim().toUpperCase();
      if (code && !(code === scan.last && Date.now() - scan.lastAt < 4000)) { scan.last = code; scan.lastAt = Date.now(); await checkIn(code); }
    }
    scan.timer = setTimeout(loop, 180);
  }
  function showResult(kind, title, text, extra = "") {
    const el = $("#sc-result"); if (!el) return;
    const ic = { ok: "check", used: "close", bad: "close", wrong: "info", busy: "qr" }[kind] || "qr";
    el.className = "scan-result " + kind;
    el.innerHTML = `<div class="sr-ic">${kind === "busy" ? '<span class="spinner" style="width:28px;height:28px"></span>' : icon(ic)}</div><h3>${title}</h3><p>${text}</p>${extra}`;
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 80 : [60, 60, 60]);
  }
  async function checkIn(raw) {
    const code = String(raw || "").trim().toUpperCase();
    if (!code) return;
    if (!TICKET_RE.test(code)) return showResult("bad", "Not a Rada Republic ticket", `The code “${esc(code.slice(0, 40))}” isn't one of ours.`);
    scan.busy = true;
    showResult("busy", "Checking…", esc(code));
    const ref = db.doc("tickets/" + code);
    try {
      const r = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { kind: "bad" };
        const t = snap.data();
        if (scan.eventId && t.eventId !== scan.eventId) return { kind: "wrong", t };
        if (t.status === "used") return { kind: "used", t };
        tx.update(ref, { status: "used", checkedInAt: TS(), checkedInBy: auth.currentUser.uid });
        return { kind: "ok", t };
      });
      const t = r.t;
      if (r.kind === "bad") showResult("bad", "Ticket not found", `${esc(code)} isn't a ticket we issued. Don't let them in.`);
      else if (r.kind === "used") showResult("used", "Already used", `${esc(t.tier)} · ${esc(t.name)}<br>Checked in ${esc(when(t.checkedInAt))}.`);
      else if (r.kind === "wrong") showResult("wrong", "Different event", `This ticket is for <b>${esc(t.eventTitle)}</b> (${esc(fmtDate(t.eventDate))}), not the event selected at this gate.`);
      else {
        showResult("ok", "Admit 1", `<b>${esc(t.tier)}</b> · ${esc(t.name)}<br>${esc(t.eventTitle)}`, `<button class="btn btn-ghost btn-sm" id="sc-undo">Undo check-in</button>`);
        const u = $("#sc-undo"); if (u) u.addEventListener("click", async () => {
          try { await ref.update({ status: "valid", checkedInAt: null, checkedInBy: null }); showResult("idle", "Check-in undone", `${esc(code)} can be scanned again.`); countIn(); }
          catch (e) { fail(e, "undo"); }
        });
        countIn();
      }
    } catch (e) {
      console.error(e);
      showResult("bad", "Couldn't check that ticket", e.code === "permission-denied" ? "The database rules need updating (see the setup notes)." : "Check your connection and scan again.");
    }
    scan.busy = false;
  }

  /* =========================================================
     SUBSCRIBERS
     ========================================================= */
  let subQ = "";
  function vSubscribers(m) {
    const list = S.subscribers.filter((s) => !subQ || s.email.includes(subQ.toLowerCase()));
    m.innerHTML = head("Subscribers", `${S.subscribers.length} people on the newsletter list. Sending newsletters from here comes once the email service is connected.`, `<button class="btn btn-ghost" id="sub-csv" ${S.subscribers.length ? "" : "disabled"}>${icon("download")} Export CSV</button>`) + `
      <input class="input" id="sub-q" placeholder="Search emails…" value="${esc(subQ)}" style="max-width:360px;margin-bottom:16px">
      <div class="panel" style="padding:8px 0"><table class="cp-table"><thead><tr><th>Email</th><th>Joined</th><th>From</th><th></th></tr></thead><tbody>
        ${list.map((s) => `<tr><td>${esc(s.email)}</td><td>${esc(when(s.createdAt))}</td><td>${esc(s.source || "")}</td><td><button class="icon-btn" data-del="${esc(s.id)}" aria-label="Remove">${icon("trash")}</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted" style="padding:24px;text-align:center">No subscribers${subQ ? " match that search" : " yet"}.</td></tr>`}
      </tbody></table></div>`;
    const q = $("#sub-q", m);
    q.addEventListener("input", () => { subQ = q.value.trim(); const pos = q.selectionStart; vSubscribers(m); const n = $("#sub-q", m); n.focus(); n.setSelectionRange(pos, pos); });
    $("#sub-csv", m).addEventListener("click", () => {
      const rows = [["email", "joined", "source"], ...S.subscribers.map((s) => [s.email, when(s.createdAt), s.source || ""])];
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `rada-republic-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $$("[data-del]", m).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`Remove ${b.dataset.del} from the newsletter list?`)) return;
      try { await db.doc("subscribers/" + b.dataset.del).delete(); S.subscribers = S.subscribers.filter((s) => s.id !== b.dataset.del); renderNav(); vSubscribers(m); toast("Removed.", "ok"); } catch (err) { fail(err, "remove"); }
    }));
  }

  gate();
})();
