// POST /api/phone-login  { phone, password }  →  { token }
//
// Firebase has no built-in "phone + password" sign-in, so:
//   1. find the account linked to the phone (Firestore phones/{phone} → uid → email)
//   2. check the password against Firebase Auth (same check as normal email sign-in)
//   3. if it's right, return a one-time custom token; the browser signs in with it.
// The email is never sent back, and wrong phone / wrong password give the same answer,
// so nobody can use this to discover who has an account.
import { firebaseAdmin, json, cors, normPhone, WEB_API_KEY, SITE_URL } from "../lib/firebase.mjs";

const NO_MATCH = "Those details don't match an account. Check and try again.";

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, origin);

  let body;
  try { body = await req.json(); } catch { return json(400, { error: NO_MATCH }, origin); }
  const phone = normPhone(body.phone);
  const password = String(body.password || "");
  if (!/^[17]\d{8}$/.test(phone) || !password || password.length > 200) return json(400, { error: NO_MATCH }, origin);

  try {
    const app = firebaseAdmin();
    const link = await app.firestore().doc(`phones/${phone}`).get();
    if (!link.exists) return json(401, { error: NO_MATCH }, origin);

    const user = await app.auth().getUser(link.data().uid);
    if (!user.email || user.disabled) return json(401, { error: NO_MATCH }, origin);

    // Verify the password the same way the normal email sign-in does.
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: SITE_URL + "/" },
      body: JSON.stringify({ email: user.email, password, returnSecureToken: true })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const code = (err.error && err.error.message) || "";
      if (code.startsWith("TOO_MANY_ATTEMPTS")) return json(429, { error: "Too many attempts. Wait a few minutes and try again." }, origin);
      return json(401, { error: NO_MATCH }, origin);
    }

    const token = await app.auth().createCustomToken(user.uid);
    return json(200, { token }, origin);
  } catch (e) {
    console.error("phone-login failed:", e);
    return json(500, { error: "Phone sign-in is temporarily unavailable. Use the Email tab instead." }, origin);
  }
};

export const config = { path: "/api/phone-login" };
