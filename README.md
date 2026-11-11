# Rada Republic — Tickets & Merch

**Live site:** https://radarepublic.netlify.app (admin panel: `/admin.html`)

To update it: commit your changes and `git push`. Netlify rebuilds automatically in about a minute.

**After changing CSS or JS:** bump the `?v=` version on the `css/styles.css` and `js/*.js` links in every `.html` file (e.g. `?v=20261111f` → `?v=20261112a`). Phones cache those files, and the new version tag makes them fetch the update instead of mixing a new page with an old stylesheet.

Static HTML/CSS/JS with no build step, plus server functions in `netlify/functions/`.

## Run it locally
```bash
python -m http.server 5174
```
Then open http://localhost:5174. Local pages call the live functions at radarepublic.netlify.app.

## Pages
| Page | File |
|---|---|
| Home (scrolling theme gradient) | index.html |
| Events (featured + filters) / event detail | events.html, event.html?id= |
| Merch (filters) / product detail | merch.html, product.html?id= |
| Cart, Checkout (guest, M-Pesa), Order + QR | cart.html, checkout.html, order.html?id=&k= |
| Contact, FAQs | contact.html, faq.html |
| My Profile, My Tickets | profile.html, tickets.html |
| Admin panel (admins only) | admin.html |

## Where things live
- `js/app.js`: header, footer, search, sign-in modal, cart, live catalogue loader, orders.
- `js/admin.js`: the admin panel (dashboard, orders, gate scanner, events, merch, content, FAQs, inbox, subscribers).
- `js/data.js`: the built-in sample catalogue, used until the admin imports data into the database.
- `css/styles.css`: theme tokens at the top (`--pink`, `--purple`, …).
- `netlify/functions/`: server code (`/api/...`). `netlify/lib/`: shared server code (Firebase, M-Pesa, orders and email).

## Backend: Firebase (Spark) + Netlify
- **Firebase project:** `radarepublic-bdf80`. Web config in `js/firebase-config.js` (public by design; access is controlled by the rules).
- **Sign-in:** Google, email + password, phone + password (`/api/phone-login`).
- **Database (Firestore):** `users`, `phones`, `admins`, `events`, `products`, `content`, `messages`, `subscribers`, `orders`, `tickets`, `throttle`.
- **Security rules:** `firestore.rules`. After changing them, paste the whole file into Firebase console → Firestore Database → Rules → **Publish**.
- **Admins:** in Firestore, create a document in the `admins` collection whose ID is the person's user ID (from Authentication → Users), with any field, e.g. `name: "Aurelius"`.

### How a purchase works
1. Checkout calls `/api/checkout`. The server prices the cart from the database, checks availability, saves a **pending** order and sends the M-Pesa PIN prompt (Daraja STK push).
2. Safaricom calls `/api/pay-callback` with the result. If it's slow, `/api/order-status` asks Safaricom directly.
3. On success the order becomes **paid**, ticket codes are issued (`tickets/{code}`), sold counts and stock update, and the ticket email goes out (Brevo). QR images in emails come from `/api/qr`.
4. At the gate, the admin panel's **Gate scanner** checks each code in once.

### Netlify environment variables
| Variable | What it is |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON (Project settings → Service accounts). |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Image uploads in the admin panel. |
| `MPESA_ENV` | `sandbox` for testing, `production` when live. |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` | From your app on developer.safaricom.co.ke. |
| `MPESA_CALLBACK_SECRET` | Any long random text. Protects the payment callback. |
| `MPESA_SHORTCODE`, `MPESA_PASSKEY` | Production only (sandbox uses Safaricom's test values 174379 and its public passkey). |
| `MPESA_TYPE` | Optional: `till` for a Buy Goods till; default is paybill. |
| `BREVO_API_KEY` | Brevo → SMTP & API → API keys. Free plan: 300 emails a day. |
| `MAIL_FROM` | A sender email verified in Brevo. `MAIL_FROM_NAME` and `MAIL_REPLY_TO` are optional. |

After adding or changing variables: Netlify → Deploys → Trigger deploy → Deploy site.
Never put any of these values in the code: the repository is public.
