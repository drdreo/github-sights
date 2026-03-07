// ── Sync Progress Store ─────────────────────────────────────────────────────────
//
// In-memory progress tracking for owner syncs.
// Used by the polling endpoint to report progress to the client.

export interface SyncProgress {
    status: "fetching_repos" | "syncing_repos" | "aggregating" | "complete" | "error";
    totalRepos: number;
    syncedRepos: number;
    currentRepo: string | null;
    totalEvents: number;
    errors: string[];
    startedAt: number;
}

const store = new Map<string, SyncProgress>();

export function initProgress(owner: string): void {
    store.set(owner.toLowerCase(), {
        status: "fetching_repos",
        totalRepos: 0,
        syncedRepos: 0,
        currentRepo: null,
        totalEvents: 0,
        errors: [],
        startedAt: Date.now()
    });
}

export function updateProgress(owner: string, patch: Partial<SyncProgress>): void {
    const key = owner.toLowerCase();
    const current = store.get(key);
    if (current) {
        store.set(key, { ...current, ...patch });
    }
}

export function getProgress(owner: string): SyncProgress | undefined {
    return store.get(owner.toLowerCase());
}

export function clearProgress(owner: string): void {
    store.delete(owner.toLowerCase());
}
