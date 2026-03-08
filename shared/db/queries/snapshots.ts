// ── Snapshot Queries ──────────────────────────────────────────────────────────────
//
// Upsert and query operations for all snapshot tables.
// Snapshots are rebuilt by the aggregation pipeline after each sync.

import { query, queryOne, execute } from "../pool.ts";
import type {
    OwnerSnapshotRow,
    RepoSnapshotRow,
    ContributorSnapshotRow,
    SnapshotContributor,
    LanguageBreakdownEntry
} from "../types.ts";

// ── Owner Snapshot ───────────────────────────────────────────────────────────────

export interface UpsertOwnerSnapshotInput {
    owner_login: string;
    total_repos: number;
    total_commits: number;
    total_prs: number;
    open_prs: number;
    merged_prs: number;
    total_additions: number;
    total_deletions: number;
    unique_contributors: number;
    most_active_repo_name: string | null;
    most_active_repo_commits: number;
    longest_streak: number;
    current_streak: number;
    avg_commits_per_day: number;
    top_contributors: SnapshotContributor[];
    language_breakdown: LanguageBreakdownEntry[];
    total_workflow_runs: number;
    workflow_success_rate: number;
    avg_workflow_duration: number;
}

export async function upsertOwnerSnapshot(snap: UpsertOwnerSnapshotInput): Promise<void> {
    await execute(
        `INSERT INTO owner_snapshot (
            owner_login, total_repos, total_commits, total_prs, open_prs, merged_prs,
            total_additions, total_deletions, unique_contributors,
            most_active_repo_name, most_active_repo_commits,
            longest_streak, current_streak, avg_commits_per_day,
            top_contributors, language_breakdown,
            total_workflow_runs, workflow_success_rate, avg_workflow_duration,
            computed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
         ON CONFLICT (owner_login) DO UPDATE SET
            total_repos=$2, total_commits=$3, total_prs=$4, open_prs=$5, merged_prs=$6,
            total_additions=$7, total_deletions=$8, unique_contributors=$9,
            most_active_repo_name=$10, most_active_repo_commits=$11,
            longest_streak=$12, current_streak=$13, avg_commits_per_day=$14,
            top_contributors=$15, language_breakdown=$16,
            total_workflow_runs=$17, workflow_success_rate=$18, avg_workflow_duration=$19,
            computed_at=NOW()`,
        [
            snap.owner_login,
            snap.total_repos,
            snap.total_commits,
            snap.total_prs,
            snap.open_prs,
            snap.merged_prs,
            snap.total_additions,
            snap.total_deletions,
            snap.unique_contributors,
            snap.most_active_repo_name,
            snap.most_active_repo_commits,
            snap.longest_streak,
            snap.current_streak,
            snap.avg_commits_per_day,
            JSON.stringify(snap.top_contributors),
            JSON.stringify(snap.language_breakdown),
            snap.total_workflow_runs,
            snap.workflow_success_rate,
            snap.avg_workflow_duration
        ]
    );
}

export async function getOwnerSnapshot(ownerLogin: string): Promise<OwnerSnapshotRow | null> {
    return queryOne<OwnerSnapshotRow>("SELECT * FROM owner_snapshot WHERE owner_login = $1", [
        ownerLogin
    ]);
}

// ── Repo Snapshot ────────────────────────────────────────────────────────────────

export interface UpsertRepoSnapshotInput {
    repo_id: number;
    owner_login: string;
    name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    updated_at: Date | string | null;
    pushed_at: Date | string | null;
    total_commits: number;
    total_prs: number;
    open_prs: number;
    merged_prs: number;
    total_additions: number;
    total_deletions: number;
    contributor_count: number;
    ci_success_rate: number;
    ci_avg_duration_seconds: number;
    last_ci_conclusion: string | null;
    top_contributors: SnapshotContributor[];
}

export async function upsertRepoSnapshot(snap: UpsertRepoSnapshotInput): Promise<void> {
    await execute(
        `INSERT INTO repo_snapshot (
            repo_id, owner_login, name, description, language,
            stargazers_count, forks_count, open_issues_count, updated_at, pushed_at,
            total_commits, total_prs, open_prs, merged_prs,
            total_additions, total_deletions, contributor_count,
            ci_success_rate, ci_avg_duration_seconds, last_ci_conclusion,
            top_contributors, computed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
         ON CONFLICT (repo_id) DO UPDATE SET
            owner_login=$2, name=$3, description=$4, language=$5,
            stargazers_count=$6, forks_count=$7, open_issues_count=$8, updated_at=$9, pushed_at=$10,
            total_commits=$11, total_prs=$12, open_prs=$13, merged_prs=$14,
            total_additions=$15, total_deletions=$16, contributor_count=$17,
            ci_success_rate=$18, ci_avg_duration_seconds=$19, last_ci_conclusion=$20,
            top_contributors=$21, computed_at=NOW()`,
        [
            snap.repo_id,
            snap.owner_login,
            snap.name,
            snap.description,
            snap.language,
            snap.stargazers_count,
            snap.forks_count,
            snap.open_issues_count,
            snap.updated_at,
            snap.pushed_at,
            snap.total_commits,
            snap.total_prs,
            snap.open_prs,
            snap.merged_prs,
            snap.total_additions,
            snap.total_deletions,
            snap.contributor_count,
            snap.ci_success_rate,
            snap.ci_avg_duration_seconds,
            snap.last_ci_conclusion,
            JSON.stringify(snap.top_contributors)
        ]
    );
}

export async function getRepoSnapshot(repoId: number): Promise<RepoSnapshotRow | null> {
    return queryOne<RepoSnapshotRow>("SELECT * FROM repo_snapshot WHERE repo_id = $1", [repoId]);
}

export async function getRepoSnapshotByName(
    ownerLogin: string,
    repoName: string
): Promise<RepoSnapshotRow | null> {
    return queryOne<RepoSnapshotRow>(
        "SELECT * FROM repo_snapshot WHERE owner_login = $1 AND name = $2",
        [ownerLogin, repoName]
    );
}

export async function getRepoSnapshotsByOwner(ownerLogin: string): Promise<RepoSnapshotRow[]> {
    return query<RepoSnapshotRow>(
        `SELECT * FROM repo_snapshot
         WHERE owner_login = $1
         ORDER BY pushed_at DESC NULLS LAST`,
        [ownerLogin]
    );
}

// ── Contributor Snapshot ─────────────────────────────────────────────────────────

export interface UpsertContributorSnapshotInput {
    owner_login: string;
    contributor_login: string;
    avatar_url: string | null;
    html_url: string | null;
    total_commits: number;
    total_additions: number;
    total_deletions: number;
    total_prs: number;
    total_prs_merged: number;
    repos: string[];
    repo_count: number;
    workflow_runs_triggered: number;
    workflow_failure_rate: number;
    first_commit_at: Date | string | null;
    last_commit_at: Date | string | null;
    active_days: number;
}

export async function upsertContributorSnapshot(
    snap: UpsertContributorSnapshotInput
): Promise<void> {
    await execute(
        `INSERT INTO contributor_snapshot (
            owner_login, contributor_login, avatar_url, html_url,
            total_commits, total_additions, total_deletions,
            total_prs, total_prs_merged,
            repos, repo_count,
            workflow_runs_triggered, workflow_failure_rate,
            first_commit_at, last_commit_at, active_days,
            computed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
         ON CONFLICT (owner_login, contributor_login) DO UPDATE SET
            avatar_url=COALESCE($3, contributor_snapshot.avatar_url),
            html_url=COALESCE($4, contributor_snapshot.html_url),
            total_commits=$5, total_additions=$6, total_deletions=$7,
            total_prs=$8, total_prs_merged=$9,
            repos=$10, repo_count=$11,
            workflow_runs_triggered=$12, workflow_failure_rate=$13,
            first_commit_at=$14, last_commit_at=$15, active_days=$16,
            computed_at=NOW()`,
        [
            snap.owner_login,
            snap.contributor_login,
            snap.avatar_url,
            snap.html_url,
            snap.total_commits,
            snap.total_additions,
            snap.total_deletions,
            snap.total_prs,
            snap.total_prs_merged,
            JSON.stringify(snap.repos),
            snap.repo_count,
            snap.workflow_runs_triggered,
            snap.workflow_failure_rate,
            snap.first_commit_at,
            snap.last_commit_at,
            snap.active_days
        ]
    );
}

export async function getContributorSnapshotsByOwner(
    ownerLogin: string
): Promise<ContributorSnapshotRow[]> {
    return query<ContributorSnapshotRow>(
        `SELECT * FROM contributor_snapshot
         WHERE owner_login = $1
         ORDER BY total_commits DESC`,
        [ownerLogin]
    );
}

/** Get a single contributor snapshot. */
export async function getContributorSnapshot(
    ownerLogin: string,
    contributorLogin: string
): Promise<ContributorSnapshotRow | null> {
    return queryOne<ContributorSnapshotRow>(
        "SELECT * FROM contributor_snapshot WHERE owner_login = $1 AND contributor_login = $2",
        [ownerLogin, contributorLogin]
    );
}

/** Get contributors for a specific repo (filtering by repos JSONB array). */
export async function getContributorSnapshotsByRepo(
    ownerLogin: string,
    repoName: string
): Promise<ContributorSnapshotRow[]> {
    return query<ContributorSnapshotRow>(
        `SELECT * FROM contributor_snapshot
         WHERE owner_login = $1 AND repos @> $2::JSONB
         ORDER BY total_commits DESC`,
        [ownerLogin, JSON.stringify([repoName])]
    );
}
