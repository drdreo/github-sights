// ── Sync Job Queue Queries ───────────────────────────────────────────────────────
//
// CRUD for the sync_job table — a Postgres-backed job queue that replaces
// in-memory orchestration. Each job tracks its own progress, surviving
// crawler restarts.

import { queryOne, execute } from "../pool.ts";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface SyncJobRow {
    id: number;
    owner_login: string;
    job_type: "full_sync" | "repo_sync";
    status: "pending" | "running" | "complete" | "failed" | "cancelled";
    phase: string;
    repo_name: string | null;
    repo_ids: number[];
    repo_names: string[];
    repos_done: number;
    total_repos: number;
    current_repo: string | null;
    total_events: number;
    since_date: string | null;
    until_date: string | null;
    started_at: Date | null;
    claimed_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    errors: string[];
    last_error: string | null;
    result: unknown;
}

// ── Enqueue ──────────────────────────────────────────────────────────────────────

/**
 * Enqueue a new sync job. Returns the job, or null if one is already active
 * for this owner (unique index prevents duplicates).
 */
export async function enqueueJob(params: {
    owner_login: string;
    job_type: "full_sync" | "repo_sync";
    repo_name?: string;
    since_date?: string;
    until_date?: string;
}): Promise<SyncJobRow | null> {
    try {
        const row = await queryOne<SyncJobRow>(
            `INSERT INTO sync_job (owner_login, job_type, repo_name, since_date, until_date)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                params.owner_login,
                params.job_type,
                params.repo_name ?? null,
                params.since_date ?? null,
                params.until_date ?? null
            ]
        );
        return row;
    } catch (err: unknown) {
        // Unique constraint violation — active job already exists
        if (err instanceof Error && err.message.includes("idx_sync_job_active_owner")) {
            return null;
        }
        throw err;
    }
}

// ── Claim ────────────────────────────────────────────────────────────────────────

/**
 * Stale threshold: if a running job hasn't been claimed in this long, reclaim it.
 * Safe to interpolate in SQL — compile-time constant, never user input.
 */
const STALE_MINUTES = 2;

/**
 * Claim the next job that needs processing.
 *
 * Claimable jobs (in priority order):
 *   1. running + claimed_at IS NULL → previous tick yielded normally, ready to continue
 *   2. running + claimed_at stale   → previous tick crashed, safe to reclaim
 *   3. pending                      → new job
 *
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent claiming.
 */
export async function claimJob(): Promise<SyncJobRow | null> {
    return await queryOne<SyncJobRow>(
        `UPDATE sync_job
         SET claimed_at = NOW(),
             status = 'running',
             started_at = COALESCE(started_at, NOW())
         WHERE id = (
             SELECT id FROM sync_job
             WHERE status = 'pending'
                OR (status = 'running' AND claimed_at IS NULL)
                OR (status = 'running' AND claimed_at < NOW() - INTERVAL '${STALE_MINUTES} minutes')
             ORDER BY
                 CASE status
                     WHEN 'running' THEN 0
                     ELSE 1
                 END,
                 claimed_at NULLS FIRST,
                 created_at ASC
             LIMIT 1
             FOR UPDATE SKIP LOCKED
         )
         RETURNING *`
    );
}

/**
 * Signal that a tick finished normally but there's more work to do.
 * Clears claimed_at so the next drain tick picks it up immediately
 * (rather than waiting for the stale threshold).
 */
export async function yieldJob(jobId: number): Promise<void> {
    await execute(
        `UPDATE sync_job SET claimed_at = NULL WHERE id = $1 AND status = 'running'`,
        [jobId]
    );
}

// ── Update ───────────────────────────────────────────────────────────────────────

/**
 * Advance job state after processing. Also refreshes claimed_at to prevent
 * stale-detection from reclaiming the job mid-tick.
 */
export async function advanceJob(
    jobId: number,
    updates: {
        phase?: string;
        repos_done?: number;
        current_repo?: string | null;
        total_events?: number;
        total_repos?: number;
        repo_ids?: number[];
        repo_names?: string[];
    }
): Promise<void> {
    const setClauses: string[] = ["claimed_at = NOW()"];
    const params: unknown[] = [];
    let idx = 1;

    if (updates.phase !== undefined) {
        setClauses.push(`phase = $${idx++}`);
        params.push(updates.phase);
    }
    if (updates.repos_done !== undefined) {
        setClauses.push(`repos_done = $${idx++}`);
        params.push(updates.repos_done);
    }
    if (updates.current_repo !== undefined) {
        setClauses.push(`current_repo = $${idx++}`);
        params.push(updates.current_repo);
    }
    if (updates.total_events !== undefined) {
        setClauses.push(`total_events = $${idx++}`);
        params.push(updates.total_events);
    }
    if (updates.total_repos !== undefined) {
        setClauses.push(`total_repos = $${idx++}`);
        params.push(updates.total_repos);
    }
    if (updates.repo_ids !== undefined) {
        setClauses.push(`repo_ids = $${idx++}`);
        params.push(JSON.stringify(updates.repo_ids));
    }
    if (updates.repo_names !== undefined) {
        setClauses.push(`repo_names = $${idx++}`);
        params.push(JSON.stringify(updates.repo_names));
    }

    params.push(jobId);
    await execute(`UPDATE sync_job SET ${setClauses.join(", ")} WHERE id = $${idx}`, params);
}

// ── Complete / Fail ──────────────────────────────────────────────────────────────

/** Mark a job as successfully completed. */
export async function completeJob(jobId: number, result: unknown): Promise<void> {
    await execute(
        `UPDATE sync_job
         SET status = 'complete', phase = 'complete', completed_at = NOW(), result = $2
         WHERE id = $1`,
        [jobId, JSON.stringify(result)]
    );
}

/** Max retry attempts before permanently failing. */
const MAX_ATTEMPTS = 3;

/**
 * Mark a job as failed. Retries up to MAX_ATTEMPTS by resetting to 'pending'
 * so the next drain tick re-claims it. After exhausting retries, permanently
 * marks as 'failed'.
 */
export async function failJob(jobId: number, error: string): Promise<void> {
    const job = await queryOne<{ error_count: number }>(
        `UPDATE sync_job
         SET last_error = $2,
             errors = COALESCE(errors, '[]'::JSONB) || to_jsonb($2::TEXT),
             claimed_at = NULL
         WHERE id = $1
         RETURNING jsonb_array_length(COALESCE(errors, '[]'::JSONB)) AS error_count`,
        [jobId, error]
    );

    const attempts = job?.error_count ?? MAX_ATTEMPTS;

    if (attempts >= MAX_ATTEMPTS) {
        await execute(
            `UPDATE sync_job
             SET status = 'failed', phase = 'failed', completed_at = NOW()
             WHERE id = $1`,
            [jobId]
        );
        console.log(
            `[queue] Job #${jobId} permanently failed after ${attempts} attempts: ${error}`
        );
    } else {
        // Reset to pending for retry — next tick will re-claim
        await execute(`UPDATE sync_job SET status = 'pending' WHERE id = $1`, [jobId]);
        console.log(
            `[queue] Job #${jobId} failed (attempt ${attempts}/${MAX_ATTEMPTS}), will retry: ${error}`
        );
    }
}

/** Record a non-fatal error on a job (e.g., one repo failed but others continue). */
export async function recordJobError(jobId: number, error: string): Promise<void> {
    await execute(
        `UPDATE sync_job
         SET errors = COALESCE(errors, '[]'::JSONB) || to_jsonb($2::TEXT), last_error = $2
         WHERE id = $1`,
        [jobId, error]
    );
}

// ── Cancel ───────────────────────────────────────────────────────────────────────

/** Cancel any active job for an owner. Returns true if a job was cancelled. */
export async function cancelJob(ownerLogin: string): Promise<boolean> {
    const result = await execute(
        `UPDATE sync_job
         SET status = 'cancelled', completed_at = NOW()
         WHERE owner_login = $1 AND status IN ('pending', 'running')`,
        [ownerLogin]
    );
    return (result.rowCount ?? 0) > 0;
}

// ── Queries ──────────────────────────────────────────────────────────────────────

/** Get the active job for an owner (pending or running). */
export async function getActiveJob(ownerLogin: string): Promise<SyncJobRow | null> {
    return await queryOne<SyncJobRow>(
        `SELECT * FROM sync_job
         WHERE owner_login = $1 AND status IN ('pending', 'running')
         ORDER BY created_at DESC LIMIT 1`,
        [ownerLogin]
    );
}

/** Get the most recent job for an owner (any status). */
export async function getLatestJob(ownerLogin: string): Promise<SyncJobRow | null> {
    return await queryOne<SyncJobRow>(
        `SELECT * FROM sync_job
         WHERE owner_login = $1
         ORDER BY created_at DESC LIMIT 1`,
        [ownerLogin]
    );
}

// ── Cleanup ──────────────────────────────────────────────────────────────────────

/** Delete old completed/failed/cancelled jobs, keeping the most recent N per owner. */
export async function cleanupOldJobs(keepPerOwner: number): Promise<number> {
    const result = await execute(
        `DELETE FROM sync_job
         WHERE id NOT IN (
             SELECT id FROM (
                 SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_login ORDER BY created_at DESC) AS rn
                 FROM sync_job
             ) ranked WHERE rn <= $1
         )`,
        [keepPerOwner]
    );
    return result.rowCount ?? 0;
}
