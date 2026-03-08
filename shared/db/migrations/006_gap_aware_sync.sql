-- Gap-aware sync: track how far back we've fetched and persist the user's desired start date.

ALTER TABLE owner_config ADD COLUMN IF NOT EXISTS sync_since TIMESTAMPTZ;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS earliest_synced_at TIMESTAMPTZ;
