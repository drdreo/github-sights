// ── Aggregate Module ─────────────────────────────────────────────────────────────
//
// Rebuilds snapshot tables from raw event data.
// Idempotent: can be re-run at any time to rebuild all snapshots.
// Pipeline order:
//   1. daily_activity   (GROUP BY date from commit_event + pr_event)
//   2. repo_snapshot    (COUNT/SUM per repo from events)
//   3. contributor_snapshot (SUM across repos per contributor)
//   4. owner_snapshot   (aggregate from repo_snapshots + streaks from daily_activity)
//
// Steps 2-4 can run after step 1 completes.

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
    clearDailyActivity,
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

// ── Types ────────────────────────────────────────────────────────────────────────

export interface AggregateResult {
    owner: string;
    dailyActivityRows: number;
    repoSnapshots: number;
    contributorSnapshots: number;
    ownerSnapshotUpdated: boolean;
}

// ── Main Pipeline ────────────────────────────────────────────────────────────────

/**
 * Full aggregation pipeline for an owner.
 * Rebuilds all snapshot tables from raw events.
 */
export async function aggregateOwner(ownerLogin: string): Promise<AggregateResult> {
    const repos = await getReposByOwner(ownerLogin);
    const nonForkRepos = repos.filter((r) => !r.is_fork);

    console.log(`[aggregate] ${ownerLogin}: starting aggregation for ${nonForkRepos.length} repos`);

    // Step 1: Rebuild daily_activity
    const dailyActivityRows = await rebuildDailyActivity(ownerLogin, nonForkRepos);
    console.log(`[aggregate] ${ownerLogin}: rebuilt ${dailyActivityRows} daily activity rows`);

    // Steps 2-4 can run after daily_activity is ready
    // Step 2: Rebuild repo_snapshot for each repo
    const repoSnapshots = await rebuildRepoSnapshots(ownerLogin, nonForkRepos);
    console.log(`[aggregate] ${ownerLogin}: rebuilt ${repoSnapshots} repo snapshots`);

    // Step 3: Rebuild contributor_snapshot
    const contributorSnapshots = await rebuildContributorSnapshots(ownerLogin, nonForkRepos);
    console.log(`[aggregate] ${ownerLogin}: rebuilt ${contributorSnapshots} contributor snapshots`);

    // Step 4: Rebuild owner_snapshot
    await rebuildOwnerSnapshot(ownerLogin, nonForkRepos);
    console.log(`[aggregate] ${ownerLogin}: owner snapshot updated`);

    return {
        owner: ownerLogin,
        dailyActivityRows,
        repoSnapshots,
        contributorSnapshots,
        ownerSnapshotUpdated: true,
    };
}

// ── Step 1: Daily Activity ───────────────────────────────────────────────────────

/**
 * Rebuild daily_activity rows from raw commit_event and pr_event tables.
 * Clears existing rows for the owner before rebuilding.
 */
async function rebuildDailyActivity(
    ownerLogin: string,
    repos: RepositoryMetaRow[]
): Promise<number> {
    // Clear existing daily_activity for this owner
    await clearDailyActivity(ownerLogin);

    let totalRows = 0;

    for (const repo of repos) {
        // Get all commits for this repo
        const commits = await getCommitsByRepo(repo.id);
        // Get all PRs for this repo
        const prs = await getPrsByRepo(repo.id);

        // Build per-date maps
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

        // Aggregate commits by date
        for (const c of commits) {
            const date = c.committed_at.split("T")[0];
            const entry = ensureDate(date);
            entry.commits++;
            entry.additions += c.additions;
            entry.deletions += c.deletions;
        }

        // Aggregate PRs by date
        for (const pr of prs) {
            const createdDate = pr.created_at.split("T")[0];
            ensureDate(createdDate).prOpened++;

            if (pr.merged_at) {
                const mergedDate = pr.merged_at.split("T")[0];
                ensureDate(mergedDate).prMerged++;
            } else if (pr.closed_at) {
                const closedDate = pr.closed_at.split("T")[0];
                ensureDate(closedDate).prClosed++;
            }
        }

        // Convert to upsert inputs — per-repo rows
        const repoRows: UpsertDailyActivityInput[] = Array.from(dateMap.entries()).map(
            ([date, data]) => ({
                owner_login: ownerLogin,
                repo_id: repo.id,
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
            })
        );

        if (repoRows.length > 0) {
            await upsertDailyActivity(repoRows);
            totalRows += repoRows.length;
        }
    }

    // Build owner-level rows (aggregate across all repos per date)
    const ownerDateMap = new Map<string, UpsertDailyActivityInput>();

    // Query all commits for the owner in one go
    const allCommits = await getCommitsByOwner(ownerLogin);
    for (const c of allCommits) {
        const date = c.committed_at.split("T")[0];
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
        const entry = ownerDateMap.get(date)!;
        entry.commit_count++;
        entry.additions += c.additions;
        entry.deletions += c.deletions;
    }

    // Add PR data to owner-level rows
    for (const repo of repos) {
        const prs = await getPrsByRepo(repo.id);
        for (const pr of prs) {
            const createdDate = pr.created_at.split("T")[0];
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
                const mergedDate = pr.merged_at.split("T")[0];
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
                ownerDateMap.get(mergedDate)!.pr_merged++;
            } else if (pr.closed_at) {
                const closedDate = pr.closed_at.split("T")[0];
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
        totalRows += ownerRows.length;
    }

    return totalRows;
}

// ── Step 2: Repo Snapshots ───────────────────────────────────────────────────────

/**
 * Rebuild repo_snapshot for each non-fork repo.
 * Aggregates commit/PR counts from event tables.
 */
async function rebuildRepoSnapshots(
    ownerLogin: string,
    repos: RepositoryMetaRow[]
): Promise<number> {
    let count = 0;

    for (const repo of repos) {
        const commits = await getCommitsByRepo(repo.id);
        const prs = await getPrsByRepo(repo.id);
        const contribStats = await getContributorStatsByRepo(repo.id);

        const openPrs = prs.filter((pr) => pr.state === "open").length;
        const mergedPrs = prs.filter((pr) => pr.merged_at !== null).length;

        const totalAdditions = commits.reduce((sum, c) => sum + c.additions, 0);
        const totalDeletions = commits.reduce((sum, c) => sum + c.deletions, 0);

        // Build top contributors for this repo
        const topContributors: SnapshotContributor[] = contribStats
            .slice(0, 10)
            .map((cs) => ({
                login: cs.login,
                avatar_url: "", // Will be enriched from contributor_profile if needed
                commits: cs.commits,
                additions: cs.additions,
                deletions: cs.deletions,
            }));

        // Enrich avatar URLs from the commit data
        const avatarMap = new Map<string, string>();
        for (const c of commits) {
            if (c.author_login) {
                // We don't have avatar_url in commit_event, but contributor_profile has it
                // For now, leave empty — the route layer can join with contributor_profile
            }
        }

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
            merged_prs: mergedPrs,
            total_additions: totalAdditions,
            total_deletions: totalDeletions,
            contributor_count: contribStats.length,
            ci_success_rate: 0,          // Deferred: workflow ingestion not yet implemented
            ci_avg_duration_seconds: 0,
            last_ci_conclusion: null,
            top_contributors: topContributors,
        };

        await upsertRepoSnapshot(snap);
        count++;
    }

    return count;
}

// ── Step 3: Contributor Snapshots ─────────────────────────────────────────────────

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
        firstCommitAt: string | null;
        lastCommitAt: string | null;
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

        // Process commits
        for (const c of commits) {
            if (!c.author_login) continue;
            const entry = ensureContrib(c.author_login);
            entry.totalCommits++;
            entry.totalAdditions += c.additions;
            entry.totalDeletions += c.deletions;
            entry.repos.add(repo.name);
            entry.commitDates.add(c.committed_at.split("T")[0]);

            // Track first/last commit
            if (!entry.firstCommitAt || c.committed_at < entry.firstCommitAt) {
                entry.firstCommitAt = c.committed_at;
            }
            if (!entry.lastCommitAt || c.committed_at > entry.lastCommitAt) {
                entry.lastCommitAt = c.committed_at;
            }
        }

        // Process PRs
        for (const pr of prs) {
            if (!pr.author_login) continue;
            const entry = ensureContrib(pr.author_login);
            entry.totalPRs++;
            if (pr.merged_at) entry.totalPRsMerged++;
            entry.repos.add(repo.name);
        }
    }

    // Enrich avatar URLs from contributor_profile table
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

// ── Step 4: Owner Snapshot ───────────────────────────────────────────────────────

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
        const date = commit.committed_at.split("T")[0];
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
