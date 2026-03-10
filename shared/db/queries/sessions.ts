// ── Session Queries ───────────────────────────────────────────────────────────────
//
// CRUD operations for the session table (GitHub OAuth sessions).

import { queryOne, execute } from "../pool.ts";
import type { SessionRow } from "../types.ts";

export type { SessionRow };

/** Insert a new session row and return it. */
export async function createSession(params: {
    id: string;
    github_id: number;
    github_login: string;
    avatar_url: string | null;
    access_token: string;
    scopes: string | null;
}): Promise<SessionRow> {
    const row = await queryOne<SessionRow>(
        `INSERT INTO session (id, github_id, github_login, avatar_url, access_token, scopes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
            params.id,
            params.github_id,
            params.github_login,
            params.avatar_url,
            params.access_token,
            params.scopes
        ]
    );
    if (!row) throw new Error("[sessions] Failed to create session");
    return row;
}

/** Get a non-expired session by ID, or null if not found / expired. */
export async function getSession(id: string): Promise<SessionRow | null> {
    return queryOne<SessionRow>(`SELECT * FROM session WHERE id = $1 AND expires_at > NOW()`, [id]);
}

/** Delete a session by ID. */
export async function deleteSession(id: string): Promise<void> {
    await execute("DELETE FROM session WHERE id = $1", [id]);
}

/** Delete all expired sessions. Returns the number of rows removed. */
export async function deleteExpiredSessions(): Promise<number> {
    const result = await execute("DELETE FROM session WHERE expires_at <= NOW()");
    return result.rowCount ?? 0;
}
