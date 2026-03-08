-- Persistent job queue for crash-resilient, tick-based GitHub sync.
-- Replaces in-memory orchestration that could be killed by isolate eviction.
--
-- Each sync is a row in this table. A cron tick claims a job, processes one
-- unit of work (one repo), then updates the row. If the isolate dies mid-tick,
-- the next tick detects the stale claimed_at and resumes.

CREATE TABLE sync_job (
    id          BIGSERIAL PRIMARY KEY,
    owner_login TEXT NOT NULL REFERENCES owner(login) ON DELETE CASCADE,
    job_type    TEXT NOT NULL DEFAULT 'full_sync'
                CHECK (job_type IN ('full_sync', 'repo_sync')),
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'complete', 'failed', 'cancelled')),

    -- Phase within the job lifecycle
    -- full_sync:  queued → fetching_repos → syncing_repos → aggregating → complete
    -- repo_sync:  queued → syncing → complete
    phase       TEXT NOT NULL DEFAULT 'queued',

    -- Repo tracking
    repo_name   TEXT,                    -- for repo_sync jobs
    repo_ids    JSONB DEFAULT '[]',      -- ordered repo IDs to process (full_sync)
    repo_names  JSONB DEFAULT '[]',      -- parallel repo names (for display)
    repos_done  INTEGER DEFAULT 0,       -- how many repos completed

    -- Progress (replaces in-memory progress)
    total_repos    INTEGER DEFAULT 0,
    current_repo   TEXT,
    total_events   INTEGER DEFAULT 0,

    -- Sync options
    since_date  TEXT,
    until_date  TEXT,

    -- Timing
    started_at   TIMESTAMPTZ,
    claimed_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW(),

    -- Error tracking
    errors       JSONB DEFAULT '[]',
    last_error   TEXT,

    -- Result (populated on completion)
    result       JSONB
);

-- Only one active job per owner per type (prevents duplicate syncs,
-- but allows a repo_sync to run alongside a full_sync)
CREATE UNIQUE INDEX idx_sync_job_active_owner
    ON sync_job (owner_login, job_type) WHERE status IN ('pending', 'running');

-- Efficiently find jobs that need processing
CREATE INDEX idx_sync_job_claimable
    ON sync_job (status, created_at) WHERE status IN ('pending', 'running');
