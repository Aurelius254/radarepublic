# Rada Republic — Tickets & Merch (front-end prototype)

**Live site:** https://aurelius254.github.io/radarepublic/

To update it: commit your changes and `git push`. GitHub Pages republishes automatically in about a minute.

**After changing CSS or JS:** bump the `?v=` version on the `css/styles.css` and `js/*.js` links in every `.html` file (e.g. `?v=20261107c` → `?v=20261108a`). Phones cache those files, and the new version tag makes them fetch the update instead of mixing a new page with an old stylesheet.

Static HTML/CSS/JS. There's no build step.

## Run it
```bash
python -m http.server 5173
```
Then open http://localhost:5173

## Demo account (sample data only)
- Phone: 0712 345 678 (or email demo@radarepublic.co.ke)
- Password: rada2026

New sign-ups work too. Every account gets sample tickets on first login so "My Tickets" isn't empty. Remove `seedDemoTickets` in `js/app.js` before launch.

## Pages
| Page | File |
|---|---|
| Home (scrolling theme gradient) | index.html |
| Events (featured + filters) / event detail | events.html, event.html?id= |
| Merch (filters) / product detail | merch.html, product.html?id= |
| Cart, Checkout (guest, M-Pesa), Order + QR | cart.html, checkout.html, order.html?id= |
| Contact, FAQs | contact.html, faq.html |
| My Profile, My Tickets | profile.html, tickets.html |

## Where things live
- `js/data.js`: events, products, delivery fees, contact details and social links. **Edit your real details here.** Set `image` on any event or product to show a real poster or photo.
- `js/app.js`: header, footer, search, login/sign-up modal, cart, orders.
- `css/styles.css`: theme tokens at the top (`--pink`, `--purple`, …).

## Still to connect (search for `// BACKEND:`)
1. **Auth**: currently localStorage. Needs a real API with hashed passwords and password reset.
2. **M-Pesa STK push**: `stkPush()` in `checkout.html` is simulated. It should call Safaricom Daraja STK Push from the server, then confirm via the callback.
3. **Ticket emails**: after payment is confirmed, the server issues the ticket codes and emails the QR codes.
4. Contact form and newsletter submissions.
