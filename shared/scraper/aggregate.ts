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
import { getReposByOwner } from "../db/queries/identity.ts";
import { getCommitsByRepo, getPrsByRepo, getContributorStatsByRepo } from "../db/queries/events.ts";
import {
    upsertOwnerSnapshot,
    upsertRepoSnapshot,
    upsertContributorSnapshot,
    getRepoSnapshotsByOwner,
    type UpsertOwnerSnapshotInput,
    type UpsertRepoSnapshotInput,
    type UpsertContributorSnapshotInput
} from "../db/queries/snapshots.ts";
import {
    clearRepoDailyActivity,
    upsertDailyActivity,
    type UpsertDailyActivityInput
} from "../db/queries/activity.ts";
import { LANGUAGE_COLORS } from "./github-client.ts";
import type {
    SnapshotContributor,
    LanguageBreakdownEntry,
    RepositoryMetaRow,
    CommitEventRow,
    PrEventRow
} from "../db/types.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Extract YYYY-MM-DD date string from a Date object. */
function toDateString(d: Date): string {
    return d.toISOString().split("T")[0];
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
 * Aggregate a single repo: rebuild its repo_snapshot.
 * Called right after a repo's commits and PRs are ingested so the repo detail
 * page has data immediately — no need to wait for the full owner sync.
 *
 * NOTE: Per-repo daily_activity is NOT built here because no frontend consumer
 * uses it. Owner-level daily_activity is rebuilt in aggregateOwner().
 */
export async function aggregateRepo(ownerLogin: string, repo: RepositoryMetaRow): Promise<void> {
    console.log(
        `[aggregate] ${ownerLogin}/${repo.name}: aggregating repo`
    );
    const commits = await getCommitsByRepo(repo.id);
    const prs = await getPrsByRepo(repo.id);

    await buildAndUpsertRepoSnapshot(ownerLogin, repo, commits, prs);

    console.log(
        `[aggregate] ${ownerLogin}/${repo.name}: repo snapshot built (${commits.length} commits, ${prs.length} PRs)`
    );
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
    const repos = await getReposByOwner(ownerLogin);
    const nonForkRepos = repos.filter((r) => !r.is_fork);

    console.log(
        `[aggregate] ${ownerLogin}: starting full aggregation for ${nonForkRepos.length} repos`
    );

    // Step 1: Rebuild per-repo daily_activity via SQL (INSERT INTO ... SELECT)
    let dailyActivityRows = 0;
    for (let i = 0; i < nonForkRepos.length; i++) {
        const repo = nonForkRepos[i];
        await clearRepoDailyActivity(repo.id);
        const inserted = await rebuildRepoDailyActivitySQL(ownerLogin, repo.id);
        dailyActivityRows += inserted;
        if ((i + 1) % 50 === 0) {
            console.log(
                `[aggregate] ${ownerLogin}: daily activity ${i + 1}/${nonForkRepos.length} repos done`
            );
        }
    }

    // Rebuild repo snapshots via SQL aggregation (no raw event rows in JS)
    for (let i = 0; i < nonForkRepos.length; i++) {
        const repo = nonForkRepos[i];
        await rebuildRepoSnapshotSQL(ownerLogin, repo);
        if ((i + 1) % 50 === 0) {
            console.log(
                `[aggregate] ${ownerLogin}: repo snapshots ${i + 1}/${nonForkRepos.length} done`
            );
        }
    }
    console.log(
        `[aggregate] ${ownerLogin}: rebuilt ${nonForkRepos.length} repo snapshots + ${dailyActivityRows} repo daily activity rows`
    );

    // Step 2: Rebuild owner-level daily_activity (aggregated across all repos)
    console.log(`[aggregate] ${ownerLogin}: rebuilding owner daily activity`);
    const ownerDailyRows = await rebuildOwnerDailyActivity(ownerLogin);
    dailyActivityRows += ownerDailyRows;
    console.log(
        `[aggregate] ${ownerLogin}: rebuilt ${ownerDailyRows} owner-level daily activity rows`
    );

    // Step 3: Rebuild contributor_snapshot
    console.log(`[aggregate] ${ownerLogin}: rebuilding contributor snapshots`);
    const contributorSnapshots = await rebuildContributorSnapshots(ownerLogin);
    console.log(`[aggregate] ${ownerLogin}: rebuilt ${contributorSnapshots} contributor snapshots`);

    // Step 4: Rebuild owner_snapshot
    console.log(`[aggregate] ${ownerLogin}: rebuilding owner snapshot`);
    await rebuildOwnerSnapshot(ownerLogin, nonForkRepos);
    console.log(`[aggregate] ${ownerLogin}: owner snapshot updated`);

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
        all_dates AS (
            SELECT date FROM commit_daily
            UNION SELECT date FROM pr_opened
            UNION SELECT date FROM pr_merged
            UNION SELECT date FROM pr_closed
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
            0 AS workflow_runs,
            0 AS workflow_failures
        FROM all_dates d
        LEFT JOIN commit_daily cd ON cd.date = d.date
        LEFT JOIN pr_opened po ON po.date = d.date
        LEFT JOIN pr_merged pm ON pm.date = d.date
        LEFT JOIN pr_closed pc ON pc.date = d.date`,
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
    const [stats] = await query<{
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
    );

    // Get contributor stats (already SQL-based)
    const contribStats = await getContributorStatsByRepo(repo.id);

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
        ci_success_rate: 0,
        ci_avg_duration_seconds: 0,
        last_ci_conclusion: null,
        top_contributors: topContributors
    };

    await upsertRepoSnapshot(snap);
}

/**
 * Build daily_activity rows for a single repo from its commits and PRs.
 * Pure function — does not touch the database.
 * Used by aggregateRepo() for progressive single-repo aggregation during ingestion.
 */
function buildRepoDailyActivity(
    ownerLogin: string,
    repoId: number,
    commits: CommitEventRow[],
    prs: PrEventRow[]
): UpsertDailyActivityInput[] {
    const dateMap = new Map<
        string,
        {
            commits: number;
            additions: number;
            deletions: number;
            prOpened: number;
            prMerged: number;
            prClosed: number;
        }
    >();

    const ensureDate = (date: string) => {
        if (!dateMap.has(date)) {
            dateMap.set(date, {
                commits: 0,
                additions: 0,
                deletions: 0,
                prOpened: 0,
                prMerged: 0,
                prClosed: 0
            });
        }
        return dateMap.get(date)!;
    };

    // Aggregate commits by date — LoC from non-merge commits
    for (const c of commits) {
        const date = toDateString(c.committed_at);
        const entry = ensureDate(date);
        entry.commits++;
        if (!c.is_merge) {
            entry.additions += c.additions;
            entry.deletions += c.deletions;
        }
    }

    // Aggregate PRs by date (counts only, no LoC)
    for (const pr of prs) {
        const createdDate = toDateString(pr.created_at);
        ensureDate(createdDate).prOpened++;

        if (pr.merged_at) {
            ensureDate(toDateString(pr.merged_at)).prMerged++;
        } else if (pr.closed_at) {
            ensureDate(toDateString(pr.closed_at)).prClosed++;
        }
    }

    return Array.from(dateMap.entries()).map(([date, data]) => ({
        owner_login: ownerLogin,
        repo_id: repoId,
        contributor_login: null,
        date,
        commit_count: data.commits,
        additions: data.additions,
        deletions: data.deletions,
        pr_opened: data.prOpened,
        pr_merged: data.prMerged,
        pr_closed: data.prClosed,
        workflow_runs: 0,
        workflow_failures: 0
    }));
}

// ── Shared: Repo Snapshot Builder ────────────────────────────────────────────────

/**
 * Build and upsert a repo_snapshot for a single repo.
 */
async function buildAndUpsertRepoSnapshot(
    ownerLogin: string,
    repo: RepositoryMetaRow,
    commits: CommitEventRow[],
    prs: PrEventRow[]
): Promise<void> {
    const contribStats = await getContributorStatsByRepo(repo.id);

    // LoC sourced from non-merge commits
    const nonMergeCommits = commits.filter((c) => !c.is_merge);
    const mergedPrs = prs.filter((pr) => pr.merged_at !== null);
    const openPrs = prs.filter((pr) => pr.state === "open").length;

    const totalAdditions = nonMergeCommits.reduce((sum, c) => sum + c.additions, 0);
    const totalDeletions = nonMergeCommits.reduce((sum, c) => sum + c.deletions, 0);

    // Build top contributors for this repo
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
        total_commits: commits.length,
        total_prs: prs.length,
        open_prs: openPrs,
        merged_prs: mergedPrs.length,
        total_additions: totalAdditions,
        total_deletions: totalDeletions,
        contributor_count: contribStats.length,
        ci_success_rate: 0, // Deferred: workflow ingestion not yet implemented
        ci_avg_duration_seconds: 0,
        last_ci_conclusion: null,
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
    await query("DELETE FROM daily_activity WHERE owner_login = $1 AND repo_id IS NULL", [
        ownerLogin
    ]);

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
        active_days: number;
    }>(
        `WITH commit_stats AS (
            SELECT
                ce.author_login AS login,
                COUNT(*)::INTEGER AS total_commits,
                COALESCE(SUM(ce.additions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS total_additions,
                COALESCE(SUM(ce.deletions) FILTER (WHERE ce.is_merge = false), 0)::INTEGER AS total_deletions,
                ARRAY_AGG(DISTINCT rm.name) AS commit_repos,
                MIN(ce.committed_at) AS first_commit_at,
                MAX(ce.committed_at) AS last_commit_at,
                COUNT(DISTINCT ce.committed_at::DATE)::INTEGER AS active_days
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
                ARRAY_AGG(DISTINCT rm.name) AS pr_repos
            FROM pr_event pe
            JOIN repository_meta rm ON rm.id = pe.repo_id
            WHERE rm.owner_login = $1 AND pe.author_login IS NOT NULL
            GROUP BY pe.author_login
        ),
        combined AS (
            SELECT
                COALESCE(c.login, p.login) AS login,
                COALESCE(c.total_commits, 0) AS total_commits,
                COALESCE(c.total_additions, 0) AS total_additions,
                COALESCE(c.total_deletions, 0) AS total_deletions,
                COALESCE(p.total_prs, 0) AS total_prs,
                COALESCE(p.total_prs_merged, 0) AS total_prs_merged,
                c.commit_repos,
                p.pr_repos,
                c.first_commit_at,
                c.last_commit_at,
                COALESCE(c.active_days, 0) AS active_days
            FROM commit_stats c
            FULL OUTER JOIN pr_stats p ON c.login = p.login
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
            combined.active_days
        FROM combined
        LEFT JOIN contributor_profile cp ON cp.login = combined.login`,
        [ownerLogin]
    );

    let count = 0;
    for (const row of rows) {
        const snap: UpsertContributorSnapshotInput = {
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
            workflow_runs_triggered: 0,
            workflow_failure_rate: 0,
            first_commit_at: row.first_commit_at,
            last_commit_at: row.last_commit_at,
            active_days: row.active_days
        };

        await upsertContributorSnapshot(snap);
        count++;
    }

    return count;
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
        total_workflow_runs: 0, // Deferred: workflow ingestion
        workflow_success_rate: 0,
        avg_workflow_duration: 0
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
