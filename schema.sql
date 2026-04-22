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
