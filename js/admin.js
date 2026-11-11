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
    ["events", "Events", "ticket"],
    ["merch", "Merch", "bag"],
    ["content", "Site content", "edit"],
    ["faq", "FAQs", "info"],
    ["inbox", "Inbox", "mail"],
    ["subscribers", "Subscribers", "users"]
  ];
  const SHAPES = [["tee", "T-shirt"], ["hoodie", "Hoodie"], ["cap", "Cap"], ["bucket", "Bucket hat"], ["bag", "Tote bag"], ["band", "Wristband"], ["pants", "Joggers"]];
  let tab = TABS.some((t) => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : "dashboard";
  const S = { events: [], products: [], messages: [], subscribers: [], site: null, faq: null, loaded: false };
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
  const chk = (id, label, on, hint = "") => `<label class="check ad-check"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span><b>${label}</b>${hint ? `<small>${hint}</small>` : ""}</span></label>`;
  const val = (root, id) => ($("#" + id, root) || {}).value ?? "";
  const need = (root, ids) => { let ok = true; ids.forEach((id) => { const bad = !String(val(root, id)).trim(); RR.fieldErr(root, id, bad); if (bad) ok = false; }); return ok; };
  const busy = (btn, on, label = "Saving…") => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.html = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span> ${label}`; } else if (btn.dataset.html) btn.innerHTML = btn.dataset.html; };
  const fail = (e, what = "save") => { console.error(e); toast(e && e.code === "permission-denied" ? "Not allowed. Make sure your account is in the admins list." : `Couldn't ${what}. Check your connection and try again.`, "err"); };

  /* ---------- access gate ---------- */
  function locked(title, msg, signIn) {
    root.innerHTML = `<div class="empty"><div class="em-ic">${icon("lock")}</div><h2>${title}</h2><p>${msg}</p>
      ${signIn ? `<div class="actions"><button class="btn btn-primary" id="ad-login">Log in</button></div>` : `<div class="actions"><a class="btn btn-ghost" href="index.html">Back to the site</a></div>`}</div>`;
    const b = $("#ad-login"); if (b) b.addEventListener("click", () => RR.openAuth("login"));
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
      S.loaded = true;
    } catch (e) { S.error = (e.code || "") + " " + (e.message || e); fail(e, "load the admin data"); }
    renderNav(); view();
  }

  /* ---------- layout ---------- */
  function shell() {
    root.innerHTML = `<div class="admin">
      <aside class="ad-side"><div class="ad-brand"><span class="eyebrow">Admin</span><b>Rada Republic</b></div><nav class="ad-nav" id="ad-nav"></nav>
        <a class="ad-viewsite" href="index.html" target="_blank" rel="noopener">${icon("arrow")} View site</a></aside>
      <section class="ad-main" id="ad-main"><div class="empty"><span class="spinner"></span></div></section></div>`;
    renderNav();
    window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.some((t) => t[0] === h) && h !== tab) { tab = h; renderNav(); view(); } });
  }
  function renderNav() {
    const nav = $("#ad-nav"); if (!nav) return;
    const newMsgs = S.messages.filter((m) => m.status === "new").length;
    const counts = { events: S.events.length, merch: S.products.length, inbox: newMsgs, subscribers: S.subscribers.length };
    nav.innerHTML = TABS.map(([id, label, ic]) => `<a href="#${id}" class="${id === tab ? "active" : ""}">${icon(ic)}<span>${label}</span>${S.loaded && counts[id] ? `<em class="${id === "inbox" ? "hot" : ""}">${counts[id]}</em>` : ""}</a>`).join("");
  }
  function view() {
    const m = $("#ad-main"); if (!m) return;
    if (!S.loaded) { m.innerHTML = S.error ? `<div class="empty"><h2>Couldn't load the admin data</h2><p class="muted">${esc(S.error)}</p><div class="actions"><button class="btn btn-primary" onclick="location.reload()">Try again</button></div></div>` : `<div class="empty"><span class="spinner"></span></div>`; return; }
    try { ({ dashboard: vDashboard, events: vEvents, merch: vMerch, content: vContent, faq: vFaq, inbox: vInbox, subscribers: vSubscribers }[tab] || vDashboard)(m); }
    catch (e) { console.error(e); m.innerHTML = `<div class="empty"><h2>This section hit a problem</h2><pre style="white-space:pre-wrap;text-align:left;font-size:12.5px;color:#ff8b96">${esc(e.message)}</pre></div>`; }
    m.scrollTop = 0;
  }
  const head = (title, sub, actions = "") => `<div class="ad-head"><div><h1 class="h2">${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ""}</div><div class="ad-head-actions">${actions}</div></div>`;
  const importBanner = () => S.site ? "" : `<div class="ad-banner">${icon("info")}<div><b>The site is still showing the built-in sample data.</b>
      <p>Import it into the database to start editing, or start fresh with no sample events or merch. The public site switches to the database as soon as you do.</p>
      <div class="ad-banner-actions"><button class="btn btn-primary btn-sm" data-import="sample">Import sample data</button><button class="btn btn-ghost btn-sm" data-import="fresh">Start fresh</button></div></div></div>`;
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
    const o = RR.openModal(`<div class="ad-editor"><h2>${title}</h2>${html}</div>`);
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
    const featured = S.events.find((e) => e.featured);
    m.innerHTML = head("Dashboard", `Signed in as ${esc(((RR.currentUser() || {}).name) || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.phoneNumber)) || "admin")}`) + importBanner() + `
      <div class="ad-stats">
        <a class="stat" href="#events"><b class="grad-text">${upcoming.length}</b><span>Upcoming events live</span></a>
        <a class="stat" href="#merch"><b class="grad-text">${S.products.filter((p) => p.published !== false).length}</b><span>Merch items live</span></a>
        <a class="stat" href="#inbox"><b class="grad-text">${newMsgs.length}</b><span>New messages</span></a>
        <a class="stat" href="#subscribers"><b class="grad-text">${S.subscribers.length}</b><span>Newsletter subscribers</span></a>
      </div>
      <div class="ad-grid2">
        <div class="panel"><div class="panel-title"><h3>Next up</h3></div>
          ${upcoming.slice(0, 5).map((e) => `<div class="ad-mini"><span class="ad-thumb">${RR.poster(e)}</span><div><b>${esc(e.title)}</b><small>${esc(fmtDate(e.date))} · ${esc(e.venue)}</small></div>${e.featured ? `<span class="tag pink">Featured</span>` : ""}</div>`).join("") || `<p class="muted">No upcoming events. <a class="link" href="#events">Add one</a>.</p>`}
        </div>
        <div class="panel"><div class="panel-title"><h3>Latest messages</h3></div>
          ${S.messages.slice(0, 5).map((x) => `<a class="ad-mini" href="#inbox"><span class="ad-dot ${x.status === "new" ? "on" : ""}"></span><div><b>${esc(x.name)}</b><small>${esc(topicName(x.topic))} · ${esc(when(x.createdAt))}</small></div></a>`).join("") || `<p class="muted">No messages yet.</p>`}
        </div>
      </div>
      <div class="panel" style="margin-top:18px"><div class="panel-title"><h3>Coming next</h3></div>
        <p class="muted">Orders, sales totals and the gate ticket scanner appear here once M-Pesa payments are connected. ${featured ? `Featured event right now: <b style="color:var(--text)">${esc(featured.title)}</b>.` : ""}</p></div>`;
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
      <div class="ad-list">${list.map((e) => `
        <div class="ad-row ${e.published === false ? "is-hidden" : ""}">
          <span class="ad-thumb">${RR.poster(e)}</span>
          <div class="ad-row-main"><b>${esc(e.title)}</b>
            <small>${esc(fmtDate(e.date))} · ${esc(fmtTime(e.date))} · ${esc(e.venue)}, ${esc(e.city)}</small>
            <div class="ad-chips">${e.published === false ? `<span class="tag">Hidden</span>` : `<span class="tag ok">Live</span>`}${e.featured ? `<span class="tag pink">★ Featured</span>` : ""}${isPast(e) ? `<span class="tag">Past</span>` : ""}<span class="tag">From ${fmt(minPrice(e))}</span><span class="tag">${(e.tiers || []).length} tier${(e.tiers || []).length === 1 ? "" : "s"}</span></div></div>
          <div class="ad-row-actions">
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
      <div class="field"><span class="label">Placeholder colours</span><div class="ad-colors"><input type="color" id="e-a" value="${esc(e.a || "#ff2e93")}"><input type="color" id="e-b" value="${esc(e.b || "#b44dff")}"><span class="hint">Used only when there's no poster image.</span></div></div>
      <div class="field">${chk("e-pub", "Live on the site", e.published !== false, "Untick to hide it without deleting.")}${chk("e-feat", "Featured event", e.featured, "Shown in the big banner on the homepage and Events page.")}</div>
      <div class="span-2 ad-form-foot"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit" id="ev-save">${isNew ? "Create event" : "Save changes"}</button></div>
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
      <div class="ad-list">${S.products.map((p) => `
        <div class="ad-row ${p.published === false ? "is-hidden" : ""}">
          <span class="ad-thumb sq">${RR.productArt(p)}</span>
          <div class="ad-row-main"><b>${esc(p.name)}</b><small>${esc(p.category)} · ${fmt(p.price)} · ${esc((p.sizes || []).join(", "))}</small>
            <div class="ad-chips">${p.published === false ? `<span class="tag">Hidden</span>` : `<span class="tag ok">Live</span>`}${p.featured ? `<span class="tag pink">★ Featured</span>` : ""}${p.badge ? `<span class="tag">${esc(p.badge)}</span>` : ""}${p.stock != null && p.stock !== "" ? `<span class="tag ${+p.stock === 0 ? "warn" : ""}">${+p.stock === 0 ? "Out of stock" : p.stock + " in stock"}</span>` : ""}</div></div>
          <div class="ad-row-actions">
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
      <div class="field"><span class="label">Placeholder (when there's no photo)</span><div class="ad-colors">
        <select class="input" id="p-shape" style="max-width:170px">${SHAPES.map(([k, l]) => `<option value="${k}" ${p.shape === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input type="color" id="p-a" value="${esc(p.a || "#ff2e93")}"><input type="color" id="p-b" value="${esc(p.b || "#7b2cff")}"></div></div>
      <div class="field">${chk("p-pub", "Live on the site", p.published !== false)}${chk("p-feat", "Featured", p.featured, "Featured items show first in the homepage Merch row.")}</div>
      <div class="span-2 ad-form-foot"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" type="submit" id="pr-save">${isNew ? "Create product" : "Save changes"}</button></div>
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
        <div class="ad-form-foot sticky"><button class="btn btn-primary" type="submit" id="ct-save" ${S.site ? "" : "disabled"}>Save site content</button></div>
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
      <div class="ad-form-foot sticky"><button class="btn btn-primary" id="faq-save" ${S.site ? "" : "disabled"}>Save FAQs</button></div>`;
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
      <div class="ad-list">${list.map((x) => `
        <div class="ad-msg ${x.status === "new" ? "is-new" : ""}">
          <div class="ad-msg-top"><span class="tag ${x.topic === "partner" || x.topic === "host" ? "pink" : ""}">${esc(topicName(x.topic))}</span><small class="muted">${esc(when(x.createdAt))}</small></div>
          <b>${esc(x.name)}</b>
          <div class="ad-msg-meta"><a class="link" href="mailto:${esc(x.email)}">${esc(x.email)}</a>${x.phone ? ` · <a class="link" href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : ""}${x.uid ? ` · <span class="muted">has an account</span>` : ""}</div>
          <p>${esc(x.message)}</p>
          <div class="ad-row-actions">
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
     SUBSCRIBERS
     ========================================================= */
  let subQ = "";
  function vSubscribers(m) {
    const list = S.subscribers.filter((s) => !subQ || s.email.includes(subQ.toLowerCase()));
    m.innerHTML = head("Subscribers", `${S.subscribers.length} people on the newsletter list. Sending newsletters from here comes once the email service is connected.`, `<button class="btn btn-ghost" id="sub-csv" ${S.subscribers.length ? "" : "disabled"}>${icon("download")} Export CSV</button>`) + `
      <input class="input" id="sub-q" placeholder="Search emails…" value="${esc(subQ)}" style="max-width:360px;margin-bottom:16px">
      <div class="panel" style="padding:8px 0"><table class="ad-table"><thead><tr><th>Email</th><th>Joined</th><th>From</th><th></th></tr></thead><tbody>
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
