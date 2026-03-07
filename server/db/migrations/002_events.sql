-- Migration 002: Event Store
-- Append-only, immutable event tables for raw GitHub data.
-- Each row represents a single fact scraped from the GitHub API.

-- ── Commit Events ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commit_event (
    sha             TEXT PRIMARY KEY,
    repo_id         INTEGER NOT NULL REFERENCES repository_meta(id) ON DELETE CASCADE,
    author_login    TEXT,
    committer_login TEXT,
    message         TEXT,
    html_url        TEXT,
    committed_at    TIMESTAMPTZ NOT NULL,
    additions       INTEGER NOT NULL DEFAULT 0,
    deletions       INTEGER NOT NULL DEFAULT 0,
    ingested_at     TIMESTAMPTZ DEFAULT NOW()
);

-- BRIN index on committed_at — ideal for time-ordered append-only data.
-- Dramatically reduces scan cost for date-range queries.
CREATE INDEX IF NOT EXISTS idx_commit_event_committed_at
    ON commit_event USING BRIN(committed_at);

-- B-tree for repo_id lookups (repo detail page, per-repo aggregation)
CREATE INDEX IF NOT EXISTS idx_commit_event_repo_id
    ON commit_event(repo_id);

-- Composite for "commits by author in repo" queries
CREATE INDEX IF NOT EXISTS idx_commit_event_repo_author
    ON commit_event(repo_id, author_login);

-- ── Pull Request Events ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pr_event (
    id              INTEGER PRIMARY KEY,
    repo_id         INTEGER NOT NULL REFERENCES repository_meta(id) ON DELETE CASCADE,
    number          INTEGER NOT NULL,
    author_login    TEXT,
    title           TEXT,
    state           TEXT NOT NULL CHECK (state IN ('open', 'closed')),
    is_draft        BOOLEAN NOT NULL DEFAULT FALSE,
    html_url        TEXT,
    base_ref        TEXT,
    head_ref        TEXT,
    additions       INTEGER NOT NULL DEFAULT 0,
    deletions       INTEGER NOT NULL DEFAULT 0,
    changed_files   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL,
    closed_at       TIMESTAMPTZ,
    merged_at       TIMESTAMPTZ,
    ingested_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_event_repo_id
    ON pr_event(repo_id);

CREATE INDEX IF NOT EXISTS idx_pr_event_repo_state
    ON pr_event(repo_id, state);

-- ── Workflow Events (schema only — ingestion deferred) ───────────────────────────

CREATE TABLE IF NOT EXISTS workflow_event (
    id              BIGINT PRIMARY KEY,
    repo_id         INTEGER NOT NULL REFERENCES repository_meta(id) ON DELETE CASCADE,
    workflow_name   TEXT,
    workflow_path   TEXT,
    actor_login     TEXT,
    run_number      INTEGER,
    status          TEXT CHECK (status IN ('completed', 'in_progress', 'queued')),
    conclusion      TEXT CHECK (conclusion IN ('success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale')),
    head_branch     TEXT,
    head_sha        TEXT,
    duration_seconds INTEGER,
    created_at      TIMESTAMPTZ NOT NULL,
    ingested_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_event_repo_id
    ON workflow_event(repo_id);
