// Shared Firebase Admin setup for Netlify functions.
// The service account JSON lives in the Netlify environment variable FIREBASE_SERVICE_ACCOUNT
// (never in the code or the repo).
import admin from "firebase-admin";

export const WEB_API_KEY = "AIzaSyA_mhpr5En2Hryzn1oEYUk-Zh6zTY3jJNE"; // public web key (same as js/firebase-config.js)
export const SITE_URL = "https://radarepublic.netlify.app";

export function firebaseAdmin() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.firebase_service_account;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set in Netlify");
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

// Allow calls from the Netlify site itself, the old GitHub Pages copy and local previews.
const ALLOWED = [SITE_URL, "https://aurelius254.github.io", "http://localhost:5174", "http://localhost:8888"];
export function cors(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : SITE_URL,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}
export const json = (status, body, origin) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

export function normPhone(p) {
  p = String(p || "").replace(/\D/g, "");
  if (p.startsWith("254")) p = p.slice(3);
  if (p.startsWith("0")) p = p.slice(1);
  return p;
}
