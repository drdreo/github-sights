import type { Octokit } from "octokit";
import { type InsertCommitInput, insertCommits } from "../../db/queries/commits.ts";
import { type UpsertContributorInput, upsertContributors } from "../../db/queries/identity.ts";
import {
    advanceSyncState,
    getEarliestSynced,
    getSyncState,
    retreatEarliestSynced
} from "../../db/queries/sync-state.ts";
import { fetchCommits, type GitHubCommit, type GitHubRepo } from "../client/index.ts";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface IngestCommitsResult {
    repoName: string;
    repoId: number;
    inserted: number;
    since: string | null;
    until: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

export function toCommitInput(c: GitHubCommit, repoId: number): InsertCommitInput {
    return {
        sha: c.sha,
        repo_id: repoId,
        author_login: c.author_login,
        committer_login: c.committer_login,
        message: c.message,
        html_url: c.html_url,
        committed_at: c.committed_at,
        additions: c.additions,
        deletions: c.deletions,
        is_merge: c.is_merge
    };
}

export function collectContributors(
    page: GitHubCommit[],
    seen: Map<string, UpsertContributorInput>
): void {
    for (const c of page) {
        if (c.author_login && !seen.has(c.author_login)) {
            seen.set(c.author_login, {
                login: c.author_login,
                avatar_url: c.author_avatar_url,
                html_url: `https://github.com/${c.author_login}`,
                name: c.author_name !== "Unknown" ? c.author_name : null,
                email: c.author_email || null
            });
        }
    }
}

// ── Commit Ingestion ─────────────────────────────────────────────────────────────

/**
 * Ingest commits for a single repo.
 * Gap-aware: only fetches commits newer than the last sync high-water mark.
 * Extracts contributor profiles from commit authors.
 */
export async function ingestCommitsForRepo(
    octokit: Octokit,
    owner: string,
    repo: GitHubRepo,
    options?: { since?: string; until?: string; desiredSince?: string }
): Promise<IngestCommitsResult> {
    const repoId = repo.id;
    const repoName = repo.name;

    // Determine fetch window using sync_state high-water mark
    let fetchSince = options?.since ?? null;
    const fetchUntil = options?.until ?? new Date().toISOString();

    if (!fetchSince) {
        const syncState = await getSyncState(owner, repoId, "commits");
        if (syncState?.last_synced_at) {
            // Fetch from 1 second after last sync to avoid re-fetching boundary commits
            const lastSync = new Date(syncState.last_synced_at.getTime());
            lastSync.setSeconds(lastSync.getSeconds() + 1);
            fetchSince = lastSync.toISOString();
        }
    }

    // Fetch from GitHub — stream page-by-page to avoid accumulating all commits in memory
    let totalInserted = 0;
    let totalFetched = 0;
    const seenContributors = new Map<string, UpsertContributorInput>();

    await fetchCommits(octokit, owner, repoName, {
        since: fetchSince ?? undefined,
        until: fetchUntil,
        onPage: async (page) => {
            totalFetched += page.length;
            totalInserted += await insertCommits(page.map((c) => toCommitInput(c, repoId)));
            collectContributors(page, seenContributors);
        }
    });

    if (totalFetched === 0) {
        // Only advance high-water mark forward, never backward (protects backfills)
        await advanceSyncState(owner, repoId, "commits", fetchUntil);
    } else {
        console.log(
            `[ingest] ${owner}/${repoName}: fetched ${totalFetched} commits${fetchSince ? ` (since ${fetchSince.split("T")[0]})` : " (full history)"}, upserting contributors…`
        );

        await upsertContributors(Array.from(seenContributors.values()));
        await advanceSyncState(owner, repoId, "commits", fetchUntil);
    }

    // Track what the forward pass covered
    const earliestCovered = fetchSince ?? "1970-01-01T00:00:00Z";
    await retreatEarliestSynced(owner, repoId, "commits", earliestCovered);
    console.log(`[ingest] ${owner}/${repoName}: commit sync state updated`);

    // ── Backward gap detection ───────────────────────────────────────────────
    const desiredSince = options?.desiredSince;
    if (desiredSince) {
        const earliestSynced = await getEarliestSynced(owner, repoId, "commits");

        if (!earliestSynced || new Date(desiredSince) < new Date(earliestSynced)) {
            const backfillUntil = earliestSynced ?? fetchUntil;
            console.log(
                `[ingest] ${owner}/${repoName}: backfilling commits ${desiredSince.split("T")[0]} → ${backfillUntil.split("T")[0]}`
            );

            let backfillFetched = 0;

            await fetchCommits(octokit, owner, repoName, {
                since: desiredSince,
                until: backfillUntil,
                onPage: async (page) => {
                    backfillFetched += page.length;
                    totalInserted += await insertCommits(page.map((c) => toCommitInput(c, repoId)));
                    collectContributors(page, seenContributors);
                }
            });

            if (backfillFetched > 0) {
                console.log(
                    `[ingest] ${owner}/${repoName}: backfill fetched ${backfillFetched} commits`
                );

                await upsertContributors(Array.from(seenContributors.values()));
            }

            await retreatEarliestSynced(owner, repoId, "commits", desiredSince);
        }
    }

    return { repoName, repoId, inserted: totalInserted, since: fetchSince, until: fetchUntil };
}
