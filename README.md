# PawClean City NGO App

A hostable charity app for an NGO that supports stray dogs, stray cats, city cleanliness, and waste management.

## Run Locally

```bash
npm start
```

Then open `http://localhost:3000`.

The Node server stores donations, field reports, and volunteer signups in `data/db.json`. If you open `index.html` directly as a file, the app still works in local-demo mode with browser `localStorage`.

## Real Payment Setup

Copy `.env.example` to `.env` and add real Razorpay credentials:

```bash
PORT=3000
DATA_DIR=./data
RAZORPAY_KEY_ID=rzp_live_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

With keys configured, the donation form creates a Razorpay order, opens Razorpay Checkout, verifies the payment signature on the server, and marks the donation as paid.

Do not collect card, bank, UPI PIN, or wallet credentials directly in this app. Let Razorpay Checkout handle sensitive payment details.

## Hosting

For public launch, host this as a Node app on Render, Railway, Fly.io, DigitalOcean, or another server that can run `npm start`. Static-only hosting such as GitHub Pages will show the UI, but it will not provide the database or payment verification backend.

On Render, add a persistent disk and set `DATA_DIR=/var/data` so donation/report/volunteer records survive redeploys.

## Files

- `index.html` - app layout and forms
- `styles.css` - responsive visual design
- `script.js` - API-aware frontend logic
- `server.js` - Node backend, JSON database, Razorpay order and verification routes
- `.env.example` - payment configuration template
- `assets/hero-community-care.png` - generated hero image for the NGO
