-- ── Workflow Jobs & Steps ─────────────────────────────────────────────────────
-- Stores per-job and per-step timing data fetched from the GitHub Jobs API.
-- Enables accurate duration computation and step-level breakdown visualization.

-- Track whether jobs have been fetched for a workflow run
ALTER TABLE workflow_event ADD COLUMN IF NOT EXISTS jobs_fetched BOOLEAN NOT NULL DEFAULT FALSE;

-- Store the commit/PR title shown in GitHub's UI
ALTER TABLE workflow_event ADD COLUMN IF NOT EXISTS display_title TEXT;

CREATE TABLE IF NOT EXISTS workflow_job (
    id              BIGINT PRIMARY KEY,
    workflow_run_id BIGINT NOT NULL REFERENCES workflow_event(id) ON DELETE CASCADE,
    repo_id         INTEGER NOT NULL REFERENCES repository_meta(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    status          TEXT CHECK (status IN ('completed', 'in_progress', 'queued')),
    conclusion      TEXT CHECK (conclusion IN ('success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale')),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_seconds INTEGER,
    runner_name     TEXT,
    ingested_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_job_run_id ON workflow_job(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_job_repo_id ON workflow_job(repo_id);

CREATE TABLE IF NOT EXISTS workflow_step (
    job_id          BIGINT NOT NULL REFERENCES workflow_job(id) ON DELETE CASCADE,
    number          INTEGER NOT NULL,
    name            TEXT NOT NULL,
    status          TEXT CHECK (status IN ('completed', 'in_progress', 'queued')),
    conclusion      TEXT CHECK (conclusion IN ('success', 'failure', 'cancelled', 'skipped')),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    duration_seconds INTEGER,
    PRIMARY KEY (job_id, number)
);
