// ── Database Module Barrel Export ─────────────────────────────────────────────────
//
// Single entry point for all database functionality.
// Import from "shared/db/index.ts" (or "shared/db/") everywhere.

// Pool & query infrastructure
export {
    initPool,
    closePool,
    isPoolAvailable,
    poolStats,
    query,
    queryOne,
    execute,
    transaction
} from "./pool.ts";
export type { QueryResult } from "./pool.ts";

// Migration runner
export { runMigrations } from "./schema.ts";

// Row types
export type {
    // Identity
    OwnerRow,
    RepositoryMetaRow,
    ContributorProfileRow,
    OwnerConfigRow,
    // Events
    CommitEventRow,
    CommitEventWithAvatarRow,
    PrEventRow,
    PrEventWithAvatarRow,
    WorkflowEventRow,
    // Snapshots
    SnapshotContributor,
    LanguageBreakdownEntry,
    OwnerSnapshotRow,
    RepoSnapshotRow,
    ContributorSnapshotRow,
    DailyActivityRow,
    SyncStateRow,
    SchemaMigrationRow
} from "./types.ts";
