-- Migration 003: Snapshots, Daily Activity, and Sync State
-- Pre-aggregated materialized views rebuilt after each sync.

-- ── Owner Snapshot ───────────────────────────────────────────────────────────────
-- Powers the Dashboard stat cards. One row per owner (all-time).

CREATE TABLE IF NOT EXISTS owner_snapshot (
    owner_login             TEXT PRIMARY KEY REFERENCES owner(login) ON DELETE CASCADE,
    -- stats
    total_repos             INTEGER NOT NULL DEFAULT 0,
    total_commits           INTEGER NOT NULL DEFAULT 0,
    total_prs               INTEGER NOT NULL DEFAULT 0,
    open_prs                INTEGER NOT NULL DEFAULT 0,
    merged_prs              INTEGER NOT NULL DEFAULT 0,
    total_additions         BIGINT  NOT NULL DEFAULT 0,
    total_deletions         BIGINT  NOT NULL DEFAULT 0,
    unique_contributors     INTEGER NOT NULL DEFAULT 0,
    most_active_repo_name   TEXT,
    most_active_repo_commits INTEGER NOT NULL DEFAULT 0,
    longest_streak          INTEGER NOT NULL DEFAULT 0,
    current_streak          INTEGER NOT NULL DEFAULT 0,
    avg_commits_per_day     REAL    NOT NULL DEFAULT 0,
    -- embedded arrays (JSONB)
    top_contributors        JSONB   NOT NULL DEFAULT '[]'::JSONB,
    language_breakdown      JSONB   NOT NULL DEFAULT '[]'::JSONB,
    -- workflow summary
    total_workflow_runs     INTEGER NOT NULL DEFAULT 0,
    workflow_success_rate   REAL    NOT NULL DEFAULT 0,
    avg_workflow_duration   REAL    NOT NULL DEFAULT 0,
    -- metadata
    computed_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── Repo Snapshot ────────────────────────────────────────────────────────────────
-- Powers Repo detail page + Repositories listing.

CREATE TABLE IF NOT EXISTS repo_snapshot (
    repo_id                 INTEGER PRIMARY KEY REFERENCES repository_meta(id) ON DELETE CASCADE,
    owner_login             TEXT NOT NULL,
    -- denormalized repo metadata (for fast reads without JOINing repository_meta)
    name                    TEXT NOT NULL,
    description             TEXT,
    language                TEXT,
    stargazers_count        INTEGER NOT NULL DEFAULT 0,
    forks_count             INTEGER NOT NULL DEFAULT 0,
    open_issues_count       INTEGER NOT NULL DEFAULT 0,
    updated_at              TIMESTAMPTZ,
    pushed_at               TIMESTAMPTZ,
    -- computed stats
    total_commits           INTEGER NOT NULL DEFAULT 0,
    total_prs               INTEGER NOT NULL DEFAULT 0,
    open_prs                INTEGER NOT NULL DEFAULT 0,
    merged_prs              INTEGER NOT NULL DEFAULT 0,
    total_additions         BIGINT  NOT NULL DEFAULT 0,
    total_deletions         BIGINT  NOT NULL DEFAULT 0,
    contributor_count       INTEGER NOT NULL DEFAULT 0,
    -- workflow health
    ci_success_rate         REAL    NOT NULL DEFAULT 0,
    ci_avg_duration_seconds REAL    NOT NULL DEFAULT 0,
    last_ci_conclusion      TEXT,
    -- embedded JSONB
    top_contributors        JSONB   NOT NULL DEFAULT '[]'::JSONB,
    -- metadata
    computed_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repo_snapshot_owner
    ON repo_snapshot(owner_login);

-- ── Contributor Snapshot ─────────────────────────────────────────────────────────
-- Powers Contributors page. One row per (owner, contributor) pair.

CREATE TABLE IF NOT EXISTS contributor_snapshot (
    owner_login             TEXT NOT NULL,
    contributor_login       TEXT NOT NULL,
    avatar_url              TEXT,
    html_url                TEXT,
    -- aggregated stats
    total_commits           INTEGER NOT NULL DEFAULT 0,
    total_additions         BIGINT  NOT NULL DEFAULT 0,
    total_deletions         BIGINT  NOT NULL DEFAULT 0,
    total_prs               INTEGER NOT NULL DEFAULT 0,
    total_prs_merged        INTEGER NOT NULL DEFAULT 0,
    repos                   JSONB   NOT NULL DEFAULT '[]'::JSONB,
    repo_count              INTEGER NOT NULL DEFAULT 0,
    -- workflow stats
    workflow_runs_triggered INTEGER NOT NULL DEFAULT 0,
    workflow_failure_rate   REAL    NOT NULL DEFAULT 0,
    -- activity
    first_commit_at         TIMESTAMPTZ,
    last_commit_at          TIMESTAMPTZ,
    active_days             INTEGER NOT NULL DEFAULT 0,
    -- metadata
    computed_at             TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (owner_login, contributor_login)
);

CREATE INDEX IF NOT EXISTS idx_contributor_snapshot_owner
    ON contributor_snapshot(owner_login);

-- ── Daily Activity ───────────────────────────────────────────────────────────────
-- Time-series table for charts, heatmaps, date-range aggregation.
-- Nullable repo_id/contributor_login allow multi-level aggregation:
--   NULL, NULL = owner-level daily totals
--   repo_id, NULL = per-repo daily totals
--   repo_id, contributor = per-repo-per-contributor daily

CREATE TABLE IF NOT EXISTS daily_activity (
    owner_login         TEXT NOT NULL,
    repo_id             INTEGER,
    contributor_login   TEXT,
    date                DATE NOT NULL,
    commit_count        INTEGER NOT NULL DEFAULT 0,
    additions           BIGINT  NOT NULL DEFAULT 0,
    deletions           BIGINT  NOT NULL DEFAULT 0,
    pr_opened           INTEGER NOT NULL DEFAULT 0,
    pr_merged           INTEGER NOT NULL DEFAULT 0,
    pr_closed           INTEGER NOT NULL DEFAULT 0,
    workflow_runs       INTEGER NOT NULL DEFAULT 0,
    workflow_failures   INTEGER NOT NULL DEFAULT 0,
    computed_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_activity_pk
    ON daily_activity(owner_login, date, COALESCE(repo_id, -1), COALESCE(contributor_login, ''));

-- Owner-level daily activity (for dashboard heatmap / trends)
CREATE INDEX IF NOT EXISTS idx_daily_activity_owner_date
    ON daily_activity(owner_login, date)
    WHERE repo_id IS NULL AND contributor_login IS NULL;

-- Per-repo activity
CREATE INDEX IF NOT EXISTS idx_daily_activity_repo_date
    ON daily_activity(repo_id, date)
    WHERE repo_id IS NOT NULL AND contributor_login IS NULL;

-- ── Sync State ───────────────────────────────────────────────────────────────────
-- Tracks high-water marks for gap-aware incremental syncing.

CREATE TABLE IF NOT EXISTS sync_state (
    owner_login     TEXT NOT NULL,
    repo_id         INTEGER NOT NULL REFERENCES repository_meta(id) ON DELETE CASCADE,
    resource_type   TEXT NOT NULL CHECK (resource_type IN ('commits', 'pulls', 'workflows')),
    last_synced_at  TIMESTAMPTZ NOT NULL,
    last_cursor     TEXT,
    error_count     INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    PRIMARY KEY (owner_login, repo_id, resource_type)
);
