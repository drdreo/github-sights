import type { Octokit } from "octokit";
import { type InsertPrInput, upsertPrs } from "../../db/queries/pulls.ts";
import { type UpsertContributorInput, upsertContributors } from "../../db/queries/identity.ts";
import { advanceSyncState, getSyncState } from "../../db/queries/sync-state.ts";
import { fetchPullRequests, type GitHubRepo } from "../client/index.ts";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface IngestPRsResult {
    repoName: string;
    repoId: number;
    upserted: number;
}

// ── PR Ingestion ─────────────────────────────────────────────────────────────────

/**
 * Ingest PRs for a single repo.
 * Fetches all PRs and upserts them (idempotent).
 */
export async function ingestPRsForRepo(
    octokit: Octokit,
    owner: string,
    repo: GitHubRepo
): Promise<IngestPRsResult> {
    const repoId = repo.id;
    const repoName = repo.name;

    // Skip if PRs were synced recently (allows resuming after isolate restart)
    const pullState = await getSyncState(owner, repoId, "pulls");
    const PR_STALE_MS = 60 * 60 * 1000; // 1 hour
    if (
        pullState?.last_synced_at &&
        Date.now() - pullState.last_synced_at.getTime() < PR_STALE_MS
    ) {
        const agoMin = Math.round((Date.now() - pullState.last_synced_at.getTime()) / 60_000);
        console.log(
            `[ingest] ${owner}/${repoName}: PRs synced ${agoMin}min ago, skipping (stale after 60min)`
        );
        return { repoName, repoId, upserted: 0 };
    }

    const updatedSince = pullState?.last_synced_at
        ? pullState.last_synced_at.toISOString()
        : undefined;

    console.log(
        `[ingest] ${owner}/${repoName}: fetching PRs…` +
            (updatedSince ? ` (incremental since ${updatedSince.split("T")[0]})` : " (full)")
    );

    // Fetch PRs — on consecutive syncs, only fetch PRs updated since last sync.
    // PRs are upserted (idempotent), so re-fetching updated ones is correct.
    let totalUpserted = 0;
    let totalFetched = 0;
    const seenContributors = new Map<string, UpsertContributorInput>();

    await fetchPullRequests(octokit, owner, repoName, "all", {
        updatedSince,
        onPage: async (page) => {
            totalFetched += page.length;

            const prInputs: InsertPrInput[] = page.map((pr) => ({
                id: pr.id,
                repo_id: repoId,
                number: pr.number,
                author_login: pr.author_login,
                title: pr.title,
                state: pr.state,
                is_draft: pr.is_draft,
                html_url: pr.html_url,
                base_ref: pr.base_ref,
                head_ref: pr.head_ref,
                additions: pr.additions,
                deletions: pr.deletions,
                changed_files: pr.changed_files,
                created_at: pr.created_at,
                closed_at: pr.closed_at,
                merged_at: pr.merged_at
            }));

            totalUpserted += await upsertPrs(prInputs);

            // Deduplicate contributors as we go
            for (const pr of page) {
                if (pr.author_login && !seenContributors.has(pr.author_login)) {
                    seenContributors.set(pr.author_login, {
                        login: pr.author_login,
                        avatar_url: pr.author_avatar_url,
                        html_url: `https://github.com/${pr.author_login}`
                    });
                }
            }
        }
    });

    if (totalFetched === 0) {
        await advanceSyncState(owner, repoId, "pulls", new Date().toISOString());
        return { repoName, repoId, upserted: 0 };
    }

    console.log(
        `[ingest] ${owner}/${repoName}: fetched ${totalFetched} PRs, upserting contributors…`
    );

    await upsertContributors(Array.from(seenContributors.values()));
    console.log(`[ingest] ${owner}/${repoName}: contributors done, advancing sync state…`);

    await advanceSyncState(owner, repoId, "pulls", new Date().toISOString());
    console.log(`[ingest] ${owner}/${repoName}: PR ingestion complete`);

    return { repoName, repoId, upserted: totalUpserted };
}
