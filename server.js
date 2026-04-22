const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

loadEnv();

const PORT = Number(process.env.PORT || 3000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const emptyDb = {
  donations: [],
  reports: [],
  volunteers: [],
};

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify(emptyDb, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, "utf8");
  return { ...emptyDb, ...JSON.parse(raw) };
}

async function writeDb(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function cleanString(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

async function createRazorpayOrder(donation) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return { provider: "manual", message: "Razorpay credentials are not configured." };
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: donation.amount * 100,
      currency: "INR",
      receipt: donation.id,
      notes: {
        donor: donation.donor,
        program: donation.program,
        contact: donation.contact,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.description || "Razorpay order creation failed");
  }

  return {
    provider: "razorpay",
    orderId: data.id,
    keyId,
    amount: data.amount,
    currency: data.currency,
  };
}

function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(String(signature || ""));
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function loadEnv() {
  try {
    const raw = fsSync.readFileSync(path.join(ROOT, ".env"), "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch {
    // .env is optional; production hosts usually provide real environment variables.
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/summary") {
    return sendJson(res, 200, await readDb());
  }

  if (req.method === "POST" && pathname === "/api/donations") {
    const body = await readBody(req);
    const amount = Number(body.amount);
    const donor = cleanString(body.donor, 120);
    const program = cleanString(body.program, 80);
    const contact = cleanString(body.contact, 160);

    if (!donor || !Number.isFinite(amount) || amount < 50) {
      return sendJson(res, 400, { error: "Please enter a donor name and an amount of at least Rs 50." });
    }

    const db = await readDb();
    const donation = {
      id: newId("don"),
      donor,
      amount: Math.round(amount),
      program,
      contact,
      status: "pledged",
      createdAt: new Date().toISOString(),
    };

    const payment = await createRazorpayOrder(donation);
    if (payment.provider === "razorpay") {
      donation.status = "payment_order_created";
      donation.paymentOrderId = payment.orderId;
    }

    db.donations.unshift(donation);
    await writeDb(db);
    return sendJson(res, 201, { donation, payment });
  }

  if (req.method === "POST" && pathname === "/api/reports") {
    const body = await readBody(req);
    const report = {
      id: newId("rep"),
      type: cleanString(body.type, 80),
      location: cleanString(body.location, 160),
      urgency: cleanString(body.urgency, 40) || "Normal",
      notes: cleanString(body.notes, 700),
      status: "open",
      createdAt: new Date().toISOString(),
    };

    if (!report.type || !report.location) {
      return sendJson(res, 400, { error: "Report type and location are required." });
    }

    const db = await readDb();
    db.reports.unshift(report);
    await writeDb(db);
    return sendJson(res, 201, { report });
  }

  if (req.method === "POST" && pathname === "/api/payments/razorpay/verify") {
    const body = await readBody(req);
    const orderId = cleanString(body.razorpay_order_id, 120);
    const paymentId = cleanString(body.razorpay_payment_id, 120);
    const signature = cleanString(body.razorpay_signature, 200);

    if (!orderId || !paymentId || !signature || !verifyRazorpaySignature({ orderId, paymentId, signature })) {
      return sendJson(res, 400, { error: "Payment verification failed." });
    }

    const db = await readDb();
    const donation = db.donations.find((item) => item.paymentOrderId === orderId);
    if (!donation) {
      return sendJson(res, 404, { error: "Donation order not found." });
    }

    donation.status = "paid";
    donation.paymentId = paymentId;
    donation.paidAt = new Date().toISOString();
    await writeDb(db);
    return sendJson(res, 200, { donation });
  }

  if (req.method === "DELETE" && pathname === "/api/reports") {
    const db = await readDb();
    db.reports = [];
    await writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname === "/api/volunteers") {
    const body = await readBody(req);
    const volunteer = {
      id: newId("vol"),
      name: cleanString(body.name, 120),
      area: cleanString(body.area, 120),
      skill: cleanString(body.skill, 80),
      createdAt: new Date().toISOString(),
    };

    if (!volunteer.name || !volunteer.area || !volunteer.skill) {
      return sendJson(res, 400, { error: "Volunteer name, area, and skill are required." });
    }

    const db = await readDb();
    db.volunteers.unshift(volunteer);
    await writeDb(db);
    return sendJson(res, 201, { volunteer });
  }

  return sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const requested = path.normalize(path.join(ROOT, safePath));

  if (!requested.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const file = await fs.readFile(requested);
    const ext = path.extname(requested).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`PawClean City running at http://localhost:${PORT}`);
  });
});
