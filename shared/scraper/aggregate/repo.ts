import { query } from "../../db/pool.ts";
import {
    clearRepoDailyActivity,
    upsertDailyActivity,
    type UpsertDailyActivityInput
} from "../../db/queries/activity.ts";
import { getContributorStatsByRepo } from "../../db/queries/commits.ts";
import { upsertRepoSnapshot, type UpsertRepoSnapshotInput } from "../../db/queries/snapshots.ts";
import type { RepositoryMetaRow, SnapshotContributor } from "../../db/types.ts";

// ── CI Stats ─────────────────────────────────────────────────────────────────────

/** Fetch CI stats (success rate, avg duration, last conclusion) for a repo. */
export async function getCiStatsByRepo(repoId: number): Promise<{
    ci_success_rate: number;
    ci_avg_duration_seconds: number;
    last_ci_conclusion: string | null;
}> {
    const [row] = await query<{
        ci_success_rate: number;
        ci_avg_duration_seconds: number;
        last_ci_conclusion: string | null;
    }>(
        `SELECT
            COALESCE((SELECT ROUND(COUNT(*) FILTER (WHERE conclusion = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) FROM workflow_event WHERE repo_id = $1 AND status = 'completed' AND event IS DISTINCT FROM 'dynamic'), 0)::NUMERIC AS ci_success_rate,
            COALESCE((SELECT AVG(duration_seconds)::INTEGER FROM workflow_event WHERE repo_id = $1 AND status = 'completed' AND event IS DISTINCT FROM 'dynamic' AND duration_seconds IS NOT NULL), 0) AS ci_avg_duration_seconds,
            (SELECT conclusion FROM workflow_event WHERE repo_id = $1 AND status = 'completed' AND event IS DISTINCT FROM 'dynamic' ORDER BY created_at DESC LIMIT 1) AS last_ci_conclusion`,
        [repoId]
    );
    return {
        ci_success_rate: Number(row?.ci_success_rate) || 0,
        ci_avg_duration_seconds: row?.ci_avg_duration_seconds ?? 0,
        last_ci_conclusion: row?.last_ci_conclusion ?? null
    };
}

// ── Per-Repo Daily Activity Builder ─────────────────────────────────────────────

/**
 * Rebuild daily_activity for a single repo using SQL aggregation.
 * Combines commit and PR stats per date without loading raw events into JS.
 */
export async function rebuildRepoDailyActivitySQL(
    ownerLogin: string,
    repoId: number
): Promise<number> {
    // Aggregate commits by date (LoC from non-merge only) and PR events by date,
    // then merge them into daily_activity rows.
    const rows = await query<UpsertDailyActivityInput>(
        `WITH commit_daily AS (
            SELECT
                ce.committed_at::DATE::TEXT AS date,
                COUNT(*)::INTEGER AS commit_count,
                COALESCE(SUM(ce.additions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS additions,
                COALESCE(SUM(ce.deletions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS deletions
            FROM commit_event ce
            WHERE ce.repo_id = $2
            GROUP BY ce.committed_at::DATE
        ),
        pr_opened AS (
            SELECT pe.created_at::DATE::TEXT AS date, COUNT(*)::INTEGER AS cnt
            FROM pr_event pe WHERE pe.repo_id = $2
            GROUP BY pe.created_at::DATE
        ),
        pr_merged AS (
            SELECT pe.merged_at::DATE::TEXT AS date, COUNT(*)::INTEGER AS cnt
            FROM pr_event pe WHERE pe.repo_id = $2 AND pe.merged_at IS NOT NULL
            GROUP BY pe.merged_at::DATE
        ),
        pr_closed AS (
            SELECT pe.closed_at::DATE::TEXT AS date, COUNT(*)::INTEGER AS cnt
            FROM pr_event pe WHERE pe.repo_id = $2 AND pe.closed_at IS NOT NULL AND pe.merged_at IS NULL
            GROUP BY pe.closed_at::DATE
        ),
        workflow_daily AS (
            SELECT we.created_at::DATE::TEXT AS date,
                   COUNT(*)::INTEGER AS runs,
                   COUNT(*) FILTER (WHERE we.conclusion IN ('failure','timed_out'))::INTEGER AS failures
            FROM workflow_event we WHERE we.repo_id = $2 AND we.status = 'completed' AND we.event IS DISTINCT FROM 'dynamic'
            GROUP BY we.created_at::DATE
        ),
        all_dates AS (
            SELECT date FROM commit_daily
            UNION SELECT date FROM pr_opened
            UNION SELECT date FROM pr_merged
            UNION SELECT date FROM pr_closed
            UNION SELECT date FROM workflow_daily
        )
        SELECT
            $1::TEXT AS owner_login,
            $2::INTEGER AS repo_id,
            NULL::TEXT AS contributor_login,
            d.date,
            COALESCE(cd.commit_count, 0) AS commit_count,
            COALESCE(cd.additions, 0) AS additions,
            COALESCE(cd.deletions, 0) AS deletions,
            COALESCE(po.cnt, 0) AS pr_opened,
            COALESCE(pm.cnt, 0) AS pr_merged,
            COALESCE(pc.cnt, 0) AS pr_closed,
            COALESCE(wd.runs, 0) AS workflow_runs,
            COALESCE(wd.failures, 0) AS workflow_failures
        FROM all_dates d
        LEFT JOIN commit_daily cd ON cd.date = d.date
        LEFT JOIN pr_opened po ON po.date = d.date
        LEFT JOIN pr_merged pm ON pm.date = d.date
        LEFT JOIN pr_closed pc ON pc.date = d.date
        LEFT JOIN workflow_daily wd ON wd.date = d.date`,
        [ownerLogin, repoId]
    );

    if (rows.length > 0) {
        await upsertDailyActivity(rows);
    }
    return rows.length;
}

/**
 * Rebuild a repo_snapshot using SQL aggregation.
 * Avoids loading all raw commit/PR rows into JS memory.
 */
export async function rebuildRepoSnapshotSQL(
    ownerLogin: string,
    repo: RepositoryMetaRow
): Promise<void> {
    // Get aggregate stats from SQL
    const [[stats], ciStats, contribStats] = await Promise.all([
        query<{
            total_commits: number;
            total_prs: number;
            open_prs: number;
            merged_prs: number;
            total_additions: number;
            total_deletions: number;
        }>(
            `SELECT
                (SELECT COUNT(*)::INTEGER FROM commit_event WHERE repo_id = $1) AS total_commits,
                (SELECT COUNT(*)::INTEGER FROM pr_event WHERE repo_id = $1) AS total_prs,
                (SELECT COUNT(*)::INTEGER FROM pr_event WHERE repo_id = $1 AND state = 'open') AS open_prs,
                (SELECT COUNT(*)::INTEGER FROM pr_event WHERE repo_id = $1 AND merged_at IS NOT NULL) AS merged_prs,
                COALESCE((SELECT SUM(additions)::INTEGER FROM commit_event WHERE repo_id = $1 AND is_merge = false), 0) AS total_additions,
                COALESCE((SELECT SUM(deletions)::INTEGER FROM commit_event WHERE repo_id = $1 AND is_merge = false), 0) AS total_deletions`,
            [repo.id]
        ),
        getCiStatsByRepo(repo.id),
        getContributorStatsByRepo(repo.id)
    ]);

    const topContributors: SnapshotContributor[] = contribStats.slice(0, 10).map((cs) => ({
        login: cs.login,
        avatar_url: cs.avatar_url ?? "",
        commits: cs.commits,
        additions: cs.additions,
        deletions: cs.deletions
    }));

    const snap: UpsertRepoSnapshotInput = {
        repo_id: repo.id,
        owner_login: ownerLogin,
        name: repo.name,
        description: repo.description,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        open_issues_count: repo.open_issues_count,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        total_commits: stats.total_commits,
        total_prs: stats.total_prs,
        open_prs: stats.open_prs,
        merged_prs: stats.merged_prs,
        total_additions: stats.total_additions,
        total_deletions: stats.total_deletions,
        contributor_count: contribStats.length,
        ci_success_rate: ciStats.ci_success_rate,
        ci_avg_duration_seconds: ciStats.ci_avg_duration_seconds,
        last_ci_conclusion: ciStats.last_ci_conclusion,
        top_contributors: topContributors
    };

    await upsertRepoSnapshot(snap);
}

// ── Per-Repo Aggregation (progressive) ──────────────────────────────────────────

/**
 * Aggregate a single repo: rebuild its repo_snapshot and daily_activity.
 * Called right after a repo's commits and PRs are ingested so the repo detail
 * page has data immediately — no need to wait for the full owner sync.
 *
 * Building daily_activity progressively allows aggregateOwner() to skip
 * repos already handled here.
 */
export async function aggregateRepo(ownerLogin: string, repo: RepositoryMetaRow): Promise<void> {
    console.log(`[aggregate] ${ownerLogin}/${repo.name}: aggregating repo`);
    await clearRepoDailyActivity(repo.id);
    const daRows = await rebuildRepoDailyActivitySQL(ownerLogin, repo.id);
    await rebuildRepoSnapshotSQL(ownerLogin, repo);
    console.log(
        `[aggregate] ${ownerLogin}/${repo.name}: repo snapshot + ${daRows} daily_activity rows built (SQL)`
    );
}
