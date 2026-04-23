const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const ROOT = __dirname;

loadEnv();

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_DATA_DIR = path.join(ROOT, "data");
let activeDataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR;
let dbFile = path.join(activeDataDir, "db.json");
let pool = null;

const CONFIGURED_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@pawclean.city").toLowerCase();
const CONFIGURED_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || `${CONFIGURED_ADMIN_PASSWORD || "local-dev-admin"}:pawclean-city`;

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

async function ensureJsonDb() {
  try {
    await fs.mkdir(activeDataDir, { recursive: true });
  } catch (error) {
    if (process.env.DATA_DIR && activeDataDir !== DEFAULT_DATA_DIR) {
      console.warn(`DATA_DIR "${activeDataDir}" is not writable. Falling back to "${DEFAULT_DATA_DIR}".`);
      activeDataDir = DEFAULT_DATA_DIR;
      dbFile = path.join(activeDataDir, "db.json");
      await fs.mkdir(activeDataDir, { recursive: true });
    } else {
      throw error;
    }
  }

  try {
    await fs.access(dbFile);
  } catch {
    await fs.writeFile(dbFile, JSON.stringify(emptyDb, null, 2));
  }
}

async function readJsonDb() {
  await ensureJsonDb();
  const raw = await fs.readFile(dbFile, "utf8");
  return { ...emptyDb, ...JSON.parse(raw) };
}

async function writeJsonDb(db) {
  await fs.writeFile(dbFile, JSON.stringify(db, null, 2));
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    await ensureJsonDb();
    return "json";
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      donor TEXT NOT NULL,
      amount INTEGER NOT NULL,
      program TEXT NOT NULL,
      contact TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pledged',
      payment_order_id TEXT,
      payment_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      location TEXT NOT NULL,
      urgency TEXT NOT NULL DEFAULT 'Normal',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS volunteers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      area TEXT NOT NULL,
      skill TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  return "postgres";
}

async function readDb() {
  if (!pool) return readJsonDb();

  const [donations, reports, volunteers] = await Promise.all([
    pool.query(`
      SELECT
        id, donor, amount, program, contact, status,
        payment_order_id AS "paymentOrderId",
        payment_id AS "paymentId",
        created_at AS "createdAt",
        paid_at AS "paidAt"
      FROM donations
      ORDER BY created_at DESC
    `),
    pool.query(`
      SELECT id, type, location, urgency, notes, status, created_at AS "createdAt"
      FROM reports
      ORDER BY created_at DESC
    `),
    pool.query(`
      SELECT id, name, area, skill, created_at AS "createdAt"
      FROM volunteers
      ORDER BY created_at DESC
    `),
  ]);

  return {
    donations: donations.rows,
    reports: reports.rows,
    volunteers: volunteers.rows,
  };
}

async function saveDonation(donation) {
  if (!pool) {
    const db = await readJsonDb();
    db.donations.unshift(donation);
    await writeJsonDb(db);
    return donation;
  }

  const result = await pool.query(
    `
      INSERT INTO donations (
        id, donor, amount, program, contact, status, payment_order_id, payment_id, created_at, paid_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        id, donor, amount, program, contact, status,
        payment_order_id AS "paymentOrderId",
        payment_id AS "paymentId",
        created_at AS "createdAt",
        paid_at AS "paidAt"
    `,
    [
      donation.id,
      donation.donor,
      donation.amount,
      donation.program,
      donation.contact,
      donation.status,
      donation.paymentOrderId || null,
      donation.paymentId || null,
      donation.createdAt,
      donation.paidAt || null,
    ],
  );
  return result.rows[0];
}

async function saveReport(report) {
  if (!pool) {
    const db = await readJsonDb();
    db.reports.unshift(report);
    await writeJsonDb(db);
    return report;
  }

  const result = await pool.query(
    `
      INSERT INTO reports (id, type, location, urgency, notes, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, type, location, urgency, notes, status, created_at AS "createdAt"
    `,
    [report.id, report.type, report.location, report.urgency, report.notes, report.status, report.createdAt],
  );
  return result.rows[0];
}

async function saveVolunteer(volunteer) {
  if (!pool) {
    const db = await readJsonDb();
    db.volunteers.unshift(volunteer);
    await writeJsonDb(db);
    return volunteer;
  }

  const result = await pool.query(
    `
      INSERT INTO volunteers (id, name, area, skill, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, area, skill, created_at AS "createdAt"
    `,
    [volunteer.id, volunteer.name, volunteer.area, volunteer.skill, volunteer.createdAt],
  );
  return result.rows[0];
}

async function clearReports() {
  if (!pool) {
    const db = await readJsonDb();
    db.reports = [];
    await writeJsonDb(db);
    return;
  }

  await pool.query("DELETE FROM reports");
}

async function markDonationPaidByOrder(orderId, paymentId) {
  if (!pool) {
    const db = await readJsonDb();
    const donation = db.donations.find((item) => item.paymentOrderId === orderId);
    if (!donation) return null;
    donation.status = "paid";
    donation.paymentId = paymentId;
    donation.paidAt = new Date().toISOString();
    await writeJsonDb(db);
    return donation;
  }

  const result = await pool.query(
    `
      UPDATE donations
      SET status = 'paid', payment_id = $2, paid_at = NOW()
      WHERE payment_order_id = $1
      RETURNING
        id, donor, amount, program, contact, status,
        payment_order_id AS "paymentOrderId",
        payment_id AS "paymentId",
        created_at AS "createdAt",
        paid_at AS "paidAt"
    `,
    [orderId, paymentId],
  );
  return result.rows[0] || null;
}

async function updateReportStatus(id, status) {
  if (!pool) {
    const db = await readJsonDb();
    const report = db.reports.find((item) => item.id === id);
    if (!report) return null;
    report.status = status;
    await writeJsonDb(db);
    return report;
  }

  const result = await pool.query(
    `
      UPDATE reports
      SET status = $2
      WHERE id = $1
      RETURNING id, type, location, urgency, notes, status, created_at AS "createdAt"
    `,
    [id, status],
  );
  return result.rows[0] || null;
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
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

function signValue(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function isLocalRequest(req) {
  const host = String(req.headers.host || "").toLowerCase();
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

function getAdminCredentials(req) {
  if (CONFIGURED_ADMIN_PASSWORD) {
    return {
      enabled: true,
      email: CONFIGURED_ADMIN_EMAIL,
      password: CONFIGURED_ADMIN_PASSWORD,
      localFallback: false,
    };
  }

  if (isLocalRequest(req)) {
    return {
      enabled: true,
      email: "admin@pawclean.city",
      password: "pawclean-admin",
      localFallback: true,
    };
  }

  return {
    enabled: false,
    email: CONFIGURED_ADMIN_EMAIL,
    password: "",
    localFallback: false,
  };
}

function createAdminSession(email) {
  const issuedAt = Date.now().toString();
  const payload = Buffer.from(JSON.stringify({ email, issuedAt })).toString("base64url");
  const signature = signValue(payload);
  return `${payload}.${signature}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function getAdminSession(req) {
  const credentials = getAdminCredentials(req);
  if (!credentials.enabled) return null;

  const cookies = parseCookies(req);
  const token = cookies.pawclean_admin;
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || signValue(payload) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if ((session.email || "").toLowerCase() !== credentials.email) return null;
    return session;
  } catch {
    return null;
  }
}

function adminCookie(token) {
  return `pawclean_admin=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 12}`;
}

function clearAdminCookie() {
  return "pawclean_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

function requireAdmin(req, res) {
  const session = getAdminSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Admin login required." });
    return null;
  }
  return session;
}

function buildOverview(data) {
  const totalFunds = data.donations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const openReports = data.reports.filter((item) => item.status !== "closed").length;
  const programTotals = data.donations.reduce((acc, item) => {
    acc[item.program] = (acc[item.program] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const urgencyCounts = data.reports.reduce(
    (acc, item) => {
      const level = item.urgency || "Normal";
      acc[level] = (acc[level] || 0) + (item.status === "closed" ? 0 : 1);
      return acc;
    },
    { Emergency: 0, High: 0, Normal: 0 },
  );

  return {
    metrics: {
      totalFunds,
      donationsCount: data.donations.length,
      openReports,
      volunteersCount: data.volunteers.length,
    },
    programTotals,
    urgencyCounts,
    recent: {
      donations: data.donations.slice(0, 8),
      reports: data.reports.slice(0, 8),
      volunteers: data.volunteers.slice(0, 8),
    },
  };
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

  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
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
    // .env is optional; production hosts usually provide environment variables.
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

    const savedDonation = await saveDonation(donation);
    return sendJson(res, 201, { donation: savedDonation, payment });
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

    return sendJson(res, 201, { report: await saveReport(report) });
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

    return sendJson(res, 201, { volunteer: await saveVolunteer(volunteer) });
  }

  if (req.method === "POST" && pathname === "/api/payments/razorpay/verify") {
    const body = await readBody(req);
    const orderId = cleanString(body.razorpay_order_id, 120);
    const paymentId = cleanString(body.razorpay_payment_id, 120);
    const signature = cleanString(body.razorpay_signature, 200);

    if (!orderId || !paymentId || !signature || !verifyRazorpaySignature({ orderId, paymentId, signature })) {
      return sendJson(res, 400, { error: "Payment verification failed." });
    }

    const donation = await markDonationPaidByOrder(orderId, paymentId);
    if (!donation) {
      return sendJson(res, 404, { error: "Donation order not found." });
    }

    return sendJson(res, 200, { donation });
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const body = await readBody(req);
    const credentials = getAdminCredentials(req);
    if (!credentials.enabled) {
      return sendJson(res, 503, { error: "Admin login is disabled until ADMIN_PASSWORD is configured." });
    }

    const email = cleanString(body.email, 160).toLowerCase();
    const password = String(body.password || "");

    if (email !== credentials.email || password !== credentials.password) {
      return sendJson(res, 401, { error: "Incorrect admin email or password." });
    }

    return sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": adminCookie(createAdminSession(email)),
      },
    );
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    return sendJson(
      res,
      200,
      { ok: true },
      {
        "Set-Cookie": clearAdminCookie(),
      },
    );
  }

  if (req.method === "GET" && pathname === "/api/admin/session") {
    return sendJson(res, 200, { authenticated: Boolean(getAdminSession(req)) });
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!requireAdmin(req, res)) return;

    if (req.method === "GET" && pathname === "/api/admin/overview") {
      const data = await readDb();
      return sendJson(res, 200, buildOverview(data));
    }

    if (req.method === "DELETE" && pathname === "/api/reports") {
      await clearReports();
      return sendJson(res, 200, { ok: true });
    }

    const reportMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
    if (req.method === "PATCH" && reportMatch) {
      const body = await readBody(req);
      const status = cleanString(body.status, 20);
      if (!["open", "closed"].includes(status)) {
        return sendJson(res, 400, { error: "Status must be open or closed." });
      }

      const report = await updateReportStatus(reportMatch[1], status);
      if (!report) return sendJson(res, 404, { error: "Report not found." });
      return sendJson(res, 200, { report });
    }

    return sendJson(res, 404, { error: "Not found" });
  }

  if (req.method === "DELETE" && pathname === "/api/reports") {
    return sendJson(res, 401, { error: "Admin login required to clear reports." });
  }

  return sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(req, res, pathname) {
  const targetPath = pathname === "/admin" ? "/admin.html" : pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const requested = path.normalize(path.join(ROOT, targetPath));

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

initDb().then((mode) => {
  server.listen(PORT, () => {
    console.log(`PawClean City running at http://localhost:${PORT}`);
    console.log(mode === "postgres" ? "Database: PostgreSQL" : `Data directory: ${activeDataDir}`);
    if (!CONFIGURED_ADMIN_PASSWORD) {
      console.log("Admin login uses local dev credentials only on localhost: admin@pawclean.city / pawclean-admin");
      console.log("Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET before deploying the admin dashboard publicly.");
    }
  });
});
