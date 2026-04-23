# PawClean City NGO App

A hostable charity app for an NGO that supports stray dogs, stray cats, city cleanliness, and waste management.

## Run Locally

```bash
npm start
```

Then open `http://localhost:3000`.

The Node server stores donations, field reports, and volunteer signups in PostgreSQL when `DATABASE_URL` is configured. Without `DATABASE_URL`, it falls back to `data/db.json`. If you open `index.html` directly as a file, the app still works in local-demo mode with browser `localStorage`.

## PostgreSQL Setup

Create a database in your local PostgreSQL installation:

```sql
CREATE DATABASE pawclean_city;
```

Copy `.env.example` to `.env`, then set your local PostgreSQL password:

```bash
PORT=3000
DATABASE_URL=postgres://postgres:your_password@localhost:5432/pawclean_city
DATABASE_SSL=false
```

Start the app:

```bash
npm start
```

The app creates the required tables automatically on startup.

## Admin Dashboard

The app now includes a restricted admin dashboard at `/admin`.

Add these values in `.env`:

```bash
ADMIN_EMAIL=admin@pawclean.city
ADMIN_PASSWORD=choose_a_strong_password
ADMIN_SESSION_SECRET=choose_a_long_random_secret
```

Then open:

```text
http://localhost:3000/admin
```

If you do not set `ADMIN_PASSWORD`, the app falls back to a local default for development only. Change it before deploying.

## Real Payment Setup

Copy `.env.example` to `.env` and add real Razorpay credentials:

```bash
PORT=3000
DATA_DIR=./data
DATABASE_URL=postgres://postgres:your_password@localhost:5432/pawclean_city
DATABASE_SSL=false
RAZORPAY_KEY_ID=rzp_live_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

With Razorpay keys configured, the donation form creates a Razorpay order, opens Razorpay Checkout, verifies the payment signature on the server, and marks the donation as paid. Without Razorpay keys, donations are saved as pledges.

Do not collect card, bank, UPI PIN, or wallet credentials directly in this app. Let Razorpay Checkout handle sensitive payment details.

## Hosting

For public launch, host this as a Node app on Render, Railway, Fly.io, DigitalOcean, or another server that can run `npm start`. Static-only hosting such as GitHub Pages will show the UI, but it will not provide the database or payment verification backend.

On Render, the better production path is a Render PostgreSQL database. Add its `DATABASE_URL` to the web service environment variables and set `DATABASE_SSL=true` if Render gives you an external database URL that requires SSL.

If you are not using PostgreSQL on Render yet, add a persistent disk and set `DATA_DIR=/var/data` so JSON records survive redeploys. If you do not add the disk yet, remove `DATA_DIR` from Render and the app will still run, but records can disappear after redeploys.

## Files

- `index.html` - app layout and forms
- `admin.html` - restricted admin dashboard
- `styles.css` - responsive visual design
- `script.js` - public site frontend logic
- `admin.js` - admin dashboard logic
- `server.js` - Node backend, JSON database, Razorpay order and verification routes
- `.env.example` - payment configuration template
- `assets/hero-community-care.png` - generated hero image for the NGO
