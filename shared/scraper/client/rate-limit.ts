// ── Rate Limit Tracking ──────────────────────────────────────────────────────

import { Octokit } from "octokit";

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
export class RateLimitBudget {
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

export function getBudget(octokit: Octokit): RateLimitBudget {
    let b = budgets.get(octokit);
    if (!b) {
        b = new RateLimitBudget();
        budgets.set(octokit, b);
    }
    return b;
}

/**
 * Per-Octokit heartbeat callbacks invoked during long rate-limit pauses.
 * Keyed by Octokit instance so concurrent jobs (each with their own Octokit)
 * don't clobber each other's heartbeat.  Entries are auto-GC'd when the
 * Octokit is no longer referenced.
 */
type HeartbeatFn = (resetAt: string | null) => Promise<void>;
const heartbeats = new WeakMap<Octokit, HeartbeatFn>();

/** Register (or clear) a heartbeat callback for rate-limit pauses on a specific Octokit. */
export function setRateLimitHeartbeat(octokit: Octokit, fn: HeartbeatFn | null): void {
    if (fn) {
        heartbeats.set(octokit, fn);
    } else {
        heartbeats.delete(octokit);
    }
}

/**
 * Check rate limit budget and sleep until reset if exhausted.
 * Call this before expensive API operations (pagination loops, enrichment).
 *
 * Sleeps in 60s chunks, calling the heartbeat callback between each chunk
 * so the job's claimed_at stays fresh and the server doesn't consider it stale.
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

    const resetIso = budget.resetAt.toISOString();
    const heartbeatFn = heartbeats.get(octokit);

    // Notify the heartbeat that we're pausing (so the UI can show it)
    if (heartbeatFn) {
        try {
            await heartbeatFn(resetIso);
        } catch {
            /* best-effort */
        }
    }

    // Sleep in chunks so we can heartbeat and avoid stale-job detection
    const CHUNK_MS = 60_000;
    let remaining = waitMs;
    while (remaining > 0) {
        const sleepFor = Math.min(remaining, CHUNK_MS);
        await new Promise((resolve) => setTimeout(resolve, sleepFor));
        remaining -= sleepFor;
        if (heartbeatFn && remaining > 0) {
            try {
                await heartbeatFn(resetIso);
            } catch {
                /* best-effort */
            }
        }
    }

    // Clear the rate-limit pause indicator
    if (heartbeatFn) {
        try {
            await heartbeatFn(null);
        } catch {
            /* best-effort */
        }
    }

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
