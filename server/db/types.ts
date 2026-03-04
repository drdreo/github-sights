// ── Database Row Types ──────────────────────────────────────────────────────────
//
// TypeScript interfaces mirroring every table in the schema.
// These are "row types" — what you get back from a SELECT.
// Used by query functions for type safety.

// ── Layer 1: Identity ────────────────────────────────────────────────────────────

export interface OwnerRow {
    login: string;
    type: "user" | "org";
    avatar_url: string | null;
    html_url: string | null;
    last_synced_at: Date | null;
    created_at: Date;
}

export interface RepositoryMetaRow {
    id: number;
    owner_login: string;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string | null;
    is_private: boolean;
    is_fork: boolean;
    language: string | null;
    default_branch: string | null;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    created_at: Date | null;
    updated_at: Date | null;
    pushed_at: Date | null;
}

export interface ContributorProfileRow {
    login: string;
    avatar_url: string | null;
    html_url: string | null;
    name: string | null;
    email: string | null;
    updated_at: Date;
}

export interface OwnerConfigRow {
    owner: string;
    token: string;
    owner_type: "user" | "org";
    updated_at: Date;
}

// ── Layer 2: Events ──────────────────────────────────────────────────────────────

export interface CommitEventRow {
    sha: string;
    repo_id: number;
    author_login: string | null;
    committer_login: string | null;
    message: string | null;
    html_url: string | null;
    committed_at: Date;
    additions: number;
    deletions: number;
    ingested_at: Date;
}

export interface PrEventRow {
    id: number;
    repo_id: number;
    number: number;
    author_login: string | null;
    title: string | null;
    state: "open" | "closed";
    is_draft: boolean;
    html_url: string | null;
    base_ref: string | null;
    head_ref: string | null;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: Date;
    closed_at: Date | null;
    merged_at: Date | null;
    ingested_at: Date;
}

export interface WorkflowEventRow {
    id: number;
    repo_id: number;
    workflow_name: string | null;
    workflow_path: string | null;
    actor_login: string | null;
    run_number: number | null;
    status: "completed" | "in_progress" | "queued" | null;
    conclusion: "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | "neutral" | "stale" | null;
    head_branch: string | null;
    head_sha: string | null;
    duration_seconds: number | null;
    created_at: Date;
    ingested_at: Date;
}

// ── Layer 3: Snapshots ───────────────────────────────────────────────────────────

export interface SnapshotContributor {
    login: string;
    avatar_url: string;
    commits: number;
    additions: number;
    deletions: number;
}

export interface LanguageBreakdownEntry {
    language: string;
    count: number;
    color: string;
}

export interface OwnerSnapshotRow {
    owner_login: string;
    total_repos: number;
    total_commits: number;
    total_prs: number;
    open_prs: number;
    merged_prs: number;
    total_additions: string;
    total_deletions: string;
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
    computed_at: Date;
}

export interface RepoSnapshotRow {
    repo_id: number;
    owner_login: string;
    name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    updated_at: Date | null;
    pushed_at: Date | null;
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
    computed_at: Date;
}

export interface ContributorSnapshotRow {
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
    first_commit_at: Date | null;
    last_commit_at: Date | null;
    active_days: number;
    computed_at: Date;
}

export interface DailyActivityRow {
    owner_login: string;
    repo_id: number | null;
    contributor_login: string | null;
    date: string;
    commit_count: number;
    additions: number;
    deletions: number;
    pr_opened: number;
    pr_merged: number;
    pr_closed: number;
    workflow_runs: number;
    workflow_failures: number;
    computed_at: Date;
}

export interface SyncStateRow {
    owner_login: string;
    repo_id: number;
    resource_type: "commits" | "pulls" | "workflows";
    last_synced_at: Date;
    last_cursor: string | null;
    error_count: number;
    last_error: string | null;
}

// ── Schema Migrations ────────────────────────────────────────────────────────────

export interface SchemaMigrationRow {
    name: string;
    applied_at: Date;
}
