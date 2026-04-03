// ── Repository Fetching ───────────────────────────────────────────────────────

import { Octokit } from "octokit";
import { githubApiError } from "../../errors.ts";

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

// ── Excluded Repos ───────────────────────────────────────────────────────────
const DEFAULT_EXCLUDED: string[] = [];

export function getExcludedRepos(): Set<string> {
    const envVal = typeof Deno !== "undefined" ? Deno.env.get("EXCLUDED_REPOS") : undefined;
    const names = envVal
        ? envVal
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
        : DEFAULT_EXCLUDED.map((s) => s.toLowerCase());
    return new Set(names);
}

export const excludedRepos = getExcludedRepos();

export function isRepoExcluded(repoName: string): boolean {
    return excludedRepos.has(repoName.toLowerCase());
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
                      type: "all"
                  })
                : await octokit.paginate(octokit.rest.repos.listForUser, {
                      username: owner,
                      per_page: 100,
                      sort: "updated"
                  });

        const forkCount = raw.filter((r) => r.fork).length;
        const privateCount = raw.filter((r) => r.private).length;
        console.log(
            `[github] GET repos for ${ownerType}:${owner} → ${raw.length} repos ` +
                `(${forkCount} forks, ${privateCount} private)`
        );

        return (
            raw
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
                        html_url: r.owner.html_url
                    }
                }))
                .filter((r) => !excludedRepos.has(r.name.toLowerCase()))
        );
    } catch (error) {
        throw githubApiError(`list repos for ${ownerType}:${owner}`, error);
    }
}
