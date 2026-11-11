// POST /api/checkout   (optional header: Authorization: Bearer <Firebase ID token>)
//   body: { items: [{ type: "ticket"|"merch", id, variant, qty }], contact: { name, email, phone },
//           delivery: { zoneId, town, area, street, notes, phone } | null, mpesaPhone }
//   → { id, key, total }   then the customer gets the M-Pesa PIN prompt on mpesaPhone.
//
// Prices, fees and availability are always worked out here from the database,
// never taken from the browser. The order starts as "pending"; the payment callback
// (or /api/order-status) marks it paid and issues the tickets.
import admin from "firebase-admin";
import { firebaseAdmin, json, cors, normPhone } from "../lib/firebase.mjs";
import { mpesaConfig, stkPush } from "../lib/mpesa.mjs";
import { newOrderId, randomCode } from "../lib/orders.mjs";

const { FieldValue } = admin.firestore;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const str = (v, max) => String(v ?? "").trim().slice(0, max);

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, origin);
  const bad = (msg, status = 400) => json(status, { error: msg }, origin);

  const mp = mpesaConfig();
  if (!mp.ready) return bad("M-Pesa payments are being set up. Please try again a little later.", 503);

  let body;
  try { body = await req.json(); } catch { return bad("Something went wrong. Refresh the page and try again."); }

  // ---- basic checks ----
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 30) return bad("Your cart is empty.");
  const contact = { name: str(body.contact?.name, 100), email: str(body.contact?.email, 200).toLowerCase(), phone: normPhone(body.contact?.phone) };
  if (contact.name.length < 2) return bad("Enter your full name.");
  if (!EMAIL_RE.test(contact.email)) return bad("Enter a valid email address.");
  const mpesaPhone = normPhone(body.mpesaPhone);
  if (!/^[17]\d{8}$/.test(mpesaPhone)) return bad("Enter a valid Safaricom number for M-Pesa.");

  try {
    const app = firebaseAdmin(), db = app.firestore();

    // Signed-in buyers get the order linked to their account.
    let uid = null;
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (tok) { try { uid = (await app.auth().verifyIdToken(tok)).uid; } catch { /* treat as guest */ } }

    const site = await db.doc("content/site").get();
    if (!site.exists) return bad("The shop isn't open yet.", 503);

    // ---- price every line from the database ----
    const lines = [];
    const evCache = {}, prCache = {};
    const getDoc = async (cache, col, id) => (cache[id] ??= await db.doc(`${col}/${id}`).get().then((s) => (s.exists ? s.data() : null)));
    const wanted = {};   // event/tier or product totals across lines, for availability checks
    for (const raw of items) {
      const type = raw.type === "merch" ? "merch" : raw.type === "ticket" ? "ticket" : null;
      const id = str(raw.id, 80), variant = str(raw.variant, 80), qty = Math.floor(Number(raw.qty));
      if (!type || !id || !variant || !(qty >= 1 && qty <= 20)) return bad("Your cart has an item we couldn't read. Remove it and add it again.");
      if (type === "ticket") {
        const e = await getDoc(evCache, "events", id);
        if (!e || e.published === false) return bad("One of the events in your cart is no longer available.", 409);
        if (e.date && new Date(e.date).getTime() + 6 * 3600e3 < Date.now()) return bad(`${e.title} has already happened.`, 409);
        const tier = (e.tiers || []).find((t) => t.name === variant);
        if (!tier) return bad(`The "${variant}" ticket for ${e.title} is no longer available.`, 409);
        if (tier.soldOut) return bad(`${variant} tickets for ${e.title} are sold out.`, 409);
        const k = `t:${id}:${variant}`; wanted[k] = (wanted[k] || 0) + qty;
        if (typeof tier.qty === "number") {
          const left = tier.qty - ((e.sold || {})[variant] || 0);
          if (wanted[k] > left) return bad(left > 0 ? `Only ${left} ${variant} ticket${left > 1 ? "s" : ""} left for ${e.title}.` : `${variant} tickets for ${e.title} are sold out.`, 409);
        }
        lines.push({ type, id, variant, qty, price: Number(tier.price) || 0, name: e.title });
      } else {
        const p = await getDoc(prCache, "products", id);
        if (!p || p.published === false) return bad("One of the items in your cart is no longer available.", 409);
        if (Array.isArray(p.sizes) && p.sizes.length && !p.sizes.includes(variant)) return bad(`Size ${variant} isn't available for ${p.name}.`, 409);
        const k = `p:${id}`; wanted[k] = (wanted[k] || 0) + qty;
        if (typeof p.stock === "number" && wanted[k] > p.stock) return bad(p.stock > 0 ? `Only ${p.stock} ${p.name} left in stock.` : `${p.name} is out of stock.`, 409);
        lines.push({ type, id, variant, qty, price: Number(p.price) || 0, name: p.name });
      }
    }

    // ---- delivery ----
    const hasMerch = lines.some((l) => l.type === "merch");
    let delivery = null, deliveryFee = 0;
    if (hasMerch) {
      const zones = site.data().delivery || [];
      const d = body.delivery || {};
      const zone = zones.find((z) => z.id === d.zoneId);
      if (!zone) return bad("Choose a delivery zone.");
      delivery = { zoneId: zone.id, zone: zone.name, town: str(d.town, 80), area: str(d.area, 80), street: str(d.street, 160), notes: str(d.notes, 200), phone: normPhone(d.phone) };
      if (!delivery.town || !delivery.area || !delivery.street) return bad("Fill in your delivery address.");
      if (!/^[17]\d{8}$/.test(delivery.phone)) return bad("Enter a valid delivery phone number.");
      deliveryFee = Number(zone.fee) || 0;
    }

    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const total = subtotal + deliveryFee;
    if (total < 1) return bad("This order has nothing to pay for.");
    if (total > 250000) return bad("That's above the M-Pesa limit for one payment. Split it into smaller orders.");

    // ---- one prompt at a time per phone (stops repeated prompts being fired at someone) ----
    const thr = db.doc("throttle/" + mpesaPhone);
    const last = await thr.get();
    if (last.exists && Date.now() - last.data().at < 20e3) return bad("A payment prompt was just sent to that number. Wait a few seconds and try again.", 429);
    await thr.set({ at: Date.now() });

    // ---- create the order, then send the prompt ----
    const id = newOrderId(), key = randomCode(24);
    const ref = db.doc("orders/" + id);
    await ref.set({
      key, status: "pending", items: lines, subtotal, deliveryFee, total,
      contact, email: contact.email, uid, delivery, mpesaPhone,
      createdAt: FieldValue.serverTimestamp(), env: mp.env
    });

    try {
      const r = await stkPush(mp, { phone: mpesaPhone, amount: total, reference: id, description: "Rada Republic" });
      await ref.update({ checkoutRequestId: r.checkoutRequestId, merchantRequestId: r.merchantRequestId, promptAt: FieldValue.serverTimestamp() });
    } catch (e) {
      console.error("STK push failed", id, e.message, e.daraja || "");
      await ref.update({ status: "failed", resultDesc: "Prompt not sent: " + e.message, closedAt: FieldValue.serverTimestamp() });
      return bad("We couldn't send the M-Pesa prompt to that number. Check it's a Safaricom line and try again.", 502);
    }
    return json(200, { id, key, total }, origin);
  } catch (e) {
    console.error("checkout failed", e);
    return bad("Something went wrong on our side. You haven't been charged. Please try again.", 500);
  }
};

export const config = { path: "/api/checkout" };
