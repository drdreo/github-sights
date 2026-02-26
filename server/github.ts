import { Octokit } from "octokit";
import type {
    Repository,
    Commit,
    PullRequest,
    Contributor,
    OverviewStats,
    RepoContributorStats,
    ContributorOverview
} from "./types.ts";
import { githubApiError } from "./errors.ts";
import {
    repoCache,
    prCache,
    contributorCache,
    commitCache,
    contributorStatsCache
} from "./cache/index.ts";

/** Wraps a service result with cache freshness metadata for API responses. */
export interface WithFetchedAt<T> {
    data: T;
    fetchedAt: number;
}

// ── Excluded Repos ──────────────────────────────────────────────────────────────
// Comma-separated repo names to exclude from all results (case-insensitive).
// Override via EXCLUDED_REPOS env var, e.g. "lumicode,some-fork,old-project"

const DEFAULT_EXCLUDED = ["lumicode"];

function getExcludedRepos(): Set<string> {
    const envVal = typeof Deno !== "undefined" ? Deno.env.get("EXCLUDED_REPOS") : undefined;
    const names = envVal
        ? envVal
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
        : DEFAULT_EXCLUDED.map((s) => s.toLowerCase());
    return new Set(names);
}

const excludedRepos = getExcludedRepos();

// ── Language Colors ─────────────────────────────────────────────────────────────

const LANGUAGE_COLORS: Record<string, string> = {
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
    Svelte: "#ff3e00"
};

// ── GitHub Service ──────────────────────────────────────────────────────────────

export class GitHubService {
    private octokit: Octokit;
    private inflight = new Map<string, Promise<unknown>>();
    private prSearchCache = new Map<
        string,
        { data: { totalPRs: number; openPRs: number; mergedPRs: number }; expires: number }
    >();
    private static readonly PR_SEARCH_TTL = 10 * 60 * 1000; // 10 minutes

    constructor(token: string) {
        this.octokit = new Octokit({
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
                    if (retryCount < 2) return true;
                    return false;
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
                    if (retryCount < 1) return true;
                    return false;
                }
            }
        });

        // Log rate limit status periodically
        this.octokit.hook.after("request", async (_response, options) => {
            const headers = _response.headers;
            const remaining = headers["x-ratelimit-remaining"];
            const limit = headers["x-ratelimit-limit"];
            if (remaining !== undefined && Number(remaining) <= 20) {
                const resetAt = headers["x-ratelimit-reset"]
                    ? new Date(Number(headers["x-ratelimit-reset"]) * 1000).toISOString()
                    : "unknown";
                console.warn(
                    `[rate-limit] ${remaining}/${limit} remaining — resets at ${resetAt} — ${options.method} ${options.url}`
                );
            }
        });
    }

    /** Verify the token works by calling /user. */
    async verifyAuth(): Promise<{ login: string; scopes: string[] }> {
        const response = await this.octokit.rest.users.getAuthenticated();
        const scopes = (response.headers["x-oauth-scopes"] || "")
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        return { login: response.data.login, scopes };
    }

    async listRepos(owner: string, type: "user" | "org"): Promise<WithFetchedAt<Repository[]>> {
        const cacheKey = `${type}:${owner}`;
        const cached = await repoCache.getWithAge(cacheKey);
        if (cached) {
            if (cached.stale) {
                console.log(
                    `[cache] repos stale: ${cacheKey} — serving cached, refreshing in background`
                );
                this._refreshRepos(owner, type, cacheKey);
            } else {
                console.log(`[cache] repos hit: ${cacheKey} (${cached.data.length} repos)`);
            }
            // Remove blacklisted repos
            const data = cached.data.filter((r) => !excludedRepos.has(r.name.toLowerCase()));
            return { data, fetchedAt: cached.fetchedAt };
        }

        // Deduplicate concurrent requests for the same owner
        const inflightKey = `repos:${cacheKey}`;
        const existing = this.inflight.get(inflightKey);
        if (existing) {
            console.log(`[cache] repos inflight: ${cacheKey} — waiting for existing request`);
            return existing as Promise<WithFetchedAt<Repository[]>>;
        }

        const promise = this._fetchRepos(owner, type, cacheKey);
        this.inflight.set(inflightKey, promise);
        try {
            const data = await promise;
            return { data, fetchedAt: Date.now() };
        } finally {
            this.inflight.delete(inflightKey);
        }
    }

    private async _fetchRepos(
        owner: string,
        type: "user" | "org",
        cacheKey: string
    ): Promise<Repository[]> {
        try {
            // deno-lint-ignore no-explicit-any
            const repos: any[] =
                type === "org"
                    ? await this.octokit.paginate(this.octokit.rest.repos.listForOrg, {
                          org: owner,
                          per_page: 100,
                          type: "all"
                      })
                    : await this.octokit.paginate(this.octokit.rest.repos.listForUser, {
                          username: owner,
                          per_page: 100,
                          sort: "updated"
                      });

            const mapped = repos.map(mapRepo);

            // Remove blacklisted repos
            const filtered = mapped.filter(
                (r) => !excludedRepos.has(r.name.toLowerCase()) && !r.fork
            );

            // Sort by most recently pushed first (most active repos on top)
            filtered.sort((a, b) => {
                const aDate = a.pushed_at || a.updated_at;
                const bDate = b.pushed_at || b.updated_at;
                return bDate.localeCompare(aDate);
            });

            await repoCache.set(cacheKey, filtered);
            console.log(
                `[cache] repos miss: ${cacheKey} → fetched ${filtered.length} (excluded ${mapped.length - filtered.length})`
            );
            return filtered;
        } catch (error) {
            throw githubApiError(`list repos for ${type}:${owner}`, error);
        }
    }

    async getRepo(owner: string, repo: string): Promise<Repository> {
        try {
            const { data } = await this.octokit.rest.repos.get({ owner, repo });
            return mapRepo(data);
        } catch (error) {
            throw githubApiError(`get repo ${owner}/${repo}`, error);
        }
    }

    async listCommits(
        owner: string,
        repo: string,
        options?: { since?: string; until?: string; cacheOnly?: boolean }
    ): Promise<Commit[]> {
        // Default to last 30 days if no `since` provided — prevents fetching all history
        const since =
            options?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const until = options?.until;

        // cacheOnly mode: return whatever is in the DB without hitting GitHub
        if (options?.cacheOnly) {
            const cached = await commitCache.get(owner, repo, since, until);
            console.log(`[cache] commits cacheOnly: ${owner}/${repo} (${cached.length} commits)`);
            return cached;
        }

        // Check what we already have and what gaps remain
        const { gaps, cached } = await commitCache.analyze(owner, repo, since, until);

        if (gaps.length === 0) {
            console.log(
                `[cache] commits hit: ${owner}/${repo} (${cached.length} commits, fully covered)`
            );
            return cached;
        }

        // Deduplicate concurrent requests for the same repo+range
        const inflightKey = `commits:${owner}/${repo}:${since}:${until}`;
        const existing = this.inflight.get(inflightKey);
        if (existing) {
            console.log(
                `[cache] commits inflight: ${owner}/${repo} — waiting for existing request`
            );
            return existing as Promise<Commit[]>;
        }

        const promise = this._fetchCommits(owner, repo, since, until, gaps);
        this.inflight.set(inflightKey, promise);
        try {
            return await promise;
        } finally {
            this.inflight.delete(inflightKey);
        }
    }

    private async _fetchCommits(
        owner: string,
        repo: string,
        since: string,
        until: string | undefined,
        gaps: Array<{ since?: string; until?: string }>
    ): Promise<Commit[]> {
        console.log(`[cache] commits partial: ${owner}/${repo} — ${gaps.length} gap(s) to fetch`);

        try {
            // Fetch each gap in parallel
            const gapResults = await Promise.all(
                gaps.map(async (gap) => {
                    // deno-lint-ignore no-explicit-any
                    const params: any = { owner, repo, per_page: 100 };
                    if (gap.since) params.since = gap.since;
                    if (gap.until) params.until = gap.until;

                    const raw = await this.octokit.paginate(
                        this.octokit.rest.repos.listCommits,
                        params
                    );

                    // deno-lint-ignore no-explicit-any
                    const commits = raw.map((c: any) => mapCommit(c, `${owner}/${repo}`));

                    // Merge into cache with the range we fetched
                    await commitCache.merge(owner, repo, commits, gap.since, gap.until);

                    return commits;
                })
            );

            const fetched = gapResults.flat();
            console.log(
                `[cache] commits fetched: ${owner}/${repo} — ${fetched.length} new commits`
            );

            // Return the full set from cache (now complete for the range)
            return await commitCache.get(owner, repo, since, until);
        } catch (error) {
            throw githubApiError(`list commits for ${owner}/${repo}`, error);
        }
    }

    async listPullRequests(
        owner: string,
        repo: string,
        state: "all" | "open" | "closed" = "all"
    ): Promise<PullRequest[]> {
        const cacheKey = `${owner}/${repo}:${state}`;
        const cached = await prCache.getWithAge(cacheKey);
        if (cached) {
            if (cached.stale) {
                console.log(
                    `[cache] PRs stale: ${cacheKey} — serving cached, refreshing in background`
                );
                this._refreshPullRequests(owner, repo, state, cacheKey);
            } else {
                console.log(`[cache] PRs hit: ${cacheKey} (${cached.data.length})`);
            }
            return cached.data;
        }

        // Deduplicate concurrent requests
        const inflightKey = `prs:${cacheKey}`;
        const existing = this.inflight.get(inflightKey);
        if (existing) {
            console.log(`[cache] PRs inflight: ${cacheKey} — waiting for existing request`);
            return existing as Promise<PullRequest[]>;
        }

        const promise = this._fetchPullRequests(owner, repo, state, cacheKey);
        this.inflight.set(inflightKey, promise);
        try {
            return await promise;
        } finally {
            this.inflight.delete(inflightKey);
        }
    }

    private async _fetchPullRequests(
        owner: string,
        repo: string,
        state: "all" | "open" | "closed",
        cacheKey: string
    ): Promise<PullRequest[]> {
        try {
            const pulls = await this.octokit.paginate(this.octokit.rest.pulls.list, {
                owner,
                repo,
                state,
                per_page: 100
            });

            // deno-lint-ignore no-explicit-any
            const mapped = pulls.map((pr: any) => ({
                id: pr.id,
                number: pr.number,
                title: pr.title,
                state: pr.state as "open" | "closed",
                html_url: pr.html_url,
                user: {
                    login: pr.user.login,
                    avatar_url: pr.user.avatar_url,
                    html_url: pr.user.html_url
                },
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                closed_at: pr.closed_at,
                merged_at: pr.merged_at,
                draft: pr.draft,
                additions: pr.additions,
                deletions: pr.deletions,
                changed_files: pr.changed_files,
                base: { ref: pr.base.ref },
                head: { ref: pr.head.ref }
            }));

            await this._enrichPRsWithFileStats(owner, repo, mapped);

            await prCache.set(cacheKey, mapped);
            console.log(`[cache] PRs miss: ${cacheKey} → fetched ${mapped.length}`);
            return mapped;
        } catch (error) {
            throw githubApiError(`list PRs for ${owner}/${repo}`, error);
        }
    }

    /**
     * Enrich PRs with file-level stats (additions, deletions, changed_files)
     * by calling the "list pull request files" endpoint for each PR.
     * Uses batched concurrency to avoid rate limits.
     */
    private async _enrichPRsWithFileStats(
        owner: string,
        repo: string,
        prs: PullRequest[]
    ): Promise<void> {
        // Skip PRs that already have stats (e.g. from a previous enrichment)
        const toEnrich = prs.filter((pr) => pr.additions === undefined || pr.additions === null);

        if (toEnrich.length === 0) return;

        console.log(
            `[github] Enriching ${toEnrich.length}/${prs.length} PRs with file stats for ${owner}/${repo}`
        );

        const CONCURRENCY = 3;
        for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
            const batch = toEnrich.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map(async (pr) => {
                    const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
                        owner,
                        repo,
                        pull_number: pr.number,
                        per_page: 100
                    });

                    pr.additions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
                    pr.deletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
                    pr.changed_files = files.length;
                })
            );

            for (const r of results) {
                if (r.status === "rejected") {
                    console.warn(
                        `[github] Failed to fetch file stats for PR in ${owner}/${repo}: ${r.reason}`
                    );
                }
            }
        }
    }

    async listContributors(owner: string, repo: string): Promise<Contributor[]> {
        const cacheKey = `${owner}/${repo}`;
        const cached = await contributorCache.getWithAge(cacheKey);
        if (cached) {
            if (cached.stale) {
                console.log(
                    `[cache] contributors stale: ${cacheKey} — serving cached, refreshing in background`
                );
                this._refreshContributors(owner, repo, cacheKey);
            } else {
                console.log(`[cache] contributors hit: ${cacheKey} (${cached.data.length})`);
            }
            return cached.data;
        }

        // Deduplicate concurrent requests
        const inflightKey = `contributors:${cacheKey}`;
        const existing = this.inflight.get(inflightKey);
        if (existing) {
            console.log(
                `[cache] contributors inflight: ${cacheKey} — waiting for existing request`
            );
            return existing as Promise<Contributor[]>;
        }

        const promise = this._fetchContributors(owner, repo, cacheKey);
        this.inflight.set(inflightKey, promise);
        try {
            return await promise;
        } finally {
            this.inflight.delete(inflightKey);
        }
    }

    async getContributorStats(owner: string, repo: string): Promise<RepoContributorStats[]> {
        const cacheKey = `${owner}/${repo}`;
        const cached = await contributorStatsCache.getWithAge(cacheKey);
        if (cached) {
            if (cached.stale) {
                console.log(
                    `[cache] contributor-stats stale: ${cacheKey} — serving cached, refreshing in background`
                );
                this._refreshContributorStats(owner, repo, cacheKey);
            } else {
                console.log(
                    `[cache] contributor-stats hit: ${cacheKey} (${cached.data.length} authors)`
                );
            }
            return cached.data;
        }

        const inflightKey = `contributor-stats:${cacheKey}`;
        const existing = this.inflight.get(inflightKey);
        if (existing) {
            console.log(`[cache] contributor-stats inflight: ${cacheKey}`);
            return existing as Promise<RepoContributorStats[]>;
        }

        const promise = this._fetchContributorStats(owner, repo, cacheKey);
        this.inflight.set(inflightKey, promise);
        try {
            return await promise;
        } finally {
            this.inflight.delete(inflightKey);
        }
    }

    private async _fetchContributorStats(
        owner: string,
        repo: string,
        cacheKey: string
    ): Promise<RepoContributorStats[]> {
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 2000;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await this.octokit.request(
                    "GET /repos/{owner}/{repo}/stats/contributors",
                    { owner, repo }
                );

                if (response.status === 202) {
                    if (attempt < MAX_RETRIES) {
                        console.log(
                            `[github] contributor-stats 202 for ${cacheKey} — retry ${attempt + 1}/${MAX_RETRIES}`
                        );
                        await new Promise((r) => setTimeout(r, RETRY_DELAY));
                        continue;
                    }
                    console.warn(
                        `[github] contributor-stats 202 exhausted retries for ${cacheKey}`
                    );
                    return [];
                }

                const data = (response.data || []) as RepoContributorStats[];
                await contributorStatsCache.set(cacheKey, data);
                console.log(
                    `[cache] contributor-stats miss: ${cacheKey} → fetched ${data.length} authors`
                );
                return data;
            } catch (error) {
                console.warn(`[github] contributor-stats failed for ${cacheKey}:`, error);
                return [];
            }
        }

        return [];
    }

    private async _fetchContributors(
        owner: string,
        repo: string,
        cacheKey: string
    ): Promise<Contributor[]> {
        try {
            const contributors = await this.octokit.paginate(
                this.octokit.rest.repos.listContributors,
                {
                    owner,
                    repo,
                    per_page: 100
                }
            );

            // deno-lint-ignore no-explicit-any
            const mapped = contributors.map((c: any) => ({
                login: c.login,
                avatar_url: c.avatar_url,
                html_url: c.html_url,
                contributions: c.contributions
            }));

            await contributorCache.set(cacheKey, mapped);
            console.log(`[cache] contributors miss: ${cacheKey} → fetched ${mapped.length}`);
            return mapped;
        } catch (error) {
            throw githubApiError(`list contributors for ${owner}/${repo}`, error);
        }
    }

    // ── Background refresh methods (fire-and-forget, stale-while-revalidate) ──

    /** Background re-fetch for contributors. Errors are logged but not thrown. */
    private _refreshContributors(owner: string, repo: string, cacheKey: string): void {
        const inflightKey = `contributors:${cacheKey}`;
        if (this.inflight.has(inflightKey)) return;

        this._fetchContributors(owner, repo, cacheKey).catch((err) => {
            console.warn(`[refresh] contributors failed for ${cacheKey}:`, err.message);
        });
    }

    /** Background re-fetch for contributor stats. Errors are logged but not thrown. */
    private _refreshContributorStats(owner: string, repo: string, cacheKey: string): void {
        const inflightKey = `contributor-stats:${cacheKey}`;
        if (this.inflight.has(inflightKey)) return;

        this._fetchContributorStats(owner, repo, cacheKey).catch((err) => {
            console.warn(`[refresh] contributor-stats failed for ${cacheKey}:`, err.message);
        });
    }

    /** Background re-fetch for repos. Errors are logged but not thrown. */
    private _refreshRepos(owner: string, type: "user" | "org", cacheKey: string): void {
        const inflightKey = `repos:${cacheKey}`;
        if (this.inflight.has(inflightKey)) return;

        this._fetchRepos(owner, type, cacheKey).catch((err) => {
            console.warn(`[refresh] repos failed for ${cacheKey}:`, err.message);
        });
    }

    /** Background re-fetch for PRs. Errors are logged but not thrown. */
    private _refreshPullRequests(
        owner: string,
        repo: string,
        state: "all" | "open" | "closed",
        cacheKey: string
    ): void {
        const inflightKey = `prs:${cacheKey}`;
        if (this.inflight.has(inflightKey)) return;

        this._fetchPullRequests(owner, repo, state, cacheKey).catch((err) => {
            console.warn(`[refresh] PRs failed for ${cacheKey}:`, err.message);
        });
    }

    /**
     * Uses the GitHub Search API to get aggregate PR counts for an owner.
     * 3 API calls total regardless of repo count — much cheaper than per-repo pagination.
     * Search qualifiers: `type:pr` + `user:{owner}` (works for both users and orgs).
     */
    private async searchPRCounts(
        owner: string,
        since?: string,
        until?: string
    ): Promise<{ totalPRs: number; openPRs: number; mergedPRs: number }> {
        const cacheKey = `${owner}:${since?.slice(0, 10) ?? ""}:${until?.slice(0, 10) ?? ""}`;
        const cached = this.prSearchCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            console.log(`[search] PR counts cache hit for ${owner}`);
            return cached.data;
        }

        try {
            const dateRange = since
                ? `created:${since.slice(0, 10)}..${until ? until.slice(0, 10) : "*"}`
                : "";
            const baseQuery = `type:pr user:${owner}`;
            const [totalResult, openResult, mergedResult] = await Promise.all([
                this.octokit.rest.search.issuesAndPullRequests({
                    q: [baseQuery, dateRange].filter(Boolean).join(" "),
                    per_page: 1
                }),
                this.octokit.rest.search.issuesAndPullRequests({
                    q: [baseQuery, "is:open"].filter(Boolean).join(" "),
                    per_page: 1
                }),
                this.octokit.rest.search.issuesAndPullRequests({
                    q: [baseQuery, "is:merged", dateRange].filter(Boolean).join(" "),
                    per_page: 1
                })
            ]);

            const data = {
                totalPRs: totalResult.data.total_count,
                openPRs: openResult.data.total_count,
                mergedPRs: mergedResult.data.total_count
            };

            this.prSearchCache.set(cacheKey, {
                data,
                expires: Date.now() + GitHubService.PR_SEARCH_TTL
            });
            console.log(
                `[search] PR counts for ${owner}: total=${data.totalPRs}, open=${data.openPRs}, merged=${data.mergedPRs}`
            );
            return data;
        } catch (error) {
            console.warn(`[search] PR count search failed for ${owner}:`, error);
            return { totalPRs: 0, openPRs: 0, mergedPRs: 0 };
        }
    }

    async getOverviewStats(
        owner: string,
        type: "user" | "org",
        since?: string,
        until?: string,
        options?: { cacheOnly?: boolean }
    ): Promise<OverviewStats> {
        const { data: allRepos } = await this.listRepos(owner, type);

        // Sort by most recently pushed first — most useful data comes first
        const repos = [...allRepos].sort((a, b) => {
            const aDate = a.pushed_at || a.updated_at;
            const bDate = b.pushed_at || b.updated_at;
            return bDate.localeCompare(aDate);
        });

        // Exclude forks from commit/PR fetching — they bloat stats with upstream commits.
        // Forks still count toward totalRepos.
        const nonForkRepos = repos.filter((r) => !r.fork);

        const cacheOnly = options?.cacheOnly ?? false;

        // Process repos in batches of CONCURRENCY to avoid GitHub rate limits.
        const CONCURRENCY = 3;
        const repoStats: Array<{
            repo: Repository;
            commits: Commit[];
        }> = [];
        // Fetch commits per-repo AND PR counts via Search API in parallel.
        const prCountsPromise = this.searchPRCounts(owner, since, until);
        for (let i = 0; i < nonForkRepos.length; i += CONCURRENCY) {
            const batch = nonForkRepos.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(async (repo) => {
                    try {
                        const commits = await this.listCommits(repo.owner.login, repo.name, {
                            since,
                            until,
                            cacheOnly
                        });
                        return { repo, commits };
                    } catch (err) {
                        console.warn(`[stats] Skipping ${repo.full_name}: ${err}`);
                        return { repo, commits: [] as Commit[] };
                    }
                })
            );
            repoStats.push(...batchResults);
        }

        const { totalPRs, openPRs, mergedPRs } = await prCountsPromise;
        let totalCommits = 0;
        const contributorMap = new Map<string, Contributor>();
        const languageCount = new Map<string, number>();
        let mostActiveRepo: { name: string; commits: number } | null = null;
        let maxCommits = 0;
        for (const { repo, commits } of repoStats) {
            totalCommits += commits.length;
            if (commits.length > maxCommits) {
                maxCommits = commits.length;
                mostActiveRepo = { name: repo.name, commits: commits.length };
            }

            for (const commit of commits) {
                if (commit.author.login) {
                    const existing = contributorMap.get(commit.author.login);
                    if (existing) {
                        existing.contributions++;
                    } else {
                        contributorMap.set(commit.author.login, {
                            login: commit.author.login,
                            avatar_url: commit.author.avatar_url || "",
                            html_url: `https://github.com/${commit.author.login}`,
                            contributions: 1
                        });
                    }
                }
            }

            if (repo.language) {
                languageCount.set(repo.language, (languageCount.get(repo.language) || 0) + 1);
            }
        }

        const allCommits = repoStats.flatMap((rs) => rs.commits);
        const { longestStreak, currentStreak, avgCommitsPerDay } = calculateStreaks(allCommits);

        const topContributors = Array.from(contributorMap.values())
            .sort((a, b) => b.contributions - a.contributions)
            .slice(0, 10);

        const languageBreakdown = Array.from(languageCount.entries())
            .map(([language, count]) => ({
                language,
                count,
                color: LANGUAGE_COLORS[language] || "#8b8b8b"
            }))
            .sort((a, b) => b.count - a.count);

        // Aggregate LOC from contributor stats (weekly breakdown)
        const sinceTs = since ? Math.floor(new Date(since).getTime() / 1000) : 0;
        const untilTs = until
            ? Math.floor(new Date(until).getTime() / 1000)
            : Math.floor(Date.now() / 1000);
        let totalAdditions = 0;
        let totalDeletions = 0;

        // Fetch contributor stats for all repos (reuses cache from getContributorStats)
        const contribStatsPromises = nonForkRepos.map((repo) =>
            this.getContributorStats(repo.owner.login, repo.name)
        );
        const contribStatsResults = await Promise.allSettled(contribStatsPromises);

        for (const result of contribStatsResults) {
            if (result.status !== "fulfilled") continue;
            for (const authorStats of result.value) {
                for (const week of authorStats.weeks) {
                    if (week.w >= sinceTs && week.w <= untilTs) {
                        totalAdditions += week.a;
                        totalDeletions += week.d;
                    }
                }
            }
        }

        return {
            totalRepos: repos.length, // includes forks for the full count
            totalCommits,
            totalPRs,
            openPRs,
            mergedPRs,
            totalAdditions,
            totalDeletions,
            uniqueContributors: contributorMap.size,
            mostActiveRepo,
            longestStreak,
            currentStreak,
            avgCommitsPerDay,
            topContributors,
            languageBreakdown
        };
    }

    async getContributorOverview(
        owner: string,
        type: "user" | "org",
        since?: string,
        until?: string
    ): Promise<WithFetchedAt<ContributorOverview[]>> {
        const { data: allRepos, fetchedAt } = await this.listRepos(owner, type);
        const nonForkRepos = allRepos.filter((r) => !r.fork);

        // Parse date range for filtering weeks
        const sinceTs = since ? Math.floor(new Date(since).getTime() / 1000) : 0;
        const untilTs = until
            ? Math.floor(new Date(until).getTime() / 1000)
            : Math.floor(Date.now() / 1000);

        // Fetch contributor stats for all repos (batched)
        const CONCURRENCY = 5;
        const allStats: Array<{ repo: string; stats: RepoContributorStats[] }> = [];

        for (let i = 0; i < nonForkRepos.length; i += CONCURRENCY) {
            const batch = nonForkRepos.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map(async (repo) => {
                    const stats = await this.getContributorStats(repo.owner.login, repo.name);
                    return { repo: repo.name, stats };
                })
            );
            for (const r of results) {
                if (r.status === "fulfilled") {
                    allStats.push(r.value);
                }
            }
        }

        // Aggregate per contributor
        const contributorMap = new Map<string, ContributorOverview>();

        for (const { repo, stats } of allStats) {
            for (const authorStats of stats) {
                if (!authorStats.author?.login) continue;

                const login = authorStats.author.login;
                let entry = contributorMap.get(login);
                if (!entry) {
                    entry = {
                        login,
                        avatar_url: authorStats.author.avatar_url,
                        html_url: `https://github.com/${login}`,
                        totalCommits: 0,
                        totalAdditions: 0,
                        totalDeletions: 0,
                        totalPRs: 0,
                        repos: []
                    };
                    contributorMap.set(login, entry);
                }

                entry.repos.push(repo);

                // Sum weeks within the date range
                for (const week of authorStats.weeks) {
                    if (week.w >= sinceTs && week.w <= untilTs) {
                        entry.totalCommits += week.c;
                        entry.totalAdditions += week.a;
                        entry.totalDeletions += week.d;
                    }
                }
            }
        }

        // Sort by total commits descending
        const overview = Array.from(contributorMap.values())
            .filter((c) => c.totalCommits > 0)
            .sort((a, b) => b.totalCommits - a.totalCommits);
        return { data: overview, fetchedAt };
    }

    /**
     * Bulk fetch: returns cached commits for ALL non-fork repos in one call.
     * Avoids N HTTP round-trips from the client.
     * Each entry includes repo metadata + commits for the requested range.
     */
    async listAllCommits(
        owner: string,
        type: "user" | "org",
        since?: string,
        until?: string,
        options?: { cacheOnly?: boolean }
    ): Promise<Array<{ repo: Repository; commits: Commit[] }>> {
        const { data: allRepos } = await this.listRepos(owner, type);
        const nonForkRepos = allRepos.filter((r) => !r.fork);
        const cacheOnly = options?.cacheOnly ?? false;

        const results: Array<{ repo: Repository; commits: Commit[] }> = [];

        // Process in batches to avoid overwhelming the DB connection pool
        const CONCURRENCY = 10;
        for (let i = 0; i < nonForkRepos.length; i += CONCURRENCY) {
            const batch = nonForkRepos.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(
                batch.map(async (repo) => {
                    const commits = await this.listCommits(repo.owner.login, repo.name, {
                        since,
                        until,
                        cacheOnly
                    });
                    return { repo, commits };
                })
            );

            for (const r of batchResults) {
                if (r.status === "fulfilled") {
                    results.push(r.value);
                } else {
                    console.warn(`[bulk-commits] Failed for repo in batch: ${r.reason}`);
                }
            }
        }

        return results;
    }

    /**
     * Background sync: fills commit gaps for all non-fork repos.
     * Fetches only what's missing (from last fetched date to now).
     * Returns a summary of what was synced.
     */
    async syncCommits(
        owner: string,
        type: "user" | "org",
        since?: string,
        until?: string
    ): Promise<{ synced: number; repos: string[]; errors: string[] }> {
        const { data: allRepos } = await this.listRepos(owner, type);
        const nonForkRepos = allRepos.filter((r) => !r.fork);

        const CONCURRENCY = 3;
        const syncedRepos: string[] = [];
        const errors: string[] = [];
        let totalNewCommits = 0;

        for (let i = 0; i < nonForkRepos.length; i += CONCURRENCY) {
            const batch = nonForkRepos.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map(async (repo) => {
                    // This will analyze gaps and fetch only what's missing
                    const commits = await this.listCommits(repo.owner.login, repo.name, {
                        since,
                        until
                    });
                    return { name: repo.full_name, count: commits.length };
                })
            );

            for (const r of results) {
                if (r.status === "fulfilled") {
                    syncedRepos.push(r.value.name);
                    totalNewCommits += r.value.count;
                } else {
                    errors.push(String(r.reason));
                }
            }
        }

        console.log(
            `[sync] Completed: ${syncedRepos.length} repos, ${totalNewCommits} total commits, ${errors.length} errors`
        );

        return { synced: totalNewCommits, repos: syncedRepos, errors };
    }
}

// ── Mapping Helpers ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function mapRepo(repo: any): Repository {
    return {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        private: repo.private,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        open_issues_count: repo.open_issues_count,
        default_branch: repo.default_branch,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        fork: !!repo.fork,
        owner: {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url,
            html_url: repo.owner.html_url
        }
    };
}

// deno-lint-ignore no-explicit-any
function mapCommit(commit: any, repoName: string): Commit {
    return {
        sha: commit.sha,
        message: commit.commit.message,
        author: {
            name: commit.commit.author?.name || "Unknown",
            email: commit.commit.author?.email || "",
            date: commit.commit.author?.date || new Date().toISOString(),
            login: commit.author?.login,
            avatar_url: commit.author?.avatar_url
        },
        committer: {
            name: commit.commit.committer?.name || "Unknown",
            email: commit.commit.committer?.email || "",
            date: commit.commit.committer?.date || new Date().toISOString(),
            login: commit.committer?.login,
            avatar_url: commit.committer?.avatar_url
        },
        html_url: commit.html_url,
        stats: commit.stats
            ? {
                  additions: commit.stats.additions ?? 0,
                  deletions: commit.stats.deletions ?? 0,
                  total: commit.stats.total ?? 0
              }
            : undefined,
        repo_name: repoName
    };
}

// ── Streak Calculation ──────────────────────────────────────────────────────────

function calculateStreaks(commits: Commit[]) {
    if (commits.length === 0) {
        return { longestStreak: 0, currentStreak: 0, avgCommitsPerDay: 0 };
    }

    const dateCounts = new Map<string, number>();
    for (const commit of commits) {
        const date = commit.author.date.split("T")[0];
        dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
    }

    const sortedDates = Array.from(dateCounts.keys()).sort();
    if (sortedDates.length === 0) {
        return { longestStreak: 0, currentStreak: 0, avgCommitsPerDay: 0 };
    }

    let longestStreak = 1;
    let tempStreak = 1;

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const lastDate = sortedDates[sortedDates.length - 1];

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

    let currentStreakCount = 0;
    if (lastDate === today || lastDate === yesterday) {
        currentStreakCount = tempStreak;
    }

    const firstDate = new Date(sortedDates[0]);
    const lastDateObj = new Date(sortedDates[sortedDates.length - 1]);
    const daysDiff = Math.max(
        1,
        Math.ceil((lastDateObj.getTime() - firstDate.getTime()) / 86400000) + 1
    );
    const avgCommitsPerDay = Math.round((commits.length / daysDiff) * 100) / 100;

    return { longestStreak, currentStreak: currentStreakCount, avgCommitsPerDay };
}
