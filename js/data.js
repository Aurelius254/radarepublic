/* =========================================================
   RADA REPUBLIC — catalogue (sample data)
   Replace with API calls when the backend is ready.
   `image` is optional: set it to a URL/path and the real
   poster/photo is shown instead of the generated art.
   ========================================================= */
window.RR_DATA = {
  events: [
    {
      id: "e1", title: "Rada Nights: Neon Edition", category: "Nightlife", featured: true,
      date: "2026-11-21T20:00:00+03:00", venue: "Eldoret Sports Club", city: "Eldoret",
      a: "#ff2e93", b: "#b44dff", image: "",
      lineup: ["DJ Kace", "Nina Wavy", "MC Rada", "Selector Juma"],
      desc: "Our signature night goes full neon. Glow paint at the door, three rooms of Afrobeats, Amapiano and Gengetone, and a midnight laser show you will be talking about until Christmas.",
      tiers: [
        { name: "Early Bird", price: 800, soldOut: true },
        { name: "Regular", price: 1200 },
        { name: "VIP", price: 3000, note: "Fast-track entry + VIP deck" },
        { name: "VVIP Table (6 pax)", price: 20000, note: "Table, 2 bottles, host service" }
      ]
    },
    {
      id: "e2", title: "Afro-House Sunset Sessions", category: "Music",
      date: "2026-11-28T15:00:00+03:00", venue: "ASK Showground", city: "Eldoret",
      a: "#ff7a45", b: "#b44dff", image: "",
      lineup: ["Kasiva Sounds", "Deep East Collective", "Lola B"],
      desc: "Golden hour, deep grooves. An open-air Afro-House day party that runs from sunset till late, with food trucks and a chill-out garden.",
      tiers: [{ name: "Regular", price: 1500 }, { name: "VIP", price: 3500, note: "Shaded lounge + private bar" }]
    },
    {
      id: "e3", title: "Laugh Republic: Comedy Special", category: "Comedy",
      date: "2026-12-05T19:00:00+03:00", venue: "Eldoret Town Hall", city: "Eldoret",
      a: "#b44dff", b: "#4d6bff", image: "",
      lineup: ["Headliner TBA", "Wanjiru K", "The Rada Roast Crew"],
      desc: "Two hours of stand-up from the funniest voices in the city, plus a live roast segment where nobody is safe.",
      tiers: [{ name: "Regular", price: 800 }, { name: "Front Row", price: 2000 }]
    },
    {
      id: "e4", title: "Street Food & Vinyl Fest", category: "Festival",
      date: "2026-12-12T11:00:00+03:00", venue: "Rupa's Mall Grounds", city: "Eldoret",
      a: "#ff2e93", b: "#ffb02e", image: "",
      lineup: ["Vinyl Kenya DJs", "40+ food vendors", "Live bands"],
      desc: "Dig through crates, eat your way across the city and dance in the grass. Family friendly until 6pm, adults-only after dark.",
      tiers: [{ name: "Day Pass", price: 500 }, { name: "Day + Night", price: 1500 }]
    },
    {
      id: "e5", title: "Kerio View Sunset Rave", category: "Festival",
      date: "2026-12-27T14:00:00+03:00", venue: "Kerio View, Iten", city: "Iten",
      a: "#2ec5ff", b: "#ff2e93", image: "",
      lineup: ["Valley Sound Collective", "DJ Mama Tee", "Rift Riddim Crew"],
      desc: "Dance on the edge of the Kerio Valley from sunset till late. A short ride from Eldoret, with the best view in the Rift.",
      tiers: [{ name: "Regular", price: 2000 }, { name: "VIP", price: 5000, note: "Cabana access" }]
    },
    {
      id: "e6", title: "Rada Republic NYE Takeover", category: "Nightlife",
      date: "2026-12-31T19:00:00+03:00", venue: "Kipchoge Keino Stadium", city: "Eldoret",
      a: "#b44dff", b: "#ff2e93", image: "",
      lineup: ["Headliner announced Dec 1", "DJ Kace", "Nina Wavy"],
      desc: "Count down to 2027 with the Republic. Fireworks at midnight, two stages and the loudest crowd in Eldoret.",
      tiers: [{ name: "Regular", price: 3000 }, { name: "VIP", price: 7500 }, { name: "VVIP Table (10 pax)", price: 50000 }]
    },
    {
      id: "e7", title: "Amapiano vs Gengetone", category: "Music",
      date: "2027-01-17T18:00:00+03:00", venue: "64 Stadium", city: "Eldoret",
      a: "#ff2e93", b: "#7b2cff", image: "",
      lineup: ["Battle of the DJs", "Live MCs"],
      desc: "Two sounds, one stage, one winner, and the crowd decides. A DJ battle night unlike any other.",
      tiers: [{ name: "Regular", price: 1000 }, { name: "VIP", price: 2500 }]
    },
    {
      id: "e8", title: "Rada Cup 5-a-Side", category: "Sports",
      date: "2027-01-24T09:00:00+03:00", venue: "Kipchoge Keino Stadium Annex", city: "Eldoret",
      a: "#31d67b", b: "#b44dff", image: "",
      lineup: ["16 teams", "DJ sets between matches"],
      desc: "Street football tournament with a KES 200,000 prize pool. Come for the matches, stay for the after-party.",
      tiers: [{ name: "Spectator", price: 300 }, { name: "Team Entry (7 players)", price: 7000 }]
    }
  ],

  products: [
    { id: "p1", name: "Crown Seal Tee", category: "T-Shirts", price: 1800, shape: "tee", a: "#ff2e93", b: "#7b2cff", badge: "Bestseller",
      sizes: ["S", "M", "L", "XL", "XXL"], colors: ["Black"], desc: "Heavyweight 220gsm cotton tee with the gold RR crown seal on the chest and 'Rada Republic' across the back." },
    { id: "p2", name: "Neon Republic Hoodie", category: "Hoodies", price: 4500, shape: "hoodie", a: "#b44dff", b: "#ff2e93", badge: "New",
      sizes: ["S", "M", "L", "XL", "XXL"], colors: ["Black"], desc: "Brushed fleece oversized hoodie with puff-print neon logo. Built for 4am walks home." },
    { id: "p3", name: "RR Dad Cap", category: "Caps", price: 1500, shape: "cap", a: "#ff2e93", b: "#ffb02e",
      sizes: ["One size"], colors: ["Black"], desc: "Washed cotton dad cap with embroidered RR monogram and adjustable strap." },
    { id: "p4", name: "Republic Tote", category: "Accessories", price: 1200, shape: "bag", a: "#b44dff", b: "#2ec5ff",
      sizes: ["One size"], colors: ["Black"], desc: "Canvas tote big enough for your vinyl haul. Screen-printed both sides." },
    { id: "p5", name: "Gold Seal Long Sleeve", category: "T-Shirts", price: 2500, shape: "tee", a: "#ffb02e", b: "#ff2e93",
      sizes: ["S", "M", "L", "XL"], colors: ["Black"], desc: "Long sleeve tee with metallic gold seal print and sleeve hits." },
    { id: "p6", name: "Festival Wristband Pack", category: "Accessories", price: 500, shape: "band", a: "#ff2e93", b: "#b44dff",
      sizes: ["One size"], colors: ["Mixed"], desc: "Pack of 3 woven fabric wristbands in pink, purple and black." },
    { id: "p7", name: "Night Shift Bucket Hat", category: "Caps", price: 1800, shape: "bucket", a: "#7b2cff", b: "#ff2e93", badge: "Limited",
      sizes: ["S/M", "L/XL"], colors: ["Black"], desc: "Reversible bucket hat, black on one side and neon purple on the other." },
    { id: "p8", name: "Republic Joggers", category: "Bottoms", price: 3500, shape: "pants", a: "#b44dff", b: "#ff2e93",
      sizes: ["S", "M", "L", "XL"], colors: ["Black"], desc: "Tapered fleece joggers with a side-leg wordmark and zip pockets." }
  ],

  /* Delivery zones for merch (fees are placeholders, confirm with the business) */
  delivery: [
    { id: "eld", name: "Eldoret & environs", fee: 200 },
    { id: "major", name: "Nairobi, Mombasa, Kisumu, Nakuru", fee: 400 },
    { id: "rest", name: "Rest of Kenya", fee: 500 }
  ],

  /* Homepage badge text (editable in the admin panel) */
  heroBadge: "Now selling · Eldoret & beyond",

  /* FAQ page (sample answers: review against your real policies) */
  faq: [
    { id: "tickets", title: "Tickets", items: [
      { q: "Do I need an account to buy tickets?", a: "No. You can check out as a guest with just your name, email and M-Pesa number. Your QR ticket is emailed to you. Create an account with the same email later and your tickets will appear in My Tickets." },
      { q: "Where do I find my ticket?", a: "Right after payment your QR ticket is shown on screen and sent to the email you entered. If you have an account, it's also under My Tickets." },
      { q: "How do I get into the event?", a: "Show the QR code at the gate, either on your phone or printed. Each ticket is scanned once, so don't share your QR code." },
      { q: "I didn't receive my ticket email.", a: "Check your spam or promotions folder first. If it's not there, contact us with your M-Pesa confirmation code and we'll resend it." }
    ] },
    { id: "payments", title: "Payments", items: [
      { q: "How do I pay?", a: "We use M-Pesa. Enter your M-Pesa number at checkout and you'll get a prompt on your phone. Enter your PIN to confirm, and that's it." },
      { q: "I didn't get the M-Pesa prompt.", a: "Make sure your phone is on, unlocked and has network, and that the number is correct. Then try again. If money left your account but no ticket arrived, contact us with the M-Pesa code." },
      { q: "Is my payment secure?", a: "Yes. Payment happens on your phone through M-Pesa and we never see your PIN." }
    ] },
    { id: "merch", title: "Merch & delivery", items: [
      { q: "Where do you deliver?", a: "Anywhere in Kenya. Delivery fees are shown at checkout based on your area." },
      { q: "How long does delivery take?", a: "Usually 1â€“3 days. We'll call the number you gave us to arrange the drop-off." },
      { q: "What if my size doesn't fit?", a: "Contact us within a few days of delivery and we'll help you exchange it, subject to stock." }
    ] },
    { id: "refunds", title: "Refunds", items: [
      { q: "Can I get a refund on a ticket?", a: "Tickets are generally non-refundable. If an event is cancelled, you'll be refunded to the M-Pesa number you paid with. If it's postponed, your ticket stays valid for the new date." },
      { q: "How do I request a refund?", a: "Contact us with your order number (it starts with RR-) and your M-Pesa confirmation code." }
    ] },
    { id: "partners", title: "Partners", items: [
      { q: "How do I become a partner?", a: "Whether you're a brand, sponsor or event organiser, reach out through the contact page and choose \"Partnership\". Our team will get back to you." }
    ] }
  ],

  /* Business details used in the footer & contact page (placeholders, confirm these) */
  contact: {
    email: "hello@radarepublic.co.ke",
    phone: "+254 700 000 000",
    whatsapp: "+254 700 000 000",
    location: "Eldoret, Kenya",
    hours: "Mon–Sat, 9am – 6pm",
    socials: {
      instagram: "https://instagram.com/radarepublic",
      tiktok: "https://tiktok.com/@radarepublic",
      x: "https://x.com/radarepublic",
      facebook: "https://facebook.com/radarepublic",
      youtube: "https://youtube.com/@radarepublic"
    }
  }
};
