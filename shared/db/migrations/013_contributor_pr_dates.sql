-- Add first/last PR dates to contributor_snapshot so the detail page can
-- show when a contributor's PR history starts and ends (independently of
-- their commit history).

ALTER TABLE contributor_snapshot ADD COLUMN IF NOT EXISTS first_pr_at TIMESTAMPTZ;
ALTER TABLE contributor_snapshot ADD COLUMN IF NOT EXISTS last_pr_at TIMESTAMPTZ;
