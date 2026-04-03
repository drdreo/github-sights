-- 018: Add aggregation watermark to owner_snapshot
--
-- Tracks when the last successful aggregation completed.
-- Used by the incremental aggregation pipeline to only process
-- events ingested after the watermark.

ALTER TABLE owner_snapshot ADD COLUMN IF NOT EXISTS last_aggregated_at TIMESTAMPTZ;
