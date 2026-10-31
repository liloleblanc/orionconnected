-- D1 schema for grocery-planner. Apply with: npm run db:init

-- Prices reported by users (shelf tags, receipts). The durable, permission-free feeder.
CREATE TABLE IF NOT EXISTS observations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL,            -- ISO 8601
  fsa         TEXT    NOT NULL,            -- first three characters of the postal code, e.g. E1C
  merchant    TEXT    NOT NULL,            -- display name, e.g. Sobeys
  store_label TEXT,                        -- free text, e.g. "Sobeys Vaughan Harvey"
  item_text   TEXT    NOT NULL,            -- what the user typed, e.g. "2% milk 4L"
  item_key    TEXT,                        -- catalog key when recognised, e.g. milk
  barcode     TEXT,
  price       REAL    NOT NULL,
  quantity    REAL,                        -- size number, e.g. 4
  unit        TEXT,                        -- kg g lb l ml ea
  flags       TEXT,                        -- comma separated: member, plus_tax, sale
  reporter    TEXT,                        -- opaque id or nickname, never an email
  source      TEXT    NOT NULL DEFAULT 'community'
);
CREATE INDEX IF NOT EXISTS observations_fsa_created ON observations (fsa, created_at);

-- Weekly snapshot of what the feeders returned, kept for "buy now or wait" history.
CREATE TABLE IF NOT EXISTS offer_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fetched_at  TEXT NOT NULL,
  fsa         TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  source      TEXT NOT NULL,
  merchant    TEXT NOT NULL,
  name        TEXT NOT NULL,
  price       REAL,
  base_price  REAL,                        -- per kg, per litre or per unit when known
  base_unit   TEXT,
  valid_from  TEXT,
  valid_to    TEXT
);
CREATE INDEX IF NOT EXISTS offer_history_lookup ON offer_history (fsa, item_key, fetched_at);

-- Regions that were queried recently; the weekly cron refreshes these.
CREATE TABLE IF NOT EXISTS regions (
  fsa         TEXT PRIMARY KEY,
  postal      TEXT NOT NULL,               -- one full postal code to query the feeders with
  last_used   TEXT NOT NULL
);
