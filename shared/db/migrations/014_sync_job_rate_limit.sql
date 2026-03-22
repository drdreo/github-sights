-- Track when a sync job is paused due to GitHub API rate limiting.
-- Surfaced to the UI so users know why progress has stalled.
ALTER TABLE sync_job ADD COLUMN IF NOT EXISTS rate_limit_reset_at TIMESTAMPTZ;
