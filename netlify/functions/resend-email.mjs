// POST /api/resend-email { id }   (header: Authorization: Bearer <admin's Firebase ID token>)
// Lets an admin send an order's ticket email again (e.g. the buyer can't find it).
import { firebaseAdmin, json, cors } from "../lib/firebase.mjs";
import { emailOrder, emailReady } from "../lib/orders.mjs";

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, origin);
  if (!emailReady()) return json(503, { error: "Email isn't set up yet (BREVO_API_KEY and MAIL_FROM in Netlify)." }, origin);
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let body; try { body = await req.json(); } catch { body = {}; }
  try {
    const app = firebaseAdmin(), db = app.firestore();
    const { uid } = await app.auth().verifyIdToken(tok);
    if (!(await db.doc("admins/" + uid).get()).exists) return json(403, { error: "Admins only." }, origin);
    await emailOrder(db, String(body.id || ""), { force: true });
    return json(200, { ok: true }, origin);
  } catch (e) {
    console.error("resend failed", e);
    return json(400, { error: e.message || "Couldn't send the email." }, origin);
  }
};

export const config = { path: "/api/resend-email" };
