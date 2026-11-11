// Safaricom Daraja (Lipa na M-Pesa Online / STK push).
// Netlify environment variables:
//   MPESA_ENV              "sandbox" (testing) or "production"
//   MPESA_CONSUMER_KEY     from the Daraja app
//   MPESA_CONSUMER_SECRET  from the Daraja app
//   MPESA_SHORTCODE        paybill / till (sandbox defaults to 174379)
//   MPESA_PASSKEY          Lipa na M-Pesa passkey (sandbox has a public default)
//   MPESA_TYPE             optional: "paybill" (default) or "till"
//   MPESA_CALLBACK_SECRET  any long random text; protects the callback URL
import { SITE_URL } from "./firebase.mjs";

const SANDBOX_SHORTCODE = "174379";
const SANDBOX_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"; // published by Safaricom for testing

export function mpesaConfig() {
  const env = (process.env.MPESA_ENV || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
  const sandbox = env === "sandbox";
  const c = {
    env,
    base: sandbox ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke",
    key: process.env.MPESA_CONSUMER_KEY,
    secret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE || (sandbox ? SANDBOX_SHORTCODE : ""),
    passkey: process.env.MPESA_PASSKEY || (sandbox ? SANDBOX_PASSKEY : ""),
    till: (process.env.MPESA_TYPE || "").toLowerCase() === "till",
    callbackSecret: process.env.MPESA_CALLBACK_SECRET || ""
  };
  c.missing = [["MPESA_CONSUMER_KEY", c.key], ["MPESA_CONSUMER_SECRET", c.secret], ["MPESA_SHORTCODE", c.shortcode], ["MPESA_PASSKEY", c.passkey], ["MPESA_CALLBACK_SECRET", c.callbackSecret]]
    .filter(([, v]) => !v).map(([k]) => k);   // names only, never values
  c.ready = !c.missing.length;
  return c;
}

// Daraja wants the time in Kenya (UTC+3) as YYYYMMDDHHmmss.
function stamp() {
  return new Date(Date.now() + 3 * 3600e3).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

let cachedToken = null;
async function token(c) {
  if (cachedToken && cachedToken.exp > Date.now() + 60e3) return cachedToken.value;
  const r = await fetch(`${c.base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: "Basic " + Buffer.from(`${c.key}:${c.secret}`).toString("base64") }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("M-Pesa sign-in failed: " + r.status + " " + JSON.stringify(j).slice(0, 200));
  cachedToken = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3599) * 1000 };
  return cachedToken.value;
}

async function call(c, path, body) {
  const r = await fetch(c.base + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + (await token(c)), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

// Sends the PIN prompt to the customer's phone.
// phone: 9 digits (7XXXXXXXX / 1XXXXXXXX). Returns { checkoutRequestId, merchantRequestId } or throws.
export async function stkPush(c, { phone, amount, reference, description }) {
  const ts = stamp();
  // Note: Daraja rejects callback URLs that contain words like "mpesa" or "safaricom".
  const callback = `${SITE_URL}/api/pay-callback?s=${encodeURIComponent(c.callbackSecret)}`;
  const res = await call(c, "/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: c.shortcode,
    Password: Buffer.from(c.shortcode + c.passkey + ts).toString("base64"),
    Timestamp: ts,
    TransactionType: c.till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    Amount: Math.round(amount),
    PartyA: "254" + phone,
    PartyB: c.shortcode,
    PhoneNumber: "254" + phone,
    CallBackURL: callback,
    AccountReference: String(reference).slice(0, 12),
    TransactionDesc: String(description || "Payment").slice(0, 13)
  });
  if (!res.ok || String(res.data.ResponseCode) !== "0") {
    const msg = res.data.errorMessage || res.data.ResponseDescription || res.data.CustomerMessage || `HTTP ${res.status}`;
    const e = new Error(msg); e.daraja = res.data; throw e;
  }
  return { checkoutRequestId: res.data.CheckoutRequestID, merchantRequestId: res.data.MerchantRequestID };
}

// Asks Safaricom what happened to a prompt (used when the callback is slow or lost).
// Returns null while still waiting, otherwise { ok, code, desc }.
export async function stkQuery(c, checkoutRequestId) {
  const ts = stamp();
  const res = await call(c, "/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: c.shortcode,
    Password: Buffer.from(c.shortcode + c.passkey + ts).toString("base64"),
    Timestamp: ts,
    CheckoutRequestID: checkoutRequestId
  });
  const d = res.data || {};
  if (d.ResultCode === undefined || d.ResultCode === null || d.errorCode) return null;   // still processing (or rate limited)
  const code = Number(d.ResultCode);
  return { ok: code === 0, code, desc: d.ResultDesc || "" };
}

// Friendly text for the common STK result codes.
export function resultMessage(code, desc) {
  switch (Number(code)) {
    case 0: return "Payment received.";
    case 1032: return "The M-Pesa prompt was cancelled.";
    case 1037: return "We couldn't reach the phone. Make sure it's on and has signal, then try again.";
    case 1: return "The M-Pesa balance isn't enough for this payment.";
    case 2001: return "The M-Pesa PIN was wrong.";
    case 1019: return "The M-Pesa prompt expired before it was confirmed.";
    case 1001: return "M-Pesa is busy with another request on that phone. Wait a moment and try again.";
    default: return desc || "The payment didn't go through.";
  }
}
