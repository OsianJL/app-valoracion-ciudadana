-- Keep the duplicate-control identifier apart from survey responses. The
-- earliest associated response date is the best available creation timestamp
-- for hashes collected before this migration.
CREATE TABLE rating_ip_hashes (
  ip_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO rating_ip_hashes (ip_hash, created_at)
SELECT ip_hash, MIN(created_at)
FROM ratings
GROUP BY ip_hash;

-- SQLite cannot remove the column while retaining complete control over the
-- resulting schema and indexes, so rebuild ratings and copy every response.
CREATE TABLE ratings_without_ip_hash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  office_id TEXT NOT NULL CHECK (length(office_id) BETWEEN 1 AND 64),
  satisfaction_level INTEGER NOT NULL CHECK (satisfaction_level BETWEEN 1 AND 5),
  digital_agents_fixed INTEGER NOT NULL CHECK (digital_agents_fixed IN (0, 1)),
  other_public_offices_fixed INTEGER NOT NULL CHECK (other_public_offices_fixed IN (0, 1)),
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 500)
);

INSERT INTO ratings_without_ip_hash (
  id, created_at, office_id, satisfaction_level,
  digital_agents_fixed, other_public_offices_fixed, comment
)
SELECT
  id, created_at, office_id, satisfaction_level,
  digital_agents_fixed, other_public_offices_fixed, comment
FROM ratings;

DROP TABLE ratings;
ALTER TABLE ratings_without_ip_hash RENAME TO ratings;
CREATE INDEX ratings_office_created_idx ON ratings (office_id, created_at);
