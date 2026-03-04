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
    getReposByOwner,
} from "../db/queries/identity.ts";
import {
    getCommitsByOwner,
    getCommitsByRepo,
    getPrsByRepo,
    getContributorStatsByRepo,
} from "../db/queries/events.ts";
import {
    upsertOwnerSnapshot,
    upsertRepoSnapshot,
    upsertContributorSnapshot,
    getRepoSnapshotsByOwner,
    type UpsertOwnerSnapshotInput,
    type UpsertRepoSnapshotInput,
    type UpsertContributorSnapshotInput,
} from "../db/queries/snapshots.ts";
import {
    clearRepoDailyActivity,
    upsertDailyActivity,
    type UpsertDailyActivityInput,
} from "../db/queries/activity.ts";
import { LANGUAGE_COLORS } from "./github-client.ts";
import type {
    SnapshotContributor,
    LanguageBreakdownEntry,
    RepositoryMetaRow,
    CommitEventRow,
    PrEventRow,
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
export async function aggregateRepo(
    ownerLogin: string,
    repo: RepositoryMetaRow
): Promise<void> {
    const commits = await getCommitsByRepo(repo.id);
    const prs = await getPrsByRepo(repo.id);

    await buildAndUpsertRepoSnapshot(ownerLogin, repo, commits, prs);

    console.log(`[aggregate] ${ownerLogin}/${repo.name}: repo snapshot built (${commits.length} commits, ${prs.length} PRs)`);
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

    console.log(`[aggregate] ${ownerLogin}: starting full aggregation for ${nonForkRepos.length} repos`);

    // Step 1: Rebuild per-repo daily_activity + repo snapshots
    let dailyActivityRows = 0;
    for (const repo of nonForkRepos) {
        const commits = await getCommitsByRepo(repo.id);
        const prs = await getPrsByRepo(repo.id);

        await clearRepoDailyActivity(repo.id);
        const dailyRows = buildRepoDailyActivity(ownerLogin, repo.id, commits, prs);
        if (dailyRows.length > 0) {
            await upsertDailyActivity(dailyRows);
            dailyActivityRows += dailyRows.length;
        }

        await buildAndUpsertRepoSnapshot(ownerLogin, repo, commits, prs);
    }
    console.log(`[aggregate] ${ownerLogin}: rebuilt ${nonForkRepos.length} repo snapshots + ${dailyActivityRows} repo daily activity rows`);

    // Step 2: Rebuild owner-level daily_activity (aggregated across all repos)
    const ownerDailyRows = await rebuildOwnerDailyActivity(ownerLogin, nonForkRepos);
    dailyActivityRows += ownerDailyRows;
    console.log(`[aggregate] ${ownerLogin}: rebuilt ${ownerDailyRows} owner-level daily activity rows`);

    // Step 3: Rebuild contributor_snapshot
    const contributorSnapshots = await rebuildContributorSnapshots(ownerLogin, nonForkRepos);
    console.log(`[aggregate] ${ownerLogin}: rebuilt ${contributorSnapshots} contributor snapshots`);

    // Step 4: Rebuild owner_snapshot
    await rebuildOwnerSnapshot(ownerLogin, nonForkRepos);
    console.log(`[aggregate] ${ownerLogin}: owner snapshot updated`);

    return {
        owner: ownerLogin,
        dailyActivityRows,
        repoSnapshots: nonForkRepos.length,
        contributorSnapshots,
        ownerSnapshotUpdated: true,
    };
}

// ── Shared: Per-Repo Daily Activity Builder ─────────────────────────────────────

/**
 * Build daily_activity rows for a single repo from its commits and PRs.
 * Pure function — does not touch the database.
 */
function buildRepoDailyActivity(
    ownerLogin: string,
    repoId: number,
    commits: CommitEventRow[],
    prs: PrEventRow[]
): UpsertDailyActivityInput[] {
    const dateMap = new Map<string, {
        commits: number;
        additions: number;
        deletions: number;
        prOpened: number;
        prMerged: number;
        prClosed: number;
    }>();

    const ensureDate = (date: string) => {
        if (!dateMap.has(date)) {
            dateMap.set(date, {
                commits: 0, additions: 0, deletions: 0,
                prOpened: 0, prMerged: 0, prClosed: 0,
            });
        }
        return dateMap.get(date)!;
    };

    // Aggregate commits by date (count only — LOC comes from PRs)
    for (const c of commits) {
        const date = toDateString(c.committed_at);
        ensureDate(date).commits++;
    }

    // Aggregate PRs by date
    for (const pr of prs) {
        const createdDate = toDateString(pr.created_at);
        ensureDate(createdDate).prOpened++;

        if (pr.merged_at) {
            const mergedDate = toDateString(pr.merged_at);
            const mergedEntry = ensureDate(mergedDate);
            mergedEntry.prMerged++;
            // LOC attributed to merge date (commit-level LOC is unavailable from GitHub list API)
            mergedEntry.additions += pr.additions;
            mergedEntry.deletions += pr.deletions;
        } else if (pr.closed_at) {
            const closedDate = toDateString(pr.closed_at);
            ensureDate(closedDate).prClosed++;
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
        workflow_failures: 0,
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

    // LOC sourced from merged PRs (GitHub list API doesn't return commit-level stats)
    const mergedPrs = prs.filter((pr) => pr.merged_at !== null);
    const openPrs = prs.filter((pr) => pr.state === "open").length;

    const totalAdditions = mergedPrs.reduce((sum, pr) => sum + pr.additions, 0);
    const totalDeletions = mergedPrs.reduce((sum, pr) => sum + pr.deletions, 0);

    // Build top contributors for this repo
    const topContributors: SnapshotContributor[] = contribStats
        .slice(0, 10)
        .map((cs) => ({
            login: cs.login,
            avatar_url: cs.avatar_url ?? "",
            commits: cs.commits,
            additions: cs.additions,
            deletions: cs.deletions,
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
        ci_success_rate: 0,          // Deferred: workflow ingestion not yet implemented
        ci_avg_duration_seconds: 0,
        last_ci_conclusion: null,
        top_contributors: topContributors,
    };

    await upsertRepoSnapshot(snap);
}

// ── Owner-Level Daily Activity ──────────────────────────────────────────────────

/**
 * Rebuild owner-level daily_activity rows (repo_id IS NULL).
 * Aggregates across all repos per date.
 */
async function rebuildOwnerDailyActivity(
    ownerLogin: string,
    repos: RepositoryMetaRow[]
): Promise<number> {
    // Clear existing owner-level rows (repo_id IS NULL)
    await query(
        "DELETE FROM daily_activity WHERE owner_login = $1 AND repo_id IS NULL",
        [ownerLogin]
    );

    const ownerDateMap = new Map<string, UpsertDailyActivityInput>();

    // Query all commits for the owner in one go (count only — LOC comes from merged PRs)
    const allCommits = await getCommitsByOwner(ownerLogin);
    for (const c of allCommits) {
        const date = toDateString(c.committed_at);
        if (!ownerDateMap.has(date)) {
            ownerDateMap.set(date, {
                owner_login: ownerLogin,
                repo_id: null,
                contributor_login: null,
                date,
                commit_count: 0, additions: 0, deletions: 0,
                pr_opened: 0, pr_merged: 0, pr_closed: 0,
                workflow_runs: 0, workflow_failures: 0,
            });
        }
        ownerDateMap.get(date)!.commit_count++;
    }

    // Add PR data to owner-level rows
    for (const repo of repos) {
        const prs = await getPrsByRepo(repo.id);
        for (const pr of prs) {
            const createdDate = toDateString(pr.created_at);
            if (!ownerDateMap.has(createdDate)) {
                ownerDateMap.set(createdDate, {
                    owner_login: ownerLogin,
                    repo_id: null,
                    contributor_login: null,
                    date: createdDate,
                    commit_count: 0, additions: 0, deletions: 0,
                    pr_opened: 0, pr_merged: 0, pr_closed: 0,
                    workflow_runs: 0, workflow_failures: 0,
                });
            }
            ownerDateMap.get(createdDate)!.pr_opened++;

            if (pr.merged_at) {
                const mergedDate = toDateString(pr.merged_at);
                if (!ownerDateMap.has(mergedDate)) {
                    ownerDateMap.set(mergedDate, {
                        owner_login: ownerLogin,
                        repo_id: null,
                        contributor_login: null,
                        date: mergedDate,
                        commit_count: 0, additions: 0, deletions: 0,
                        pr_opened: 0, pr_merged: 0, pr_closed: 0,
                        workflow_runs: 0, workflow_failures: 0,
                    });
                }
                const mergedEntry = ownerDateMap.get(mergedDate)!;
                mergedEntry.pr_merged++;
                // LOC attributed to merge date
                mergedEntry.additions += pr.additions;
                mergedEntry.deletions += pr.deletions;
            } else if (pr.closed_at) {
                const closedDate = toDateString(pr.closed_at);
                if (!ownerDateMap.has(closedDate)) {
                    ownerDateMap.set(closedDate, {
                        owner_login: ownerLogin,
                        repo_id: null,
                        contributor_login: null,
                        date: closedDate,
                        commit_count: 0, additions: 0, deletions: 0,
                        pr_opened: 0, pr_merged: 0, pr_closed: 0,
                        workflow_runs: 0, workflow_failures: 0,
                    });
                }
                ownerDateMap.get(closedDate)!.pr_closed++;
            }
        }
    }

    const ownerRows = Array.from(ownerDateMap.values());
    if (ownerRows.length > 0) {
        await upsertDailyActivity(ownerRows);
    }

    return ownerRows.length;
}

// ── Contributor Snapshots ────────────────────────────────────────────────────────

/**
 * Rebuild contributor_snapshot for all contributors across an owner's repos.
 * Groups commits and PRs by author login across all repos.
 */
async function rebuildContributorSnapshots(
    ownerLogin: string,
    repos: RepositoryMetaRow[]
): Promise<number> {
    // Accumulate per-contributor data across all repos
    const contribMap = new Map<string, {
        avatar_url: string | null;
        html_url: string | null;
        totalCommits: number;
        totalAdditions: number;
        totalDeletions: number;
        totalPRs: number;
        totalPRsMerged: number;
        repos: Set<string>;
        commitDates: Set<string>;
        firstCommitAt: Date | null;
        lastCommitAt: Date | null;
    }>();

    const ensureContrib = (login: string) => {
        if (!contribMap.has(login)) {
            contribMap.set(login, {
                avatar_url: null,
                html_url: `https://github.com/${login}`,
                totalCommits: 0,
                totalAdditions: 0,
                totalDeletions: 0,
                totalPRs: 0,
                totalPRsMerged: 0,
                repos: new Set(),
                commitDates: new Set(),
                firstCommitAt: null,
                lastCommitAt: null,
            });
        }
        return contribMap.get(login)!;
    };

    for (const repo of repos) {
        const commits = await getCommitsByRepo(repo.id);
        const prs = await getPrsByRepo(repo.id);

        // Process commits (count only — LOC comes from merged PRs)
        for (const c of commits) {
            if (!c.author_login) continue;
            const entry = ensureContrib(c.author_login);
            entry.totalCommits++;
            entry.repos.add(repo.name);
            entry.commitDates.add(toDateString(c.committed_at));

            // Track first/last commit
            if (!entry.firstCommitAt || c.committed_at < entry.firstCommitAt) {
                entry.firstCommitAt = c.committed_at;
            }
            if (!entry.lastCommitAt || c.committed_at > entry.lastCommitAt) {
                entry.lastCommitAt = c.committed_at;
            }
        }

        // Process PRs (LOC attributed from merged PRs)
        for (const pr of prs) {
            if (!pr.author_login) continue;
            const entry = ensureContrib(pr.author_login);
            entry.totalPRs++;
            if (pr.merged_at) {
                entry.totalPRsMerged++;
                entry.totalAdditions += pr.additions;
                entry.totalDeletions += pr.deletions;
            }
            entry.repos.add(repo.name);
        }
    }

    // Enrich avatar URLs from contributor_profile table
    if (contribMap.size > 0) {
        const profileRows = await query<{ login: string; avatar_url: string | null; html_url: string | null }>(
            `SELECT login, avatar_url, html_url FROM contributor_profile
             WHERE login = ANY($1)`,
            [Array.from(contribMap.keys())]
        );
        for (const p of profileRows) {
            const entry = contribMap.get(p.login);
            if (entry) {
                entry.avatar_url = p.avatar_url;
                if (p.html_url) entry.html_url = p.html_url;
            }
        }
    }

    // Upsert contributor snapshots
    let count = 0;
    for (const [login, data] of contribMap) {
        const snap: UpsertContributorSnapshotInput = {
            owner_login: ownerLogin,
            contributor_login: login,
            avatar_url: data.avatar_url,
            html_url: data.html_url,
            total_commits: data.totalCommits,
            total_additions: data.totalAdditions,
            total_deletions: data.totalDeletions,
            total_prs: data.totalPRs,
            total_prs_merged: data.totalPRsMerged,
            repos: Array.from(data.repos),
            repo_count: data.repos.size,
            workflow_runs_triggered: 0,    // Deferred: workflow ingestion
            workflow_failure_rate: 0,
            first_commit_at: data.firstCommitAt,
            last_commit_at: data.lastCommitAt,
            active_days: data.commitDates.size,
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
async function rebuildOwnerSnapshot(
    ownerLogin: string,
    repos: RepositoryMetaRow[]
): Promise<void> {
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

    // Calculate streaks from all commits
    const allCommits = await getCommitsByOwner(ownerLogin);
    const { longestStreak, currentStreak, avgCommitsPerDay } = calculateStreaks(allCommits);

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
        deletions: r.total_deletions,
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
        total_workflow_runs: 0,          // Deferred: workflow ingestion
        workflow_success_rate: 0,
        avg_workflow_duration: 0,
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
            color: LANGUAGE_COLORS[language] ?? "#8b8b8b",
        }))
        .sort((a, b) => b.count - a.count);
}

// ── Helper: Streak Calculation ───────────────────────────────────────────────────
// Port of the streak logic from the old github.ts (lines 1072-1123)

function calculateStreaks(commits: CommitEventRow[]): {
    longestStreak: number;
    currentStreak: number;
    avgCommitsPerDay: number;
} {
    if (commits.length === 0) {
        return { longestStreak: 0, currentStreak: 0, avgCommitsPerDay: 0 };
    }

    // Count commits per date
    const dateCounts = new Map<string, number>();
    for (const commit of commits) {
        const date = toDateString(commit.committed_at);
        dateCounts.set(date, (dateCounts.get(date) ?? 0) + 1);
    }

    const sortedDates = Array.from(dateCounts.keys()).sort();
    if (sortedDates.length === 0) {
        return { longestStreak: 0, currentStreak: 0, avgCommitsPerDay: 0 };
    }

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
    const avgCommitsPerDay = Math.round((commits.length / daysDiff) * 100) / 100;

    return { longestStreak, currentStreak, avgCommitsPerDay };
}
