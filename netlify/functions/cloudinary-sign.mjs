// POST /api/cloudinary-sign   (header: Authorization: Bearer <Firebase ID token>)
//   → { cloudName, apiKey, timestamp, folder, signature }
//
// Lets ADMINS ONLY upload images straight from the browser to Cloudinary.
// The browser never sees the Cloudinary secret: this function checks the user is a
// signed-in admin (Firestore admins/{uid}), then signs the upload with the secret.
// Netlify environment variables needed: CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
import crypto from "node:crypto";
import { firebaseAdmin, json, cors } from "../lib/firebase.mjs";

const CLOUD_NAME = "raolcj07";
const FOLDER = "radarepublic";

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, origin);

  const apiKey = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
  if (!apiKey || !secret) return json(503, { error: "Image upload isn't set up yet. Paste an image link instead.", code: "not-configured" }, origin);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Please sign in again." }, origin);

  try {
    const app = firebaseAdmin();
    const { uid } = await app.auth().verifyIdToken(token);
    const isAdmin = (await app.firestore().doc(`admins/${uid}`).get()).exists;
    if (!isAdmin) return json(403, { error: "Only admins can upload images." }, origin);

    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary signature: the signed params sorted alphabetically, joined with &, plus the secret, SHA-1.
    const toSign = `folder=${FOLDER}&timestamp=${timestamp}`;
    const signature = crypto.createHash("sha1").update(toSign + secret).digest("hex");
    return json(200, { cloudName: CLOUD_NAME, apiKey, timestamp, folder: FOLDER, signature }, origin);
  } catch (e) {
    console.error("cloudinary-sign failed:", e);
    return json(401, { error: "Please sign in again." }, origin);
  }
};

export const config = { path: "/api/cloudinary-sign" };
