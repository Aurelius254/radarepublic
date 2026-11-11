// GET /api/qr?c=RR-XXXX-XXXX-XXXX  → PNG QR code (used by the ticket emails, where scripts can't run).
// Only ticket-shaped codes are drawn; the image itself grants nothing (the gate checks the code in the database).
import QRCode from "qrcode";
import { TICKET_RE } from "../lib/orders.mjs";

export default async (req) => {
  const c = new URL(req.url).searchParams.get("c") || "";
  if (!TICKET_RE.test(c)) return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(c, { width: 360, margin: 2, errorCorrectionLevel: "M", color: { dark: "#07060b", light: "#ffffff" } });
  return new Response(png, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
};

export const config = { path: "/api/qr" };
