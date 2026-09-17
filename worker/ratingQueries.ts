export const CLAIM_IP_HASH_SQL = "INSERT INTO rating_ip_hashes (ip_hash) VALUES (?) ON CONFLICT (ip_hash) DO NOTHING";
export const INSERT_RATING_SQL = "INSERT INTO ratings (office_id, satisfaction_level, comment, digital_agents_fixed, other_public_offices_fixed) SELECT ?, ?, ?, ?, ? WHERE changes() = 1";
