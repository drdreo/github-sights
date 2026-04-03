import type { Octokit } from "octokit";
import { upsertOwner, type UpsertRepoInput, upsertRepos } from "../../db/queries/identity.ts";
import { fetchRepos, type GitHubRepo, isRepoExcluded } from "../client/index.ts";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface IngestReposResult {
    repos: GitHubRepo[];
    repoCount: number;
}

// ── Repo Ingestion ───────────────────────────────────────────────────────────────

/**
 * Fetch repos from GitHub and upsert into repository_meta.
 * Also upserts the owner record.
 * Returns the list of non-fork, non-excluded repos.
 */
export async function ingestRepos(
    octokit: Octokit,
    owner: string,
    ownerType: "user" | "org"
): Promise<IngestReposResult> {
    // Fetch repos from GitHub (already filters forks + excluded)
    const ghRepos = await fetchRepos(octokit, owner, ownerType);

    // Upsert owner
    await upsertOwner(owner, ownerType);

    // Map to DB shape and upsert
    const repoInputs: UpsertRepoInput[] = ghRepos.map((r) => ({
        id: r.id,
        owner_login: owner,
        name: r.name,
        full_name: r.full_name,
        description: r.description,
        html_url: r.html_url,
        is_private: r.private,
        is_fork: r.fork,
        language: r.language,
        default_branch: r.default_branch,
        stargazers_count: r.stargazers_count,
        forks_count: r.forks_count,
        open_issues_count: r.open_issues_count,
        created_at: r.created_at,
        updated_at: r.updated_at,
        pushed_at: r.pushed_at
    }));

    await upsertRepos(repoInputs);

    // Filter to non-fork repos for downstream ingestion, prioritize recently active repos
    const activeRepos = ghRepos
        .filter((r) => !r.fork && !isRepoExcluded(r.name))
        .sort((a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime());
    console.log(
        `[ingest] ${owner}: ${activeRepos.length}/${ghRepos.length} repos eligible (excluded forks + ignored)`
    );

    return { repos: activeRepos, repoCount: ghRepos.length };
}
