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

// ── GraphQL Queries ──────────────────────────────────────────────────────────────

const COMMITS_GRAPHQL_QUERY = `
query ($owner: String!, $repo: String!, $since: GitTimestamp, $until: GitTimestamp, $after: String) {
    repository(owner: $owner, name: $repo) {
        defaultBranchRef {
            target {
                ... on Commit {
                    history(first: 100, since: $since, until: $until, after: $after) {
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        nodes {
                            oid
                            message
                            additions
                            deletions
                            changedFilesIfAvailable
                            url
                            author {
                                name
                                email
                                date
                                user {
                                    login
                                    avatarUrl
                                }
                            }
                            committer {
                                name
                                email
                                date
                                user {
                                    login
                                    avatarUrl
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    rateLimit {
        remaining
        limit
        resetAt
    }
}`;

const PRS_GRAPHQL_QUERY = `
query ($owner: String!, $repo: String!, $states: [PullRequestState!], $after: String) {
    repository(owner: $owner, name: $repo) {
        pullRequests(first: 100, states: $states, orderBy: {field: CREATED_AT, direction: DESC}, after: $after) {
            pageInfo {
                hasNextPage
                endCursor
            }
            nodes {
                id: databaseId
                number
                title
                state
                url
                createdAt
                updatedAt
                closedAt
                mergedAt
                isDraft
                additions
                deletions
                changedFiles
                baseRefName
                headRefName
                author {
                    login
                    avatarUrl
                    url
                }
            }
        }
    }
    rateLimit {
        remaining
        limit
        resetAt
    }
}`;

// deno-lint-ignore no-explicit-any
function logGraphQLRateLimit(response: any): void {
    const rl = response?.rateLimit;
    if (rl && rl.remaining <= 200) {
        console.warn(`[graphql-rate-limit] ${rl.remaining}/${rl.limit} remaining — resets at ${rl.resetAt}`);
    }
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

/**
 * Fetch commits for a single repo via GraphQL API.
 * Unlike REST, GraphQL returns additions/deletions per commit, fixing LOC=0.
 */
export async function fetchCommits(
    octokit: Octokit,
    owner: string,
    repo: string,
    options?: { since?: string; until?: string }
): Promise<GitHubCommit[]> {
    try {
        await guardRateLimit(octokit);

        const allCommits: GitHubCommit[] = [];
        let cursor: string | null = null;
        let hasNextPage = true;

        while (hasNextPage) {
            // deno-lint-ignore no-explicit-any
            const response: any = await octokit.graphql(COMMITS_GRAPHQL_QUERY, {
                owner,
                repo,
                since: options?.since || null,
                until: options?.until || null,
                after: cursor,
            });

            logGraphQLRateLimit(response);

            const history = response.repository?.defaultBranchRef?.target?.history;
            if (!history) break; // Empty repo or no default branch

            // deno-lint-ignore no-explicit-any
            for (const node of history.nodes) {
                allCommits.push({
                    sha: node.oid,
                    message: node.message,
                    html_url: node.url,
                    committed_at: node.committer?.date || node.author?.date || new Date().toISOString(),
                    author_login: node.author?.user?.login ?? null,
                    author_name: node.author?.name || "Unknown",
                    author_email: node.author?.email || "",
                    author_avatar_url: node.author?.user?.avatarUrl ?? null,
                    committer_login: node.committer?.user?.login ?? null,
                    additions: node.additions ?? 0,
                    deletions: node.deletions ?? 0,
                });
            }

            hasNextPage = history.pageInfo.hasNextPage;
            cursor = history.pageInfo.endCursor;
        }

        console.log(
            `[github] GET commits for ${owner}/${repo} → ${allCommits.length} commits (via GraphQL)` +
            (options?.since ? ` (since ${options.since.split("T")[0]})` : "")
        );

        return allCommits;
    } catch (error) {
        throw githubApiError(`list commits for ${owner}/${repo}`, error);
    }
}

/**
 * Fetch pull requests for a repo via GraphQL API.
 * Returns additions/deletions/changedFiles inline per PR, eliminating
 * the N+1 REST enrichment pattern.
 */
export async function fetchPullRequests(
    octokit: Octokit,
    owner: string,
    repo: string,
    state: "all" | "open" | "closed" = "all",
    _options?: { since?: string }
): Promise<GitHubPR[]> {
    try {
        await guardRateLimit(octokit);

        // Map state to GraphQL PullRequestState enum values
        const stateMap: Record<string, string[]> = {
            all: ["OPEN", "CLOSED", "MERGED"],
            open: ["OPEN"],
            closed: ["CLOSED", "MERGED"],
        };
        const states = stateMap[state];

        const allPulls: GitHubPR[] = [];
        let cursor: string | null = null;
        let hasNextPage = true;

        while (hasNextPage) {
            await guardRateLimit(octokit);

            // deno-lint-ignore no-explicit-any
            const response: any = await octokit.graphql(PRS_GRAPHQL_QUERY, {
                owner,
                repo,
                states,
                after: cursor,
            });

            logGraphQLRateLimit(response);

            const pullRequests = response.repository?.pullRequests;
            if (!pullRequests) break;

            // deno-lint-ignore no-explicit-any
            for (const node of pullRequests.nodes) {
                // GraphQL state is OPEN, CLOSED, or MERGED — normalize to "open" | "closed"
                const prState: "open" | "closed" = node.state === "OPEN" ? "open" : "closed";

                allPulls.push({
                    id: node.id,
                    number: node.number,
                    title: node.title,
                    state: prState,
                    html_url: node.url,
                    is_draft: node.isDraft ?? false,
                    author_login: node.author?.login ?? null,
                    author_avatar_url: node.author?.avatarUrl ?? null,
                    base_ref: node.baseRefName,
                    head_ref: node.headRefName,
                    additions: node.additions ?? 0,
                    deletions: node.deletions ?? 0,
                    changed_files: node.changedFiles ?? 0,
                    created_at: node.createdAt,
                    closed_at: node.closedAt || null,
                    merged_at: node.mergedAt || null,
                    updated_at: node.updatedAt,
                });
            }

            hasNextPage = pullRequests.pageInfo.hasNextPage;
            cursor = pullRequests.pageInfo.endCursor;
        }

        console.log(
            `[github] GET pulls for ${owner}/${repo} (state=${state}) → ${allPulls.length} PRs (via GraphQL)`
        );

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
