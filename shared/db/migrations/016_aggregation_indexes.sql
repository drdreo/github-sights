-- 016: Add indexes that speed up aggregation pipeline queries
--
-- These target the exact access patterns used by the contributor snapshot rebuild,
-- contributor daily activity rebuild, CI stats, and JSONB containment queries.

-- Speeds up: contributor_snapshot rebuild (aggregate.ts CTE: commit_stats),
--            contributor daily activity rebuild (aggregate.ts: rebuildContributorDailyActivity)
CREATE INDEX IF NOT EXISTS idx_commit_event_author
    ON commit_event(author_login) WHERE author_login IS NOT NULL;

-- Speeds up: contributor_snapshot rebuild (aggregate.ts CTE: pr_stats),
--            contributor daily activity rebuild (pr_opened/pr_merged/pr_closed CTEs)
CREATE INDEX IF NOT EXISTS idx_pr_event_author
    ON pr_event(author_login) WHERE author_login IS NOT NULL;

-- Speeds up: getCiStatsByRepo, workflow daily activity CTE,
--            contributor workflow_stats CTE, getWorkflowStatsByRepo
CREATE INDEX IF NOT EXISTS idx_workflow_event_repo_status
    ON workflow_event(repo_id, status) WHERE status = 'completed';

-- Speeds up: "contributors for repo X" query using @> operator (snapshots.ts:279)
CREATE INDEX IF NOT EXISTS idx_contributor_snapshot_repos_gin
    ON contributor_snapshot USING GIN(repos);

-- Speeds up: contributor detail page time-series query (activity.ts)
CREATE INDEX IF NOT EXISTS idx_daily_activity_contributor
    ON daily_activity(owner_login, contributor_login, date)
    WHERE contributor_login IS NOT NULL AND repo_id IS NULL;
