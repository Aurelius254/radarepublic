// POST /api/pay-callback?s=<MPESA_CALLBACK_SECRET>
// Safaricom calls this when the customer accepts, cancels or ignores the M-Pesa prompt.
// (The path avoids the word "mpesa": Daraja refuses callback URLs containing it.)
import crypto from "node:crypto";
import { firebaseAdmin } from "../lib/firebase.mjs";
import { mpesaConfig } from "../lib/mpesa.mjs";
import { finalizeOrder } from "../lib/orders.mjs";

const ACK = () => new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), { status: 200, headers: { "Content-Type": "application/json" } });
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const mp = mpesaConfig();
  const s = new URL(req.url).searchParams.get("s") || "";
  if (!mp.callbackSecret || !same(s, mp.callbackSecret)) return new Response("Forbidden", { status: 403 });

  let body;
  try { body = await req.json(); } catch { return ACK(); }
  const cb = body && body.Body && body.Body.stkCallback;
  if (!cb || !cb.CheckoutRequestID) return ACK();

  try {
    const db = firebaseAdmin().firestore();
    const q = await db.collection("orders").where("checkoutRequestId", "==", cb.CheckoutRequestID).limit(1).get();
    if (q.empty) { console.warn("callback for unknown request", cb.CheckoutRequestID); return ACK(); }
    const meta = Object.fromEntries(((cb.CallbackMetadata && cb.CallbackMetadata.Item) || []).map((i) => [i.Name, i.Value]));
    const code = Number(cb.ResultCode);
    await finalizeOrder(db, q.docs[0].id, {
      ok: code === 0, code, desc: cb.ResultDesc || "",
      receipt: meta.MpesaReceiptNumber || null, paidAmount: meta.Amount ?? null, paidPhone: meta.PhoneNumber ?? null
    });
  } catch (e) {
    console.error("callback handling failed", e);
    // Still acknowledge: /api/order-status asks Safaricom directly if the callback didn't land.
  }
  return ACK();
};

export const config = { path: "/api/pay-callback" };
