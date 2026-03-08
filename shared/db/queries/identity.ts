// ── Identity Queries ─────────────────────────────────────────────────────────────
//
// CRUD for owner, repository_meta, and contributor_profile tables.

import { query, queryOne, execute, transaction } from "../pool.ts";
import { buildMultiRowValues } from "./events.ts";
import type { OwnerRow, RepositoryMetaRow, ContributorProfileRow } from "../types.ts";

const BATCH_SIZE = 500;

// ── Owner ────────────────────────────────────────────────────────────────────────

export async function upsertOwner(
    login: string,
    type: "user" | "org",
    avatarUrl?: string | null,
    htmlUrl?: string | null
): Promise<void> {
    console.log(`Upserting owner ${type}:${login}`);
    await execute(
        `INSERT INTO owner (login, type, avatar_url, html_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (login) DO UPDATE SET
           type = $2, avatar_url = COALESCE($3, owner.avatar_url),
           html_url = COALESCE($4, owner.html_url)`,
        [login, type, avatarUrl ?? null, htmlUrl ?? null]
    );
}

export async function getOwner(login: string): Promise<OwnerRow | null> {
    return queryOne<OwnerRow>("SELECT * FROM owner WHERE login = $1", [login]);
}

export async function updateOwnerSyncedAt(login: string): Promise<void> {
    await execute("UPDATE owner SET last_synced_at = NOW() WHERE login = $1", [login]);
}

// ── Repository Metadata ──────────────────────────────────────────────────────────

export interface UpsertRepoInput {
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
    created_at: string | null;
    updated_at: string | null;
    pushed_at: string | null;
}

/** Upsert a single repository. */
export async function upsertRepo(repo: UpsertRepoInput): Promise<void> {
    await execute(
        `INSERT INTO repository_meta (
            id, owner_login, name, full_name, description, html_url,
            is_private, is_fork, language, default_branch,
            stargazers_count, forks_count, open_issues_count,
            created_at, updated_at, pushed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
            owner_login = $2, name = $3, full_name = $4, description = $5,
            html_url = $6, is_private = $7, is_fork = $8, language = $9,
            default_branch = $10, stargazers_count = $11, forks_count = $12,
            open_issues_count = $13, created_at = $14, updated_at = $15,
            pushed_at = $16`,
        [
            repo.id,
            repo.owner_login,
            repo.name,
            repo.full_name,
            repo.description,
            repo.html_url,
            repo.is_private,
            repo.is_fork,
            repo.language,
            repo.default_branch,
            repo.stargazers_count,
            repo.forks_count,
            repo.open_issues_count,
            repo.created_at,
            repo.updated_at,
            repo.pushed_at
        ]
    );
}

/** Batch upsert repositories using multi-row VALUES inside a single transaction. */
export async function upsertRepos(repos: UpsertRepoInput[]): Promise<void> {
    if (repos.length === 0) return;

    console.log(`Upserting ${repos.length} repos`);

    await transaction(async (client) => {
        // Clear stale full_name values that would conflict with incoming repos.
        // This handles renamed/transferred/deleted repos whose old full_name
        // is now used by a different repo id.
        const fnParams = repos.map((_, i) => `$${i + 1}`).join(",");
        const idParams = repos.map((_, i) => `$${repos.length + i + 1}`).join(",");
        await client.query(
            `UPDATE repository_meta SET full_name = '__stale_' || id
             WHERE full_name IN (${fnParams})
               AND id NOT IN (${idParams})`,
            [...repos.map((r) => r.full_name), ...repos.map((r) => r.id)]
        );

        for (let i = 0; i < repos.length; i += BATCH_SIZE) {
            const chunk = repos.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (r) => [
                r.id,
                r.owner_login,
                r.name,
                r.full_name,
                r.description,
                r.html_url,
                r.is_private,
                r.is_fork,
                r.language,
                r.default_branch,
                r.stargazers_count,
                r.forks_count,
                r.open_issues_count,
                r.created_at,
                r.updated_at,
                r.pushed_at
            ]);
            await client.query(
                `INSERT INTO repository_meta (
                    id, owner_login, name, full_name, description, html_url,
                    is_private, is_fork, language, default_branch,
                    stargazers_count, forks_count, open_issues_count,
                    created_at, updated_at, pushed_at
                 ) VALUES ${text}
                 ON CONFLICT (id) DO UPDATE SET
                    owner_login = EXCLUDED.owner_login,
                    name = EXCLUDED.name,
                    full_name = EXCLUDED.full_name,
                    description = EXCLUDED.description,
                    html_url = EXCLUDED.html_url,
                    is_private = EXCLUDED.is_private,
                    is_fork = EXCLUDED.is_fork,
                    language = EXCLUDED.language,
                    default_branch = EXCLUDED.default_branch,
                    stargazers_count = EXCLUDED.stargazers_count,
                    forks_count = EXCLUDED.forks_count,
                    open_issues_count = EXCLUDED.open_issues_count,
                    created_at = EXCLUDED.created_at,
                    updated_at = EXCLUDED.updated_at,
                    pushed_at = EXCLUDED.pushed_at`,
                params
            );
        }
    });
}

/** Get all repos for an owner, excluding forks by default. */
export async function getReposByOwner(
    ownerLogin: string,
    options?: { includeForks?: boolean }
): Promise<RepositoryMetaRow[]> {
    const forkFilter = options?.includeForks ? "" : " AND is_fork = FALSE";
    return query<RepositoryMetaRow>(
        `SELECT * FROM repository_meta
         WHERE owner_login = $1${forkFilter}
         ORDER BY pushed_at DESC NULLS LAST`,
        [ownerLogin]
    );
}

/** Get a single repo by owner + name. */
export async function getRepoByName(
    ownerLogin: string,
    repoName: string
): Promise<RepositoryMetaRow | null> {
    return queryOne<RepositoryMetaRow>(
        "SELECT * FROM repository_meta WHERE owner_login = $1 AND name = $2",
        [ownerLogin, repoName]
    );
}

/** Get a single repo by its GitHub ID. */
export async function getRepoById(id: number): Promise<RepositoryMetaRow | null> {
    return queryOne<RepositoryMetaRow>("SELECT * FROM repository_meta WHERE id = $1", [id]);
}

// ── Contributor Profile ──────────────────────────────────────────────────────────

export interface UpsertContributorInput {
    login: string;
    avatar_url?: string | null;
    html_url?: string | null;
    name?: string | null;
    email?: string | null;
}

/** Upsert a single contributor profile. */
export async function upsertContributor(contrib: UpsertContributorInput): Promise<void> {
    await execute(
        `INSERT INTO contributor_profile (login, avatar_url, html_url, name, email, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (login) DO UPDATE SET
           avatar_url = COALESCE($2, contributor_profile.avatar_url),
           html_url = COALESCE($3, contributor_profile.html_url),
           name = COALESCE($4, contributor_profile.name),
           email = COALESCE($5, contributor_profile.email),
           updated_at = NOW()`,
        [
            contrib.login,
            contrib.avatar_url ?? null,
            contrib.html_url ?? null,
            contrib.name ?? null,
            contrib.email ?? null
        ]
    );
}

/** Batch upsert contributor profiles using multi-row VALUES. */
export async function upsertContributors(contribs: UpsertContributorInput[]): Promise<void> {
    if (contribs.length === 0) return;

    const now = new Date().toISOString();
    await transaction(async (client) => {
        for (let i = 0; i < contribs.length; i += BATCH_SIZE) {
            const chunk = contribs.slice(i, i + BATCH_SIZE);
            const { text, params } = buildMultiRowValues(chunk, (c) => [
                c.login,
                c.avatar_url ?? null,
                c.html_url ?? null,
                c.name ?? null,
                c.email ?? null,
                now
            ]);
            await client.query(
                `INSERT INTO contributor_profile (login, avatar_url, html_url, name, email, updated_at)
                 VALUES ${text}
                 ON CONFLICT (login) DO UPDATE SET
                   avatar_url = COALESCE(EXCLUDED.avatar_url, contributor_profile.avatar_url),
                   html_url = COALESCE(EXCLUDED.html_url, contributor_profile.html_url),
                   name = COALESCE(EXCLUDED.name, contributor_profile.name),
                   email = COALESCE(EXCLUDED.email, contributor_profile.email),
                   updated_at = EXCLUDED.updated_at`,
                params
            );
        }
    });
}

/** Get contributor profile by login. */
export async function getContributor(login: string): Promise<ContributorProfileRow | null> {
    return queryOne<ContributorProfileRow>("SELECT * FROM contributor_profile WHERE login = $1", [
        login
    ]);
}

/**
 * Delete all data for an owner. Deleting the owner row cascades to:
 * repository_meta → commit_event, pr_event, workflow_event, repo_snapshot, sync_state
 * owner_config, owner_snapshot, contributor_snapshot, daily_activity.
 *
 * Returns true if the owner existed.
 */
export async function deleteOwnerData(owner: string): Promise<boolean> {
    const result = await execute("DELETE FROM owner WHERE LOWER(login) = LOWER($1)", [owner]);
    return (result.rowCount ?? 0) > 0;
}

/** Batch-fetch avatar URLs for a set of logins. Returns a Map<login, avatar_url>. */
export async function getAvatarsByLogins(logins: string[]): Promise<Map<string, string>> {
    if (logins.length === 0) return new Map();

    const rows = await query<{ login: string; avatar_url: string | null }>(
        `SELECT login, avatar_url FROM contributor_profile WHERE login = ANY($1)`,
        [logins]
    );

    const map = new Map<string, string>();
    for (const r of rows) {
        if (r.avatar_url) map.set(r.login, r.avatar_url);
    }
    return map;
}
