CREATE TABLE ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  office_id TEXT NOT NULL CHECK (length(office_id) BETWEEN 1 AND 64),
  satisfaction_level INTEGER NOT NULL CHECK (satisfaction_level BETWEEN 1 AND 5),
  digital_agents_fixed INTEGER NOT NULL CHECK (digital_agents_fixed IN (0, 1)),
  other_public_offices_fixed INTEGER NOT NULL CHECK (other_public_offices_fixed IN (0, 1)),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 500),
  ip_hash TEXT NOT NULL
);

CREATE INDEX ratings_office_created_idx ON ratings (office_id, created_at);
