// ── Pull Request Queries ─────────────────────────────────────────────────────────
//
// Batch upsert and query operations for pr_event.

import { query, transaction } from "../pool.ts";
import { buildMultiRowValues, BATCH_SIZE } from "../utils.ts";
import type { PrEventWithAvatarRow } from "../types.ts";

export interface InsertPrInput {
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
    created_at: string;
    closed_at: string | null;
    merged_at: string | null;
}

/** Batch upsert PRs. Upserts because PR state can change. */
export async function upsertPrs(prs: InsertPrInput[]): Promise<number> {
    if (prs.length === 0) return 0;

    let upserted = 0;
    await transaction(async (client) => {
        for (let i = 0; i < prs.length; i += BATCH_SIZE) {
            const chunk = prs.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (pr) => [
                String(pr.id),
                String(pr.repo_id),
                pr.number,
                pr.author_login,
                pr.title,
                pr.state,
                pr.is_draft,
                pr.html_url,
                pr.base_ref,
                pr.head_ref,
                pr.additions,
                pr.deletions,
                pr.changed_files,
                pr.created_at,
                pr.closed_at,
                pr.merged_at
            ]);
            const result = await client.query(
                `INSERT INTO pr_event (
                    id, repo_id, number, author_login, title, state,
                    is_draft, html_url, base_ref, head_ref,
                    additions, deletions, changed_files,
                    created_at, closed_at, merged_at
                 ) VALUES ${text}
                 ON CONFLICT (id) DO UPDATE SET
                    state = EXCLUDED.state,
                    is_draft = EXCLUDED.is_draft,
                    title = EXCLUDED.title,
                    additions = EXCLUDED.additions,
                    deletions = EXCLUDED.deletions,
                    changed_files = EXCLUDED.changed_files,
                    closed_at = EXCLUDED.closed_at,
                    merged_at = EXCLUDED.merged_at,
                    ingested_at = NOW()`,
                params
            );
            upserted += result.rowCount ?? 0;
        }
    });
    return upserted;
}

/** Get PRs for a repo, optionally filtered by state, with avatar URLs from contributor_profile. */
export async function getPrsByRepo(
    repoId: number,
    options?: { state?: "open" | "closed" | "all" }
): Promise<PrEventWithAvatarRow[]> {
    const conditions = ["pe.repo_id = $1"];
    const params: unknown[] = [repoId];

    if (options?.state && options.state !== "all") {
        conditions.push("pe.state = $2");
        params.push(options.state);
    }

    return query<PrEventWithAvatarRow>(
        `SELECT pe.*,
                cp.avatar_url AS author_avatar_url
         FROM pr_event pe
         LEFT JOIN contributor_profile cp ON cp.login = pe.author_login
         WHERE ${conditions.join(" AND ")}
         ORDER BY pe.created_at DESC`,
        params
    );
}
