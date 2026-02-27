# Design B: Event-Sourced + Pre-Aggregated Materialized Views

> **Philosophy**: Store raw events (commits, PRs, workflow runs) as immutable facts. Pre-compute all dashboard views as materialized snapshots. Reads are instant — zero JOINs at query time. Writes trigger async aggregation pipelines.

---

## Current Problems This Solves

| Problem | How This Fixes It |
|---------|-------------------|
| `OverviewStats` is a god-object computed ad-hoc | `owner_snapshot` IS the pre-computed stats — served directly, no computation at read time |
| Dashboard requires multiple queries/JOINs | Single row read from `owner_snapshot` |
| `CommitAuthor` duplicates user info in every commit | Raw events store `author_login` as a reference; identity resolved in `contributor_profile` |
| Stats go stale between syncs | Snapshots rebuilt incrementally after each sync batch |
| No way to time-travel / compare periods | Snapshots are timestamped — keep historical snapshots for trend analysis |
| No workflow/CI data at all | `workflow_event` + `repo_snapshot` includes CI health metrics |
| Contributor overview is expensive to compute | `contributor_snapshot` pre-aggregated per owner |

---

## Core Concept

```
                    ┌─────────────┐
                    │  GitHub API  │
                    └──────┬──────┘
                           │
                     SCRAPE / SYNC
                           │
                           ▼
              ┌────────────────────────┐
              │     EVENT STORE        │
              │  (immutable raw facts) │
              │                        │
              │  • commit_event        │
              │  • pr_event            │
              │  • workflow_event      │
              │  • contributor_event   │
              └────────────┬───────────┘
                           │
                    AGGREGATION PIPELINE
                    (triggered after sync)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────────────┐
    │owner_snapshot│ │repo_     │ │contributor_      │
    │              │ │snapshot  │ │snapshot          │
    │ (dashboard)  │ │(repo pg) │ │(contributors pg) │
    └──────────────┘ └──────────┘ └──────────────────┘
         │                              │
         │    ┌────────────────────┐    │
         └───►│  daily_activity    │◄───┘
              │  (time-series)     │
              └────────────────────┘
```

---

## Data Model

### Layer 1: Identity (small, mutable)

```
┌──────────────────────────┐
│    owner                 │
├──────────────────────────┤
│ PK  login                │
│     type (user|org)      │
│     avatar_url           │
│     html_url             │
│     last_synced_at       │
└──────────────────────────┘

┌──────────────────────────┐
│    contributor_profile   │
├──────────────────────────┤
│ PK  login                │
│     avatar_url           │
│     html_url             │
│     name                 │   (display name)
│     email                │
│     updated_at           │
└──────────────────────────┘

┌──────────────────────────┐
│    repository_meta       │
├──────────────────────────┤
│ PK  id                   │
│     owner_login      FK  │──► owner
│     name                 │
│     full_name        (U) │
│     description          │
│     html_url             │
│     is_private           │
│     is_fork              │
│     language             │
│     default_branch       │
│     created_at           │
└──────────────────────────┘
```

### Layer 2: Event Store (append-only, immutable)

```
┌──────────────────────────┐
│    commit_event          │   (one row per commit, never updated)
├──────────────────────────┤
│ PK  sha                  │
│     repo_id          FK  │──► repository_meta
│     author_login         │──► contributor_profile (soft ref)
│     committer_login      │──► contributor_profile (soft ref)
│     message              │
│     html_url             │
│     committed_at         │
│     additions            │
│     deletions            │
│     ingested_at          │   (when we scraped it)
└──────────────────────────┘

┌──────────────────────────┐
│    pr_event              │   (one row per PR, upserted on state change)
├──────────────────────────┤
│ PK  id                   │
│     repo_id          FK  │──► repository_meta
│     number               │
│     author_login         │──► contributor_profile (soft ref)
│     title                │
│     state                │   (open|closed)
│     is_draft             │
│     html_url             │
│     base_ref             │
│     head_ref             │
│     additions            │
│     deletions            │
│     changed_files        │
│     created_at           │
│     closed_at            │
│     merged_at            │
│     ingested_at          │
└──────────────────────────┘

┌──────────────────────────┐
│    workflow_event        │   (one row per workflow run)
├──────────────────────────┤
│ PK  id                   │
│     repo_id          FK  │──► repository_meta
│     workflow_name        │
│     workflow_path        │   (".github/workflows/ci.yml")
│     actor_login          │──► contributor_profile (soft ref)
│     run_number           │
│     status               │   (completed|in_progress|queued)
│     conclusion           │   (success|failure|cancelled|skipped)
│     head_branch          │
│     head_sha             │
│     duration_seconds     │
│     created_at           │
│     ingested_at          │
└──────────────────────────┘
```

### Layer 3: Pre-Aggregated Snapshots (materialized, rebuilt after sync)

```
┌─────────────────────────────────┐
│    owner_snapshot               │   → powers Dashboard stat cards
├─────────────────────────────────┤
│ PK  owner_login             FK  │
│     period_start                │   (filter range start)
│     period_end                  │   (filter range end)
│ --- stats ----------------------│
│     total_repos                 │
│     total_commits               │
│     total_prs                   │
│     open_prs                    │
│     merged_prs                  │
│     total_additions             │
│     total_deletions             │
│     unique_contributors         │
│     most_active_repo_name       │
│     most_active_repo_commits    │
│     longest_streak              │
│     current_streak              │
│     avg_commits_per_day         │
│ --- embedded arrays (JSONB) ----│
│     top_contributors     JSONB  │   [{login, avatar_url, commits, additions, deletions}]
│     language_breakdown   JSONB  │   [{language, count, color}]
│ --- workflow summary -----------│
│     total_workflow_runs         │
│     workflow_success_rate       │
│     avg_workflow_duration       │
│ --- metadata -------------------│
│     computed_at                  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│    repo_snapshot                │   → powers Repo detail + Repositories page
├─────────────────────────────────┤
│ PK  repo_id                 FK  │
│     owner_login             FK  │
│ --- repo metadata (denormalized)│
│     name                        │
│     description                 │
│     language                    │
│     stargazers_count            │
│     forks_count                 │
│     open_issues_count           │
│     updated_at                  │
│     pushed_at                   │
│ --- computed stats              │
│     total_commits               │
│     total_prs                   │
│     open_prs                    │
│     merged_prs                  │
│     total_additions             │
│     total_deletions             │
│     contributor_count           │
│ --- workflow health             │
│     ci_success_rate             │
│     ci_avg_duration_seconds     │
│     last_ci_conclusion          │   (success|failure — "badge" status)
│ --- embedded JSONB              │
│     top_contributors    JSONB   │   [{login, avatar_url, commits, additions, deletions}]
│ --- metadata                    │
│     computed_at                  │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│    contributor_snapshot         │   → powers Contributors page
├─────────────────────────────────┤
│     owner_login             FK  │
│ PK  contributor_login           │
│     avatar_url                  │
│     html_url                    │
│ --- aggregated stats            │
│     total_commits               │
│     total_additions             │
│     total_deletions             │
│     total_prs                   │
│     total_prs_merged            │
│     repos                JSONB  │   ["repo-a", "repo-b"]
│     repo_count                  │
│ --- workflow stats              │
│     workflow_runs_triggered     │
│     workflow_failure_rate       │
│ --- activity                    │
│     first_commit_at             │
│     last_commit_at              │
│     active_days                 │
│ --- metadata                    │
│     period_start                │
│     period_end                  │
│     computed_at                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│    daily_activity               │   → powers charts, heatmaps, trends
├─────────────────────────────────┤
│     owner_login             FK  │
│     repo_id              FK (N) │   (nullable — NULL = owner-level aggregate)
│     contributor_login    FK (N) │   (nullable — NULL = repo/owner-level aggregate)
│ PK  date                        │
│     commit_count                │
│     additions                   │
│     deletions                   │
│     pr_opened                   │
│     pr_merged                   │
│     pr_closed                   │
│     workflow_runs               │
│     workflow_failures           │
│     computed_at                 │
└─────────────────────────────────┘
```

---

## How Each Frontend Page Gets Its Data

### Dashboard (`/:owner/dashboard`)

```
// ONE read. No JOINs. Instant.
GET /api/stats/:owner?since=&until=

→ SELECT * FROM owner_snapshot
  WHERE owner_login = ? AND period_start = ? AND period_end = ?

// If snapshot doesn't exist for this date range → compute on-demand, cache.

// Commit heatmap / trends
GET /api/activity/:owner?since=&until=

→ SELECT * FROM daily_activity
  WHERE owner_login = ? AND repo_id IS NULL AND contributor_login IS NULL
  AND date BETWEEN ? AND ?
  ORDER BY date
```

**Frontend receives the exact shape it already uses** — `OverviewStats` maps 1:1 to `owner_snapshot`.

### Repo Detail (`/:owner/repo/:repo`)

```
// Repo overview: single row
GET /api/repos/:owner/:repo → SELECT * FROM repo_snapshot WHERE repo_id = ?

// Commits tab: direct event query (already indexed by repo_id + committed_at)
GET /api/repos/:owner/:repo/commits?since=&until=
→ SELECT * FROM commit_event WHERE repo_id = ? AND committed_at BETWEEN ? AND ?

// PRs tab: direct event query
GET /api/repos/:owner/:repo/pulls
→ SELECT * FROM pr_event WHERE repo_id = ?

// Contributors tab: filtered from contributor_snapshot OR sub-query
→ Filter contributor_snapshot WHERE ? = ANY(repos)
   OR compute from commit_event GROUP BY author_login
```

### Contributors (`/:owner/contributors`)

```
// ONE read. Pre-aggregated.
GET /api/contributors/:owner?since=&until=
→ SELECT * FROM contributor_snapshot
  WHERE owner_login = ? AND period_start = ? AND period_end = ?
  ORDER BY total_commits DESC
```

### Workflows (future)

```
// Already in repo_snapshot as ci_success_rate, ci_avg_duration
// Detailed view:
GET /api/repos/:owner/:repo/workflows
→ SELECT * FROM workflow_event WHERE repo_id = ? ORDER BY created_at DESC

// Aggregated:
→ daily_activity already has workflow_runs + workflow_failures per day
```

---

## Aggregation Pipeline (Server-Side)

```
┌─────────────────────────────────────────────────┐
│              AFTER SYNC COMPLETES               │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Ingest raw data → commit_event, pr_event,   │
│     workflow_event (append-only)                │
│                                                 │
│  2. Upsert contributor_profile from events      │
│     (deduplicate by login)                      │
│                                                 │
│  3. Rebuild daily_activity                      │
│     GROUP BY (owner, repo, contributor, date)   │
│     from events within sync range               │
│                                                 │
│  4. Rebuild repo_snapshot per repo              │
│     COUNT/SUM from events + workflow_event      │
│                                                 │
│  5. Rebuild contributor_snapshot per owner       │
│     SUM across repos from events                │
│                                                 │
│  6. Rebuild owner_snapshot                       │
│     Aggregate from repo_snapshots               │
│                                                 │
│  Steps 3-6 can run in PARALLEL                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Tradeoffs

| Aspect | Assessment |
|--------|------------|
| **Read performance** | Excellent — every page is a single-row or single-table scan, zero JOINs |
| **Write performance** | Moderate — events are fast appends, but snapshots need rebuild after sync |
| **Data integrity** | Moderate — snapshots can drift from events if pipeline fails (need idempotent rebuild) |
| **Query flexibility** | Limited for ad-hoc queries — you get what's pre-computed. New views = new snapshot tables |
| **Schema evolution** | Moderate — adding new snapshot fields requires pipeline changes + backfill |
| **Complexity** | Different — simpler reads, but aggregation pipeline is a new system to maintain |
| **Frontend impact** | Minimal — API DTOs match snapshot shapes almost 1:1 |
| **Workflow stats** | Ready from day one — baked into every snapshot level |
| **LOC tracking** | First-class — in events AND rolled up into every snapshot |
| **Contributor tracking** | First-class — `contributor_snapshot` is the pre-built view |
| **Time-range queries** | Natural — snapshots keyed by period, daily_activity is a time-series |
| **Historical trends** | Excellent — keep old snapshots for period-over-period comparisons |

### When This Design Shines
- Dashboard load time is critical — zero computation at read time
- You have clear, well-defined views (dashboard, repo detail, contributors) that rarely change shape
- Data is mostly read, rarely written (scrape once, read many)
- You want workflow/CI stats integrated from day one without complex JOINs
- Time-series and trend analysis are important features

### When This Design Hurts
- Ad-hoc queries ("show me all PRs by contributor X in repo Y between dates A and B") need to hit raw event tables
- Aggregation pipeline is a new piece of infrastructure to build and maintain
- If snapshot schema changes, you need a migration AND a pipeline update AND a backfill
- Storage is higher — you're storing data in events AND in snapshots (deliberate duplication)
- Eventual consistency — there's a window after sync where snapshots are stale

---

## Key Difference From Design A

| Concern | Design A (Normalized) | Design B (Event-Sourced + Snapshots) |
|---------|----------------------|--------------------------------------|
| **Read speed** | Slower (JOINs) | Instant (pre-computed) |
| **Write speed** | Faster (single table) | Slower (events + rebuild) |
| **Flexibility** | Any query possible | Only pre-computed views are fast |
| **Consistency** | Always consistent | Eventually consistent |
| **Storage** | Minimal (no duplication) | Higher (events + snapshots) |
| **New features** | Add JOINs | Add pipeline + snapshot table |
| **Debugging** | Query raw tables | Events are audit trail |
| **Frontend coupling** | Low (DTOs shaped freely) | Higher (snapshots mirror UI shape) |
