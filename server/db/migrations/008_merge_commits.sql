-- Track merge commits so LoC aggregation can exclude them (they duplicate LoC
-- from the merged branch).

ALTER TABLE commit_event ADD COLUMN IF NOT EXISTS is_merge BOOLEAN NOT NULL DEFAULT false;
