// Orders: turning a confirmed M-Pesa payment into tickets, and emailing them.
// Email uses Brevo (free plan: 300 emails a day). Netlify environment variables:
//   BREVO_API_KEY   from Brevo → SMTP & API → API keys
//   MAIL_FROM       a sender address you've verified in Brevo (e.g. your Gmail for now)
//   MAIL_FROM_NAME  optional, defaults to "Rada Republic"
import crypto from "node:crypto";
import admin from "firebase-admin";
import { SITE_URL } from "./firebase.mjs";

const { FieldValue, FieldPath } = admin.firestore;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O/1/I, easy to read out loud

export function randomCode(len) {
  const b = crypto.randomBytes(len);
  let s = ""; for (let i = 0; i < len; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}
export const newOrderId = () => "RR-" + randomCode(7);
export const newTicketCode = () => `RR-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
export const TICKET_RE = /^RR-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

// Applies a payment result to an order exactly once.
// result: { ok, code, desc, receipt, paidAmount, paidPhone }
// Returns { order, changed }.
export async function finalizeOrder(db, orderId, result) {
  const ref = db.doc("orders/" + orderId);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { order: null, changed: false };
    const o = snap.data();

    if (o.status !== "pending") {
      // A late callback can still fill in the M-Pesa receipt number.
      if (o.status === "paid" && result.ok && result.receipt && !o.mpesaReceipt) tx.update(ref, { mpesaReceipt: result.receipt });
      return { order: { ...o, id: snap.id }, changed: false };
    }

    if (!result.ok) {
      const upd = { status: Number(result.code) === 1032 ? "cancelled" : "failed", resultCode: Number(result.code) || null, resultDesc: result.desc || "", closedAt: FieldValue.serverTimestamp() };
      tx.update(ref, upd);
      return { order: { ...o, ...upd, id: snap.id }, changed: true };
    }

    // ---- paid: read everything first (Firestore transactions need reads before writes) ----
    const ticketItems = o.items.filter((i) => i.type === "ticket");
    const merchItems = o.items.filter((i) => i.type === "merch");
    const eventIds = [...new Set(ticketItems.map((i) => i.id))];
    const productIds = [...new Set(merchItems.map((i) => i.id))];
    const evSnaps = await Promise.all(eventIds.map((id) => tx.get(db.doc("events/" + id))));
    const prSnaps = await Promise.all(productIds.map((id) => tx.get(db.doc("products/" + id))));
    const events = Object.fromEntries(evSnaps.map((s) => [s.id, s.exists ? s.data() : null]));
    const products = Object.fromEntries(prSnaps.map((s) => [s.id, s.exists ? s.data() : null]));

    const now = FieldValue.serverTimestamp();
    const codes = [];
    for (const it of ticketItems) {
      const e = events[it.id] || {};
      for (let n = 0; n < it.qty; n++) {
        const code = newTicketCode();
        codes.push(code);
        tx.set(db.doc("tickets/" + code), {
          code, orderId: snap.id, eventId: it.id,
          eventTitle: e.title || it.name, eventDate: e.date || "", venue: e.venue || "", city: e.city || "",
          image: e.image || "", a: e.a || "", b: e.b || "",
          tier: it.variant, price: it.price,
          name: o.contact.name, email: o.email, uid: o.uid || null,
          status: "valid", issuedAt: now, checkedInAt: null, checkedInBy: null
        });
      }
    }
    // Count tickets sold per tier (kept apart from "tiers" so editing an event never resets it).
    const soldByEvent = {};
    ticketItems.forEach((it) => { const m = (soldByEvent[it.id] ||= {}); m[it.variant] = (m[it.variant] || 0) + it.qty; });
    for (const [id, tiers] of Object.entries(soldByEvent)) {
      if (!events[id]) continue;
      const args = [];
      for (const [tier, n] of Object.entries(tiers)) args.push(new FieldPath("sold", tier), FieldValue.increment(n));
      tx.update(db.doc("events/" + id), ...args);
    }
    // Reduce merch stock where it's tracked.
    const stockBy = {};
    merchItems.forEach((it) => { stockBy[it.id] = (stockBy[it.id] || 0) + it.qty; });
    for (const [id, n] of Object.entries(stockBy)) {
      const p = products[id];
      if (p && typeof p.stock === "number") tx.update(db.doc("products/" + id), { stock: Math.max(0, p.stock - n) });
    }

    const upd = {
      status: "paid", paidAt: now, ticketCodes: codes,
      mpesaReceipt: result.receipt || null, paidAmount: result.paidAmount ?? null, paidPhone: result.paidPhone ? String(result.paidPhone) : null,
      resultCode: 0, resultDesc: result.desc || "",
      fulfilment: merchItems.length ? "to-deliver" : null
    };
    tx.update(ref, upd);
    return { order: { ...o, ...upd, id: snap.id }, changed: true };
  });

  if (out.changed && out.order && out.order.status === "paid") {
    try { await emailOrder(db, out.order.id); } catch (e) { console.error("email failed", e); }
  }
  return out;
}

/* ---------------- email ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kes = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
export const emailReady = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
export const orderLink = (o) => `${SITE_URL}/order.html?id=${encodeURIComponent(o.id)}&k=${encodeURIComponent(o.key)}`;

function orderEmailHTML(o, tickets) {
  const first = esc(String(o.contact.name || "").split(" ")[0] || "there");
  const merch = o.items.filter((i) => i.type === "merch");
  const ticketBlocks = tickets.map((t) => `
    <tr><td style="padding:0 0 18px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #ece6f3">
        <tr><td style="padding:20px 22px" valign="top">
          <div style="display:inline-block;background:#ffe3f1;color:#d4136f;font:700 11px Arial;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:99px">${esc(t.tier)}</div>
          <div style="font:800 19px Arial;color:#120d1a;margin:10px 0 6px">${esc(t.eventTitle)}</div>
          <div style="font:14px Arial;color:#5b5466;line-height:1.5">${esc(when(t.eventDate))}<br>${esc([t.venue, t.city].filter(Boolean).join(", "))}</div>
          <div style="font:700 13px 'Courier New',monospace;color:#120d1a;margin-top:12px;letter-spacing:.06em">${esc(t.code)}</div>
        </td>
        <td width="170" style="padding:14px" align="center" valign="middle">
          <img src="${SITE_URL}/api/qr?c=${encodeURIComponent(t.code)}" width="150" height="150" alt="QR code ${esc(t.code)}" style="display:block;border:0">
        </td></tr>
      </table></td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f4f1f8;padding:24px 12px">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="background:#07060b;border-radius:18px 18px 0 0;padding:26px 26px 22px">
      <img src="${SITE_URL}/assets/logo-sm.png" width="44" height="44" alt="" style="vertical-align:middle;border:0">
      <span style="font:800 20px Arial;color:#ffffff;vertical-align:middle;margin-left:10px">Rada <span style="color:#ff2e93">Republic</span></span>
    </td></tr>
    <tr><td style="background:#ffffff;padding:26px">
      <div style="font:800 24px Arial;color:#120d1a;margin-bottom:8px">You're in, ${first}!</div>
      <div style="font:15px Arial;color:#5b5466;line-height:1.6">Payment of <b style="color:#120d1a">${kes(o.total)}</b> received via M-Pesa${o.mpesaReceipt ? ` (ref <b style="color:#120d1a">${esc(o.mpesaReceipt)}</b>)` : ""}. Order <b style="color:#120d1a">${esc(o.id)}</b>.</div>
      ${tickets.length ? `<div style="font:15px Arial;color:#5b5466;line-height:1.6;margin-top:10px">Show the QR code${tickets.length > 1 ? "s" : ""} below at the gate. Each code lets one person in, once.</div>` : ""}
    </td></tr>
    ${tickets.length ? `<tr><td style="background:#f4f1f8;padding:20px 0 2px"><table width="100%" cellpadding="0" cellspacing="0">${ticketBlocks}</table></td></tr>` : ""}
    ${merch.length ? `<tr><td style="background:#ffffff;padding:22px 26px;border-top:1px solid #ece6f3">
      <div style="font:800 17px Arial;color:#120d1a;margin-bottom:10px">Merch delivery</div>
      ${merch.map((m) => `<div style="font:14px Arial;color:#3a3345;padding:4px 0">${m.qty} × ${esc(m.name)} (${esc(m.variant)}) · ${kes(m.qty * m.price)}</div>`).join("")}
      ${o.delivery ? `<div style="font:14px Arial;color:#5b5466;margin-top:10px;line-height:1.5">${esc([o.delivery.street, o.delivery.area, o.delivery.town].filter(Boolean).join(", "))}<br>We'll call ${esc("0" + (o.delivery.phone || ""))} to arrange delivery within 1–3 days.</div>` : ""}
    </td></tr>` : ""}
    <tr><td style="background:#ffffff;padding:22px 26px;border-radius:0 0 18px 18px;border-top:1px solid #ece6f3" align="center">
      <a href="${orderLink(o)}" style="display:inline-block;background:#ff2e93;color:#ffffff;font:700 15px Arial;text-decoration:none;padding:13px 26px;border-radius:99px">View your order</a>
      <div style="font:12px Arial;color:#8a8296;margin-top:16px;line-height:1.5">Keep this email: it's your proof of purchase. Questions? Just reply.</div>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

export async function emailOrder(db, orderId, { force = false } = {}) {
  const ref = db.doc("orders/" + orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Order not found");
  const o = { ...snap.data(), id: snap.id };
  if (o.status !== "paid") throw new Error("Order isn't paid");
  if (o.emailedAt && !force) return { skipped: true };
  if (!emailReady()) { await ref.update({ emailError: "Email isn't set up yet" }); return { skipped: true, reason: "not-configured" }; }

  const tSnaps = o.ticketCodes && o.ticketCodes.length ? await db.getAll(...o.ticketCodes.map((c) => db.doc("tickets/" + c))) : [];
  const tickets = tSnaps.filter((s) => s.exists).map((s) => s.data());
  const subject = tickets.length
    ? `Your ticket${tickets.length > 1 ? "s" : ""} for ${tickets[0].eventTitle}${new Set(tickets.map((t) => t.eventId)).size > 1 ? " and more" : ""} · ${o.id}`
    : `Your Rada Republic order ${o.id}`;

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || "Rada Republic" },
      to: [{ email: o.email, name: o.contact.name || undefined }],
      replyTo: { email: process.env.MAIL_REPLY_TO || process.env.MAIL_FROM },
      subject,
      htmlContent: orderEmailHTML(o, tickets)
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    await ref.update({ emailError: `Brevo ${r.status}: ${t.slice(0, 300)}` });
    throw new Error("Brevo " + r.status + " " + t.slice(0, 200));
  }
  await ref.update({ emailedAt: FieldValue.serverTimestamp(), emailError: FieldValue.delete() });
  return { sent: true };
}
