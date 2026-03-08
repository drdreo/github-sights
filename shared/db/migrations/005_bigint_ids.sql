-- Migration 005: INTEGER → BIGINT for GitHub-sourced IDs
-- GitHub PR IDs have exceeded 2^31 (~2.1B), causing insert failures.
-- Repository IDs (~900M) will hit the same limit eventually.
-- This migration widens all GitHub-sourced ID columns and their FK references.

-- ── Primary keys ────────────────────────────────────────────────────────────────

ALTER TABLE repository_meta
    ALTER COLUMN id SET DATA TYPE BIGINT;

ALTER TABLE pr_event
    ALTER COLUMN id SET DATA TYPE BIGINT;

-- ── Foreign keys referencing repository_meta(id) ────────────────────────────────

ALTER TABLE commit_event
    ALTER COLUMN repo_id SET DATA TYPE BIGINT;

ALTER TABLE pr_event
    ALTER COLUMN repo_id SET DATA TYPE BIGINT;

ALTER TABLE workflow_event
    ALTER COLUMN repo_id SET DATA TYPE BIGINT;

ALTER TABLE repo_snapshot
    ALTER COLUMN repo_id SET DATA TYPE BIGINT;

ALTER TABLE daily_activity
    ALTER COLUMN repo_id SET DATA TYPE BIGINT;

ALTER TABLE sync_state
    ALTER COLUMN repo_id SET DATA TYPE BIGINT;
