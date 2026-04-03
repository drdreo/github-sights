// ── Aggregate Module ─────────────────────────────────────────────────────────────
//
// Rebuilds snapshot tables from raw event data.
// Idempotent: can be re-run at any time to rebuild all snapshots.
//
// Two entry points:
//   aggregateRepo()  — per-repo: repo_snapshot only (daily_activity is not consumed per-repo)
//                      Called progressively during sync, right after a repo is ingested.
//   aggregateOwner() — owner-wide: owner-level daily_activity, contributor_snapshot,
//                      owner_snapshot. Runs once after all repos are ingested.
//                      Also rebuilds all repo snapshots if they haven't been built yet.

import { query } from "../db/pool.ts";
import {
    clearRepoDailyActivity,
    upsertDailyActivity,
    type UpsertDailyActivityInput
} from "../db/queries/activity.ts";
import { getContributorStatsByRepo } from "../db/queries/events.ts";
import { getReposByOwner } from "../db/queries/identity.ts";
import {
    getAggregationWatermark,
    getRepoSnapshotsByOwner,
    type UpsertContributorSnapshotInput,
    upsertContributorSnapshotsBatch,
    upsertOwnerSnapshot,
    type UpsertOwnerSnapshotInput,
    upsertRepoSnapshot,
    type UpsertRepoSnapshotInput
} from "../db/queries/snapshots.ts";
import type {
    LanguageBreakdownEntry,
    RepositoryMetaRow,
    SnapshotContributor
} from "../db/types.ts";
import { LANGUAGE_COLORS } from "./github-client.ts";

/** Fetch CI stats (success rate, avg duration, last conclusion) for a repo. */
async function getCiStatsByRepo(repoId: number): Promise<{
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

// ── Types ────────────────────────────────────────────────────────────────────────

export interface AggregateResult {
    owner: string;
    dailyActivityRows: number;
    repoSnapshots: number;
    contributorSnapshots: number;
    ownerSnapshotUpdated: boolean;
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

// ── Timing Helper ───────────────────────────────────────────────────────────────

/** Measure execution time of an async function, returning result and duration. */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
    const start = performance.now();
    const result = await fn();
    const ms = Math.round(performance.now() - start);
    return { result, ms };
}

// ── Full Owner Aggregation ──────────────────────────────────────────────────────

/**
 * Full aggregation pipeline for an owner.
 * Rebuilds all snapshot tables from raw events.
 *
 * If repos were already aggregated progressively via aggregateRepo(), the
 * repo snapshots are rebuilt anyway (idempotent, ensures consistency).
 */
export async function aggregateOwner(ownerLogin: string): Promise<AggregateResult> {
    const pipelineStart = performance.now();
    const repos = await getReposByOwner(ownerLogin);
    const nonForkRepos = repos.filter((r) => !r.is_fork);

    console.log(
        `[aggregate] ${ownerLogin}: starting full aggregation for ${nonForkRepos.length} repos`
    );

    // Build a set of repo IDs already aggregated progressively in this sync.
    // If a repo_snapshot.computed_at is within the last 30 minutes, it was
    // built by aggregateRepo() during the sync phase and can be skipped.
    const existingSnapshots = await getRepoSnapshotsByOwner(ownerLogin);
    const recentThreshold = Date.now() - 30 * 60_000;
    const recentlyAggregated = new Set(
        existingSnapshots
            .filter((s) => s.computed_at && s.computed_at.getTime() > recentThreshold)
            .map((s) => s.repo_id)
    );

    // Step 1: Rebuild per-repo daily_activity via SQL (INSERT INTO ... SELECT)
    const {
        result: { dailyRows: step1DailyRows, skipped: step1Skipped },
        ms: step1Ms
    } = await timed("per-repo", async () => {
        let dailyRows = 0;
        let skipped = 0;
        for (let i = 0; i < nonForkRepos.length; i++) {
            const repo = nonForkRepos[i];
            if (recentlyAggregated.has(repo.id)) {
                skipped++;
                continue;
            }
            await clearRepoDailyActivity(repo.id);
            dailyRows += await rebuildRepoDailyActivitySQL(ownerLogin, repo.id);
            await rebuildRepoSnapshotSQL(ownerLogin, repo);
            if ((i + 1) % 50 === 0) {
                console.log(`[aggregate] ${ownerLogin}: repo ${i + 1}/${nonForkRepos.length} done`);
            }
        }
        return { dailyRows, skipped };
    });
    let dailyActivityRows = step1DailyRows;

    console.log(
        `[aggregate] ${ownerLogin}: Step 1 done in ${step1Ms}ms — ${nonForkRepos.length - step1Skipped} rebuilt, ${step1Skipped} skipped`
    );

    // Step 2: Rebuild owner + contributor daily_activity in parallel
    const {
        result: [ownerDailyRows, contribDailyRows],
        ms: step2Ms
    } = await timed("daily-activity", () =>
        Promise.all([
            rebuildOwnerDailyActivity(ownerLogin),
            rebuildContributorDailyActivity(ownerLogin)
        ])
    );
    dailyActivityRows += ownerDailyRows + contribDailyRows;
    console.log(
        `[aggregate] ${ownerLogin}: Step 2 done in ${step2Ms}ms — ${ownerDailyRows} owner + ${contribDailyRows} contributor rows`
    );

    // Step 3: Rebuild contributor_snapshot
    const { result: contributorSnapshots, ms: step3Ms } = await timed("contributor-snapshots", () =>
        rebuildContributorSnapshots(ownerLogin)
    );
    console.log(
        `[aggregate] ${ownerLogin}: Step 3 done in ${step3Ms}ms — ${contributorSnapshots} contributor snapshots`
    );

    // Step 4: Rebuild owner_snapshot
    const { ms: step4Ms } = await timed("owner-snapshot", () =>
        rebuildOwnerSnapshot(ownerLogin, nonForkRepos)
    );

    const totalMs = Math.round(performance.now() - pipelineStart);
    console.log(
        `[aggregate] ${ownerLogin}: full aggregation complete in ${totalMs}ms ` +
            `(per-repo: ${step1Ms}ms, daily: ${step2Ms}ms, contributors: ${step3Ms}ms, owner: ${step4Ms}ms)`
    );

    return {
        owner: ownerLogin,
        dailyActivityRows,
        repoSnapshots: nonForkRepos.length,
        contributorSnapshots,
        ownerSnapshotUpdated: true
    };
}

// ── Shared: Per-Repo Daily Activity Builder ─────────────────────────────────────

/**
 * Rebuild daily_activity for a single repo using SQL aggregation.
 * Combines commit and PR stats per date without loading raw events into JS.
 */
async function rebuildRepoDailyActivitySQL(ownerLogin: string, repoId: number): Promise<number> {
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
async function rebuildRepoSnapshotSQL(ownerLogin: string, repo: RepositoryMetaRow): Promise<void> {
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

// ── Owner-Level Daily Activity ──────────────────────────────────────────────────

/**
 * Rebuild owner-level daily_activity rows (repo_id IS NULL).
 * Aggregates from per-repo daily_activity rows in SQL to avoid loading all events into memory.
 */
async function rebuildOwnerDailyActivity(ownerLogin: string): Promise<number> {
    // Clear existing owner-level rows (repo_id IS NULL)
    await query(
        "DELETE FROM daily_activity WHERE owner_login = $1 AND repo_id IS NULL AND contributor_login IS NULL",
        [ownerLogin]
    );

    // Aggregate per-repo daily_activity rows into owner-level rows via SQL
    const rows = await query<UpsertDailyActivityInput>(
        `SELECT
            owner_login,
            NULL::INTEGER AS repo_id,
            NULL::TEXT AS contributor_login,
            date,
            SUM(commit_count)::INTEGER AS commit_count,
            SUM(additions)::INTEGER AS additions,
            SUM(deletions)::INTEGER AS deletions,
            SUM(pr_opened)::INTEGER AS pr_opened,
            SUM(pr_merged)::INTEGER AS pr_merged,
            SUM(pr_closed)::INTEGER AS pr_closed,
            SUM(workflow_runs)::INTEGER AS workflow_runs,
            SUM(workflow_failures)::INTEGER AS workflow_failures
         FROM daily_activity
         WHERE owner_login = $1 AND repo_id IS NOT NULL AND contributor_login IS NULL
         GROUP BY owner_login, date`,
        [ownerLogin]
    );

    if (rows.length > 0) {
        await upsertDailyActivity(rows);
    }

    return rows.length;
}

// ── Contributor-Level Daily Activity ─────────────────────────────────────────

/**
 * Rebuild contributor-level daily_activity rows (repo_id IS NULL, contributor_login IS NOT NULL).
 * Aggregates from commit_event + pr_event per contributor per date.
 * These rows power the date-filtered contributor detail view.
 */
async function rebuildContributorDailyActivity(ownerLogin: string): Promise<number> {
    // Clear existing contributor-level rows
    await query(
        "DELETE FROM daily_activity WHERE owner_login = $1 AND repo_id IS NULL AND contributor_login IS NOT NULL",
        [ownerLogin]
    );

    // Aggregate per-contributor daily stats from raw events
    const rows = await query<UpsertDailyActivityInput>(
        `WITH commit_daily AS (
            SELECT
                ce.author_login AS contributor_login,
                ce.committed_at::DATE::TEXT AS date,
                COUNT(*)::INTEGER AS commit_count,
                COALESCE(SUM(ce.additions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS additions,
                COALESCE(SUM(ce.deletions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS deletions
            FROM commit_event ce
            JOIN repository_meta rm ON rm.id = ce.repo_id
            WHERE rm.owner_login = $1 AND ce.author_login IS NOT NULL
            GROUP BY ce.author_login, ce.committed_at::DATE
        ),
        pr_opened AS (
            SELECT pe.author_login AS contributor_login,
                   pe.created_at::DATE::TEXT AS date, COUNT(*)::INTEGER AS cnt
            FROM pr_event pe
            JOIN repository_meta rm ON rm.id = pe.repo_id
            WHERE rm.owner_login = $1 AND pe.author_login IS NOT NULL
            GROUP BY pe.author_login, pe.created_at::DATE
        ),
        pr_merged AS (
            SELECT pe.author_login AS contributor_login,
                   pe.merged_at::DATE::TEXT AS date, COUNT(*)::INTEGER AS cnt
            FROM pr_event pe
            JOIN repository_meta rm ON rm.id = pe.repo_id
            WHERE rm.owner_login = $1 AND pe.merged_at IS NOT NULL AND pe.author_login IS NOT NULL
            GROUP BY pe.author_login, pe.merged_at::DATE
        ),
        pr_closed AS (
            SELECT pe.author_login AS contributor_login,
                   pe.closed_at::DATE::TEXT AS date, COUNT(*)::INTEGER AS cnt
            FROM pr_event pe
            JOIN repository_meta rm ON rm.id = pe.repo_id
            WHERE rm.owner_login = $1 AND pe.closed_at IS NOT NULL AND pe.merged_at IS NULL AND pe.author_login IS NOT NULL
            GROUP BY pe.author_login, pe.closed_at::DATE
        ),
        all_contributor_dates AS (
            SELECT contributor_login, date FROM commit_daily
            UNION SELECT contributor_login, date FROM pr_opened
            UNION SELECT contributor_login, date FROM pr_merged
            UNION SELECT contributor_login, date FROM pr_closed
        )
        SELECT
            $1::TEXT AS owner_login,
            NULL::INTEGER AS repo_id,
            d.contributor_login,
            d.date,
            COALESCE(cd.commit_count, 0) AS commit_count,
            COALESCE(cd.additions, 0) AS additions,
            COALESCE(cd.deletions, 0) AS deletions,
            COALESCE(po.cnt, 0) AS pr_opened,
            COALESCE(pm.cnt, 0) AS pr_merged,
            COALESCE(pc.cnt, 0) AS pr_closed,
            0 AS workflow_runs,
            0 AS workflow_failures
        FROM all_contributor_dates d
        LEFT JOIN commit_daily cd ON cd.contributor_login = d.contributor_login AND cd.date = d.date
        LEFT JOIN pr_opened po ON po.contributor_login = d.contributor_login AND po.date = d.date
        LEFT JOIN pr_merged pm ON pm.contributor_login = d.contributor_login AND pm.date = d.date
        LEFT JOIN pr_closed pc ON pc.contributor_login = d.contributor_login AND pc.date = d.date`,
        [ownerLogin]
    );

    if (rows.length > 0) {
        await upsertDailyActivity(rows);
    }

    return rows.length;
}

// ── Contributor Snapshots ────────────────────────────────────────────────────────

/**
 * Rebuild contributor_snapshot for all contributors across an owner's repos.
 * Uses SQL aggregation to avoid loading all events into memory.
 */
async function rebuildContributorSnapshots(ownerLogin: string): Promise<number> {
    const rows = await query<{
        login: string;
        avatar_url: string | null;
        html_url: string | null;
        total_commits: number;
        total_additions: number;
        total_deletions: number;
        total_prs: number;
        total_prs_merged: number;
        repos: string[];
        repo_count: number;
        first_commit_at: Date | null;
        last_commit_at: Date | null;
        first_pr_at: Date | null;
        last_pr_at: Date | null;
        active_days: number;
        workflow_runs_triggered: number;
        workflow_failure_rate: number;
    }>(
        `WITH commit_stats AS (
            SELECT
                ce.author_login AS login,
                COUNT(*) FILTER (WHERE ce.is_merge = false)::INTEGER AS total_commits,
                COALESCE(SUM(ce.additions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS total_additions,
                COALESCE(SUM(ce.deletions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS total_deletions,
                ARRAY_AGG(DISTINCT rm.name) AS commit_repos,
                MIN(ce.committed_at) AS first_commit_at,
                MAX(ce.committed_at) AS last_commit_at,
                ARRAY_AGG(DISTINCT ce.committed_at::DATE) AS commit_dates
            FROM commit_event ce
            JOIN repository_meta rm ON rm.id = ce.repo_id
            WHERE rm.owner_login = $1 AND ce.author_login IS NOT NULL
            GROUP BY ce.author_login
        ),
        pr_stats AS (
            SELECT
                pe.author_login AS login,
                COUNT(*)::INTEGER AS total_prs,
                COUNT(*) FILTER (WHERE pe.merged_at IS NOT NULL)::INTEGER AS total_prs_merged,
                ARRAY_AGG(DISTINCT rm.name) AS pr_repos,
                ARRAY_AGG(DISTINCT pe.created_at::DATE) AS pr_dates,
                MIN(pe.created_at) AS first_pr_at,
                MAX(pe.created_at) AS last_pr_at
            FROM pr_event pe
            JOIN repository_meta rm ON rm.id = pe.repo_id
            WHERE rm.owner_login = $1 AND pe.author_login IS NOT NULL
            GROUP BY pe.author_login
        ),
        workflow_stats AS (
            SELECT
                we.actor_login AS login,
                COUNT(*)::INTEGER AS runs_triggered,
                COALESCE(ROUND(COUNT(*) FILTER (WHERE we.conclusion IN ('failure','timed_out'))::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS failure_rate
            FROM workflow_event we
            JOIN repository_meta rm ON rm.id = we.repo_id
            WHERE rm.owner_login = $1 AND we.actor_login IS NOT NULL AND we.status = 'completed' AND we.event IS DISTINCT FROM 'dynamic'
            GROUP BY we.actor_login
        ),
        combined AS (
            SELECT
                COALESCE(c.login, p.login, w.login) AS login,
                COALESCE(c.total_commits, 0) AS total_commits,
                COALESCE(c.total_additions, 0) AS total_additions,
                COALESCE(c.total_deletions, 0) AS total_deletions,
                COALESCE(p.total_prs, 0) AS total_prs,
                COALESCE(p.total_prs_merged, 0) AS total_prs_merged,
                c.commit_repos,
                p.pr_repos,
                c.first_commit_at,
                c.last_commit_at,
                p.first_pr_at,
                p.last_pr_at,
                (SELECT COUNT(DISTINCT d) FROM UNNEST(
                    COALESCE(c.commit_dates, '{}') || COALESCE(p.pr_dates, '{}')
                ) AS d)::INTEGER AS active_days,
                COALESCE(w.runs_triggered, 0) AS workflow_runs_triggered,
                COALESCE(w.failure_rate, 0) AS workflow_failure_rate
            FROM commit_stats c
            FULL OUTER JOIN pr_stats p ON c.login = p.login
            FULL OUTER JOIN workflow_stats w ON COALESCE(c.login, p.login) = w.login
        )
        SELECT
            combined.login,
            cp.avatar_url,
            COALESCE(cp.html_url, 'https://github.com/' || combined.login) AS html_url,
            combined.total_commits,
            combined.total_additions,
            combined.total_deletions,
            combined.total_prs,
            combined.total_prs_merged,
            (SELECT ARRAY_AGG(DISTINCT r) FROM UNNEST(
                COALESCE(combined.commit_repos, '{}') || COALESCE(combined.pr_repos, '{}')
            ) AS r) AS repos,
            (SELECT COUNT(DISTINCT r) FROM UNNEST(
                COALESCE(combined.commit_repos, '{}') || COALESCE(combined.pr_repos, '{}')
            ) AS r)::INTEGER AS repo_count,
            combined.first_commit_at,
            combined.last_commit_at,
            combined.first_pr_at,
            combined.last_pr_at,
            combined.active_days,
            combined.workflow_runs_triggered,
            combined.workflow_failure_rate
        FROM combined
        LEFT JOIN contributor_profile cp ON cp.login = combined.login`,
        [ownerLogin]
    );

    const snaps: UpsertContributorSnapshotInput[] = rows.map((row) => ({
        owner_login: ownerLogin,
        contributor_login: row.login,
        avatar_url: row.avatar_url,
        html_url: row.html_url,
        total_commits: row.total_commits,
        total_additions: row.total_additions,
        total_deletions: row.total_deletions,
        total_prs: row.total_prs,
        total_prs_merged: row.total_prs_merged,
        repos: row.repos ?? [],
        repo_count: row.repo_count,
        workflow_runs_triggered: row.workflow_runs_triggered,
        workflow_failure_rate: Number(row.workflow_failure_rate) || 0,
        first_commit_at: row.first_commit_at,
        last_commit_at: row.last_commit_at,
        active_days: row.active_days,
        first_pr_at: row.first_pr_at,
        last_pr_at: row.last_pr_at
    }));

    await upsertContributorSnapshotsBatch(snaps);

    return snaps.length;
}

// ── Owner Snapshot ───────────────────────────────────────────────────────────────

/**
 * Rebuild the owner_snapshot from repo_snapshots + streak calculation.
 */
async function rebuildOwnerSnapshot(ownerLogin: string, repos: RepositoryMetaRow[]): Promise<void> {
    // Get all repo snapshots (which we just rebuilt)
    const repoSnapshots = await getRepoSnapshotsByOwner(ownerLogin);

    // Aggregate totals from repo snapshots
    let totalCommits = 0;
    let totalPRs = 0;
    let openPRs = 0;
    let mergedPRs = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;
    let mostActiveRepoName: string | null = null;
    let mostActiveRepoCommits = 0;
    const allContributorLogins = new Set<string>();

    for (const rs of repoSnapshots) {
        totalCommits += rs.total_commits;
        totalPRs += rs.total_prs;
        openPRs += rs.open_prs;
        mergedPRs += rs.merged_prs;
        totalAdditions += rs.total_additions;
        totalDeletions += rs.total_deletions;

        if (rs.total_commits > mostActiveRepoCommits) {
            mostActiveRepoCommits = rs.total_commits;
            mostActiveRepoName = rs.name;
        }

        // Collect unique contributor logins from top_contributors
        for (const tc of rs.top_contributors) {
            allContributorLogins.add(tc.login);
        }
    }

    // Get unique contributor count from contributor_snapshot
    const contribCountResult = await query<{ count: number }>(
        `SELECT COUNT(DISTINCT contributor_login)::INTEGER AS count
         FROM contributor_snapshot WHERE owner_login = $1`,
        [ownerLogin]
    );
    const uniqueContributors = contribCountResult[0]?.count ?? 0;

    // Build language breakdown
    const languageBreakdown = buildLanguageBreakdown(repos);

    // Calculate streaks from commit dates (lightweight — only fetches dates + count)
    const commitDateRows = await query<{ date: string; count: number }>(
        `SELECT ce.committed_at::DATE::TEXT AS date, COUNT(*)::INTEGER AS count
         FROM commit_event ce
         JOIN repository_meta rm ON rm.id = ce.repo_id
         WHERE rm.owner_login = $1 AND ce.author_login IS NOT NULL
         GROUP BY ce.committed_at::DATE
         ORDER BY date`,
        [ownerLogin]
    );
    const { longestStreak, currentStreak, avgCommitsPerDay } = calculateStreaks(commitDateRows);

    // Build top contributors (top 10 by commits across all repos)
    const topContribRows = await query<{
        login: string;
        avatar_url: string | null;
        total_commits: number;
        total_additions: number;
        total_deletions: number;
    }>(
        `SELECT contributor_login AS login, avatar_url,
                total_commits, total_additions, total_deletions
         FROM contributor_snapshot
         WHERE owner_login = $1
         ORDER BY total_commits DESC
         LIMIT 10`,
        [ownerLogin]
    );

    const topContributors: SnapshotContributor[] = topContribRows.map((r) => ({
        login: r.login,
        avatar_url: r.avatar_url ?? "",
        commits: r.total_commits,
        additions: r.total_additions,
        deletions: r.total_deletions
    }));

    // Aggregate workflow stats from workflow_event across all repos
    const [wfStats] = await query<{
        total_runs: number;
        success_rate: number;
        avg_duration: number;
    }>(
        `SELECT
            COUNT(*)::INTEGER AS total_runs,
            COALESCE(ROUND(COUNT(*) FILTER (WHERE we.conclusion = 'success')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1), 0)::NUMERIC AS success_rate,
            COALESCE(AVG(we.duration_seconds) FILTER (WHERE we.duration_seconds IS NOT NULL), 0)::INTEGER AS avg_duration
         FROM workflow_event we
         JOIN repository_meta rm ON rm.id = we.repo_id
         WHERE rm.owner_login = $1 AND we.status = 'completed' AND we.event IS DISTINCT FROM 'dynamic'`,
        [ownerLogin]
    );

    const snap: UpsertOwnerSnapshotInput = {
        owner_login: ownerLogin,
        total_repos: repos.length,
        total_commits: totalCommits,
        total_prs: totalPRs,
        open_prs: openPRs,
        merged_prs: mergedPRs,
        total_additions: totalAdditions,
        total_deletions: totalDeletions,
        unique_contributors: uniqueContributors,
        most_active_repo_name: mostActiveRepoName,
        most_active_repo_commits: mostActiveRepoCommits,
        longest_streak: longestStreak,
        current_streak: currentStreak,
        avg_commits_per_day: avgCommitsPerDay,
        top_contributors: topContributors,
        language_breakdown: languageBreakdown,
        total_workflow_runs: wfStats?.total_runs ?? 0,
        workflow_success_rate: Number(wfStats?.success_rate) || 0,
        avg_workflow_duration: wfStats?.avg_duration ?? 0
    };

    await upsertOwnerSnapshot(snap);
}

// ── Helper: Language Breakdown ───────────────────────────────────────────────────

function buildLanguageBreakdown(repos: RepositoryMetaRow[]): LanguageBreakdownEntry[] {
    const langCounts = new Map<string, number>();

    for (const repo of repos) {
        if (repo.language) {
            langCounts.set(repo.language, (langCounts.get(repo.language) ?? 0) + 1);
        }
    }

    return Array.from(langCounts.entries())
        .map(([language, count]) => ({
            language,
            count,
            color: LANGUAGE_COLORS[language] ?? "#8b8b8b"
        }))
        .sort((a, b) => b.count - a.count);
}

// ── Helper: Streak Calculation ───────────────────────────────────────────────────
// Port of the streak logic from the old github.ts (lines 1072-1123)

function calculateStreaks(dateCounts: Array<{ date: string; count: number }>): {
    longestStreak: number;
    currentStreak: number;
    avgCommitsPerDay: number;
} {
    if (dateCounts.length === 0) {
        return { longestStreak: 0, currentStreak: 0, avgCommitsPerDay: 0 };
    }

    // dateCounts is already sorted by date from SQL
    const sortedDates = dateCounts.map((r) => r.date);
    const totalCommits = dateCounts.reduce((sum, r) => sum + r.count, 0);

    let longestStreak = 1;
    let tempStreak = 1;

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i - 1]);
        const currDate = new Date(sortedDates[i]);
        const diffDays = Math.floor((currDate.getTime() - prevDate.getTime()) / 86400000);

        if (diffDays === 1) {
            tempStreak++;
        } else {
            longestStreak = Math.max(longestStreak, tempStreak);
            tempStreak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    // Current streak: only counts if the last commit date is today or yesterday
    let currentStreak = 0;
    const lastDate = sortedDates[sortedDates.length - 1];
    if (lastDate === today || lastDate === yesterday) {
        currentStreak = tempStreak;
    }

    // Average commits per day
    const firstDate = new Date(sortedDates[0]);
    const lastDateObj = new Date(sortedDates[sortedDates.length - 1]);
    const daysDiff = Math.max(
        1,
        Math.ceil((lastDateObj.getTime() - firstDate.getTime()) / 86400000) + 1
    );
    const avgCommitsPerDay = Math.round((totalCommits / daysDiff) * 100) / 100;

    return { longestStreak, currentStreak, avgCommitsPerDay };
}

// ── Incremental Owner Aggregation ───────────────────────────────────────────────

/**
 * Incremental aggregation pipeline for an owner.
 *
 * Leverages the watermark (`last_aggregated_at` in owner_snapshot) to skip
 * per-repo work that was already done progressively by `aggregateRepo()`.
 * Owner/contributor-level aggregation is rebuilt from per-repo data (cheap).
 *
 * Parallelizes independent steps where dependencies allow:
 *   - Steps 2a + 2b: owner + contributor daily_activity (both read per-repo rows)
 *   - Steps 3 + streak calc: contributor_snapshot + commit dates (no cross-dependency)
 *   - Step 4 waits for Steps 2 + 3
 *
 * Falls back to full rebuild when no watermark exists (first sync).
 */
export async function aggregateOwnerIncremental(ownerLogin: string): Promise<AggregateResult> {
    const watermark = await getAggregationWatermark(ownerLogin);

    // No watermark → first sync or manual reset → full rebuild
    if (!watermark) {
        console.log(`[aggregate] ${ownerLogin}: no watermark, falling back to full rebuild`);
        return aggregateOwner(ownerLogin);
    }

    const pipelineStart = performance.now();
    const repos = await getReposByOwner(ownerLogin);
    const nonForkRepos = repos.filter((r) => !r.is_fork);

    console.log(
        `[aggregate] ${ownerLogin}: incremental aggregation for ${nonForkRepos.length} repos ` +
            `(watermark: ${watermark.toISOString()})`
    );

    // Step 1: Per-repo daily_activity + snapshots for repos not done progressively
    const existingSnapshots = await getRepoSnapshotsByOwner(ownerLogin);
    const recentThreshold = watermark.getTime();
    const recentlyAggregated = new Set(
        existingSnapshots
            .filter((s) => s.computed_at && s.computed_at.getTime() > recentThreshold)
            .map((s) => s.repo_id)
    );

    const {
        result: { dailyRows: step1DailyRows, skipped: step1Skipped },
        ms: step1Ms
    } = await timed("per-repo", async () => {
        let dailyRows = 0;
        let skipped = 0;
        for (const repo of nonForkRepos) {
            if (recentlyAggregated.has(repo.id)) {
                skipped++;
                continue;
            }
            await clearRepoDailyActivity(repo.id);
            dailyRows += await rebuildRepoDailyActivitySQL(ownerLogin, repo.id);
            await rebuildRepoSnapshotSQL(ownerLogin, repo);
        }
        return { dailyRows, skipped };
    });
    let dailyActivityRows = step1DailyRows;

    console.log(
        `[aggregate] ${ownerLogin}: Step 1 done in ${step1Ms}ms — ${nonForkRepos.length - step1Skipped} rebuilt, ${step1Skipped} skipped`
    );

    // Steps 2a + 2b: Rebuild owner + contributor daily_activity in parallel
    const {
        result: [ownerDailyRows, contribDailyRows],
        ms: step2Ms
    } = await timed("daily-activity", () =>
        Promise.all([
            rebuildOwnerDailyActivity(ownerLogin),
            rebuildContributorDailyActivity(ownerLogin)
        ])
    );
    dailyActivityRows += ownerDailyRows + contribDailyRows;

    console.log(
        `[aggregate] ${ownerLogin}: Step 2 done in ${step2Ms}ms — ${ownerDailyRows} owner + ${contribDailyRows} contributor rows`
    );

    // Step 3: Rebuild contributor_snapshot
    const { result: contributorSnapshots, ms: step3Ms } = await timed("contributor-snapshots", () =>
        rebuildContributorSnapshots(ownerLogin)
    );
    console.log(
        `[aggregate] ${ownerLogin}: Step 3 done in ${step3Ms}ms — ${contributorSnapshots} contributor snapshots`
    );

    // Step 4: Rebuild owner_snapshot
    const { ms: step4Ms } = await timed("owner-snapshot", () =>
        rebuildOwnerSnapshot(ownerLogin, nonForkRepos)
    );

    const totalMs = Math.round(performance.now() - pipelineStart);
    console.log(
        `[aggregate] ${ownerLogin}: incremental aggregation complete in ${totalMs}ms ` +
            `(per-repo: ${step1Ms}ms, daily: ${step2Ms}ms, contributors: ${step3Ms}ms, owner: ${step4Ms}ms)`
    );

    return {
        owner: ownerLogin,
        dailyActivityRows,
        repoSnapshots: nonForkRepos.length,
        contributorSnapshots,
        ownerSnapshotUpdated: true
    };
}
