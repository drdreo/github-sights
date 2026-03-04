// ── GitHub Client ────────────────────────────────────────────────────────────────
//
// Stateless Octokit wrappers — pure functions that fetch from GitHub API.
// NO database access, NO caching. Just HTTP calls and type mapping.
// Used by the ingest module to fill event tables.

import { Octokit } from "octokit";
import { githubApiError } from "../errors.ts";
// ── Types ────────────────────────────────────────────────────────────────────────

export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    private: boolean;
    fork: boolean;
    language: string | null;
    default_branch: string;
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    created_at: string;
    updated_at: string;
    pushed_at: string;
    owner: { login: string; avatar_url: string; html_url: string };
}

export interface GitHubCommit {
    sha: string;
    message: string;
    html_url: string;
    committed_at: string;
    author_login: string | null;
    author_name: string;
    author_email: string;
    author_avatar_url: string | null;
    committer_login: string | null;
    additions: number;
    deletions: number;
}

export interface GitHubPR {
    id: number;
    number: number;
    title: string;
    state: "open" | "closed";
    html_url: string;
    is_draft: boolean;
    author_login: string | null;
    author_avatar_url: string | null;
    base_ref: string;
    head_ref: string;
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    closed_at: string | null;
    merged_at: string | null;
    updated_at: string;
}

// ── Excluded Repos ───────────────────────────────────────────────────────────────

const DEFAULT_EXCLUDED = ["lumicode"];

function getExcludedRepos(): Set<string> {
    const envVal = typeof Deno !== "undefined" ? Deno.env.get("EXCLUDED_REPOS") : undefined;
    const names = envVal
        ? envVal.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
        : DEFAULT_EXCLUDED.map((s) => s.toLowerCase());
    return new Set(names);
}

const excludedRepos = getExcludedRepos();

export function isRepoExcluded(repoName: string): boolean {
    return excludedRepos.has(repoName.toLowerCase());
}

// ── Rate Limit Tracking ──────────────────────────────────────────────────────────

/** Minimum remaining requests before we pause and wait for reset. */
const RATE_LIMIT_FLOOR = 100;

export interface RateLimitState {
    remaining: number;
    limit: number;
    resetAt: Date;
}

/**
 * Mutable rate limit tracker. Updated passively from response headers
 * on every Octokit request. One instance per Octokit client.
 */
class RateLimitBudget {
    remaining = Infinity;
    limit = 5000;
    resetAt = new Date(0);

    update(headers: Record<string, string | undefined>): void {
        const rem = headers["x-ratelimit-remaining"];
        const lim = headers["x-ratelimit-limit"];
        const reset = headers["x-ratelimit-reset"];
        if (rem != null) this.remaining = Number(rem);
        if (lim != null) this.limit = Number(lim);
        if (reset != null) this.resetAt = new Date(Number(reset) * 1000);
    }

    get state(): RateLimitState {
        return { remaining: this.remaining, limit: this.limit, resetAt: this.resetAt };
    }

    /** True when remaining budget is below the safety floor. */
    get exhausted(): boolean {
        return this.remaining < RATE_LIMIT_FLOOR;
    }

    /** Milliseconds until the rate limit window resets. Returns 0 if already reset. */
    get msUntilReset(): number {
        return Math.max(0, this.resetAt.getTime() - Date.now());
    }
}

/** Map from Octokit instance → its budget tracker. */
const budgets = new WeakMap<Octokit, RateLimitBudget>();

function getBudget(octokit: Octokit): RateLimitBudget {
    let b = budgets.get(octokit);
    if (!b) {
        b = new RateLimitBudget();
        budgets.set(octokit, b);
    }
    return b;
}

/**
 * Check rate limit budget and sleep until reset if exhausted.
 * Call this before expensive API operations (pagination loops, enrichment).
 */
export async function guardRateLimit(octokit: Octokit): Promise<void> {
    const budget = getBudget(octokit);
    if (!budget.exhausted) return;

    const waitMs = budget.msUntilReset + 1000; // 1s buffer
    const waitMin = (waitMs / 60000).toFixed(1);
    console.warn(
        `[rate-limit] Budget low: ${budget.remaining}/${budget.limit} remaining. ` +
        `Pausing ${waitMin}min until reset at ${budget.resetAt.toISOString()}`
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    // After waking, re-check via explicit API call
    await refreshRateLimit(octokit);
}

/**
 * Fetch current rate limit from GitHub API and update the tracker.
 * Costs 0 API calls (rate_limit endpoint is free).
 */
export async function refreshRateLimit(octokit: Octokit): Promise<RateLimitState> {
    const { data } = await octokit.rest.rateLimit.get();
    const budget = getBudget(octokit);
    budget.remaining = data.rate.remaining;
    budget.limit = data.rate.limit;
    budget.resetAt = new Date(data.rate.reset * 1000);
    return budget.state;
}

/** Get the current cached rate limit state (no API call). */
export function getRateLimitState(octokit: Octokit): RateLimitState {
    return getBudget(octokit).state;
}

// ── Client Factory ───────────────────────────────────────────────────────────────

export function createOctokit(token: string): Octokit {
    const octokit = new Octokit({
        auth: token,
        throttle: {
            onRateLimit: (
                retryAfter: number,
                options: { method: string; url: string },
                _octokit: Octokit,
                retryCount: number
            ) => {
                console.warn(
                    `[rate-limit] ${options.method} ${options.url} — retry after ${retryAfter}s (attempt ${retryCount + 1})`
                );
                return retryCount < 2;
            },
            onSecondaryRateLimit: (
                retryAfter: number,
                options: { method: string; url: string },
                _octokit: Octokit,
                retryCount: number
            ) => {
                console.warn(
                    `[secondary-rate-limit] ${options.method} ${options.url} — retry after ${retryAfter}s (attempt ${retryCount + 1})`
                );
                return retryCount < 1;
            },
        },
    });

    // Passively track rate limit headers on every response
    octokit.hook.after("request", (response) => {
        const budget = getBudget(octokit);
        // deno-lint-ignore no-explicit-any
        budget.update((response as any).headers ?? {});
    });

    return octokit;
}

// ── API Calls ────────────────────────────────────────────────────────────────────

/** Verify a token by calling /user. Returns the authenticated user's login. */
export async function verifyToken(
    octokit: Octokit
): Promise<{ login: string; scopes: string[] }> {
    console.log("[github] Verifying token");
    const response = await octokit.rest.users.getAuthenticated();
    const scopes = (response.headers["x-oauth-scopes"] || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    return { login: response.data.login, scopes };
}

/** List all repos for a user or org, excluding forks and blacklisted repos. */
export async function fetchRepos(
    octokit: Octokit,
    owner: string,
    ownerType: "user" | "org"
): Promise<GitHubRepo[]> {
    try {
        // deno-lint-ignore no-explicit-any
        const raw: any[] =
            ownerType === "org"
                ? await octokit.paginate(octokit.rest.repos.listForOrg, {
                      org: owner,
                      per_page: 100,
                      type: "all",
                  })
                : await octokit.paginate(octokit.rest.repos.listForUser, {
                      username: owner,
                      per_page: 100,
                      sort: "updated",
                  });

        console.log(`[github] GET repos for ${ownerType}:${owner} → ${raw.length} repos`);

        return raw
            // deno-lint-ignore no-explicit-any
            .map((r: any) => ({
                id: r.id,
                name: r.name,
                full_name: r.full_name,
                description: r.description,
                html_url: r.html_url,
                private: r.private,
                fork: !!r.fork,
                language: r.language,
                default_branch: r.default_branch,
                stargazers_count: r.stargazers_count,
                forks_count: r.forks_count,
                open_issues_count: r.open_issues_count,
                created_at: r.created_at,
                updated_at: r.updated_at,
                pushed_at: r.pushed_at,
                owner: {
                    login: r.owner.login,
                    avatar_url: r.owner.avatar_url,
                    html_url: r.owner.html_url,
                },
            }))
            .filter((r) => !excludedRepos.has(r.name.toLowerCase()));
    } catch (error) {
        throw githubApiError(`list repos for ${ownerType}:${owner}`, error);
    }
}

/** Fetch commits for a single repo, optionally filtered by date range. */
export async function fetchCommits(
    octokit: Octokit,
    owner: string,
    repo: string,
    options?: { since?: string; until?: string }
): Promise<GitHubCommit[]> {
    try {
        // deno-lint-ignore no-explicit-any
        const params: any = { owner, repo, per_page: 100 };
        if (options?.since) params.since = options.since;
        if (options?.until) params.until = options.until;

        // Guard rate limit before expensive pagination
        await guardRateLimit(octokit);

        const raw = await octokit.paginate(
            octokit.rest.repos.listCommits,
            params
        );

        console.log(`[github] GET commits for ${owner}/${repo} → ${raw.length} commits${options?.since ? ` (since ${options.since.split('T')[0]})` : ''}`);

        // deno-lint-ignore no-explicit-any
        return raw.map((c: any) => ({
            sha: c.sha,
            message: c.commit.message,
            html_url: c.html_url,
            committed_at: c.commit.committer?.date || c.commit.author?.date || new Date().toISOString(),
            author_login: c.author?.login ?? null,
            author_name: c.commit.author?.name || "Unknown",
            author_email: c.commit.author?.email || "",
            author_avatar_url: c.author?.avatar_url ?? null,
            committer_login: c.committer?.login ?? null,
            // NOTE: GitHub's list commits endpoint does NOT return stats (additions/deletions).
            // These will always be 0. LOC is sourced from merged PR stats instead.
            // Per-commit enrichment via GET /repos/{owner}/{repo}/commits/{sha} is possible
            // but costs 1 API call per commit — deferred until spare budget is available.
            additions: c.stats?.additions ?? 0,
            deletions: c.stats?.deletions ?? 0,
        }));
    } catch (error) {
        throw githubApiError(`list commits for ${owner}/${repo}`, error);
    }
}

/**
 * Fetch pull requests for a repo.
 * Supports optional `since` for early-stop: when provided, stops paginating
 * once it hits PRs last updated before that date (sorted by updated desc).
 */
export async function fetchPullRequests(
    octokit: Octokit,
    owner: string,
    repo: string,
    state: "all" | "open" | "closed" = "all",
    options?: { since?: string }
): Promise<GitHubPR[]> {
    try {
        // Guard rate limit before expensive pagination
        await guardRateLimit(octokit);

        // Manual pagination with early-stop support.
        // When `since` is provided and state is "closed", we sort by updated desc
        // and stop once we hit PRs older than the cutoff — merged/closed PRs don't change.
        const allPulls: GitHubPR[] = [];
        let page = 1;
        let stopped = false;
        const sinceDate = options?.since ? new Date(options.since) : null;

        const MAX_PAGES = 50; // Safety cap: 50 pages × 100 = 5000 PRs max

        while (page <= MAX_PAGES) {
            await guardRateLimit(octokit);

            const { data } = await octokit.rest.pulls.list({
                owner,
                repo,
                state,
                sort: "updated",
                direction: "desc",
                per_page: 100,
                page,
            });

            if (data.length === 0) break;

            // deno-lint-ignore no-explicit-any
            for (const pr of data as any[]) {
                // Early-stop: if this PR was last updated before our high-water mark,
                // we've seen everything that changed since then.
                if (sinceDate && new Date(pr.updated_at) < sinceDate) {
                    stopped = true;
                    break;
                }

                allPulls.push({
                    id: pr.id,
                    number: pr.number,
                    title: pr.title,
                    state: pr.state as "open" | "closed",
                    html_url: pr.html_url,
                    is_draft: pr.draft ?? false,
                    author_login: pr.user?.login ?? null,
                    author_avatar_url: pr.user?.avatar_url ?? null,
                    base_ref: pr.base.ref,
                    head_ref: pr.head.ref,
                    additions: pr.additions ?? 0,
                    deletions: pr.deletions ?? 0,
                    changed_files: pr.changed_files ?? 0,
                    created_at: pr.created_at,
                    closed_at: pr.closed_at,
                    merged_at: pr.merged_at,
                    updated_at: pr.updated_at,
                });
            }

            if (stopped || data.length < 100) break;
            page++;
        }

        if (page > MAX_PAGES) {
            console.warn(`[github] Hit max page cap (${MAX_PAGES}) for pulls ${owner}/${repo} — some PRs may be missing`);
        }

        console.log(
            `[github] GET pulls for ${owner}/${repo} (state=${state}) → ${allPulls.length} PRs` +
            (stopped ? ` (incremental, stopped at high-water mark)` : ``)
        );

        // Enrich PRs that are missing file stats
        const CONCURRENCY = 3;
        const toEnrich = allPulls.filter((pr) => pr.additions === 0 && pr.deletions === 0);
        if (toEnrich.length > 0) console.log(`[github] Enriching ${toEnrich.length}/${allPulls.length} PRs with file stats for ${owner}/${repo}`);
        for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
            // Guard rate limit before each enrichment batch
            await guardRateLimit(octokit);

            const batch = toEnrich.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map(async (pr) => {
                    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
                        owner,
                        repo,
                        pull_number: pr.number,
                        per_page: 100,
                    });
                    pr.additions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
                    pr.deletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
                    pr.changed_files = files.length;
                })
            );
            for (const r of results) {
                if (r.status === "rejected") {
                    console.warn(`[github] Failed to enrich PR in ${owner}/${repo}: ${r.reason}`);
                }
            }
        }

        return allPulls;
    } catch (error) {
        throw githubApiError(`list PRs for ${owner}/${repo}`, error);
    }
}

/** Search-based PR counts (3 API calls, regardless of repo count). */
export async function searchPRCounts(
    octokit: Octokit,
    owner: string,
    options?: { since?: string; until?: string }
): Promise<{ totalPRs: number; openPRs: number; mergedPRs: number }> {
    try {
        const dateRange = options?.since
            ? `created:${options.since.slice(0, 10)}..${options?.until ? options.until.slice(0, 10) : "*"}`
            : "";
        const baseQuery = `type:pr user:${owner}`;

        console.log(`[search] GET PR counts for ${owner} ${dateRange ? `since ${dateRange}` : ""}`);

        const [totalResult, openResult, mergedResult] = await Promise.all([
            octokit.rest.search.issuesAndPullRequests({
                q: [baseQuery, dateRange].filter(Boolean).join(" "),
                per_page: 1,
            }),
            octokit.rest.search.issuesAndPullRequests({
                q: [baseQuery, "is:open"].filter(Boolean).join(" "),
                per_page: 1,
            }),
            octokit.rest.search.issuesAndPullRequests({
                q: [baseQuery, "is:merged", dateRange].filter(Boolean).join(" "),
                per_page: 1,
            }),
        ]);

        return {
            totalPRs: totalResult.data.total_count,
            openPRs: openResult.data.total_count,
            mergedPRs: mergedResult.data.total_count,
        };
    } catch (error) {
        console.warn(`[search] PR count search failed for ${owner}:`, error);
        return { totalPRs: 0, openPRs: 0, mergedPRs: 0 };
    }
}

// ── Language Colors ──────────────────────────────────────────────────────────────

export const LANGUAGE_COLORS: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Java: "#b07219",
    Go: "#00ADD8",
    Rust: "#dea584",
    Ruby: "#701516",
    PHP: "#4F5D95",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Vue: "#41b883",
    Svelte: "#ff3e00",
};
