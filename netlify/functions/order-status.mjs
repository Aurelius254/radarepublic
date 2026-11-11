// POST /api/order-status  { id, key }   (or header Authorization for the owner / an admin, without key)
//   → { order, tickets }
// Used by the checkout prompt (polling while the customer enters their PIN) and the order page.
// If the payment is still pending after a while, it asks Safaricom directly, in case the callback was lost.
import { firebaseAdmin, json, cors } from "../lib/firebase.mjs";
import { mpesaConfig, stkQuery, resultMessage } from "../lib/mpesa.mjs";
import { finalizeOrder } from "../lib/orders.mjs";

const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : 0);
const iso = (ts) => (ts && ts.toDate ? ts.toDate().toISOString() : null);

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, origin);
  let body; try { body = await req.json(); } catch { body = {}; }
  const id = String(body.id || "").slice(0, 20), key = String(body.key || "");
  const nf = () => json(404, { error: "Order not found" }, origin);
  if (!/^RR-[A-Z2-9]{7}$/.test(id)) return nf();

  try {
    const app = firebaseAdmin(), db = app.firestore();
    const ref = db.doc("orders/" + id);
    let snap = await ref.get();
    if (!snap.exists) return nf();
    let o = snap.data();

    // Access: the secret key from the link, or the signed-in owner, or an admin.
    let allowed = key && o.key && key === o.key;
    if (!allowed) {
      const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (tok) {
        try {
          const u = await app.auth().verifyIdToken(tok);
          allowed = (o.uid && o.uid === u.uid) || (u.email_verified && u.email && u.email.toLowerCase() === o.email)
            || (await db.doc("admins/" + u.uid).get()).exists;
        } catch { /* not allowed */ }
      }
    }
    if (!allowed) return nf();

    // Still waiting? After 25s, ask Safaricom at most every 8s.
    if (o.status === "pending" && o.checkoutRequestId) {
      const age = Date.now() - ms(o.promptAt || o.createdAt);
      const sinceQuery = Date.now() - (o.lastQueryAt || 0);
      const mp = mpesaConfig();
      if (mp.ready && age > 25e3 && sinceQuery > 8e3) {
        await ref.update({ lastQueryAt: Date.now() });
        try {
          const r = await stkQuery(mp, o.checkoutRequestId);
          if (r) { await finalizeOrder(db, id, { ok: r.ok, code: r.code, desc: r.desc }); }
          else if (age > 4 * 60e3) { await finalizeOrder(db, id, { ok: false, code: 1019, desc: "No answer from M-Pesa" }); }
        } catch (e) { console.warn("stk query failed", e.message); }
        snap = await ref.get(); o = snap.data();
      }
    }

    const tickets = o.status === "paid" && o.ticketCodes && o.ticketCodes.length
      ? (await db.getAll(...o.ticketCodes.map((c) => db.doc("tickets/" + c)))).filter((s) => s.exists).map((s) => {
          const t = s.data(); return { ...t, issuedAt: iso(t.issuedAt), checkedInAt: iso(t.checkedInAt) };
        })
      : [];
    const order = {
      id, status: o.status, items: o.items, subtotal: o.subtotal, deliveryFee: o.deliveryFee, total: o.total,
      contact: o.contact, email: o.email, delivery: o.delivery, mpesaPhone: o.mpesaPhone, mpesaReceipt: o.mpesaReceipt || null,
      message: o.status === "paid" ? "Payment received." : o.status === "pending" ? "" : resultMessage(o.resultCode, o.resultDesc),
      createdAt: iso(o.createdAt), paidAt: iso(o.paidAt), emailed: !!o.emailedAt, fulfilment: o.fulfilment || null, test: o.env === "sandbox"
    };
    return json(200, { order, tickets }, origin);
  } catch (e) {
    console.error("order-status failed", e);
    return json(500, { error: "Couldn't load the order. Try again." }, origin);
  }
};

export const config = { path: "/api/order-status" };
