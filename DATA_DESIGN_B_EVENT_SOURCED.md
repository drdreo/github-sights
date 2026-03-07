# Design B: Event-Sourced + Pre-Aggregated Materialized Views

> **Philosophy**:
> Store raw events (commits, PRs, workflow runs) as immutable facts.
> Pre-compute all dashboard views as materialized snapshots.
> Reads are instant — zero JOINs at query time.
> Writes trigger async aggregation pipelines.

## Core Concept

```
                    ┌─────────────┐
                    │  GitHub API │
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
│     created_at           │
└──────────────────────────┘

┌──────────────────────────┐
│    owner_config          │
├──────────────────────────┤
│ PK  owner            FK  │──► owner
│     token                │
│     owner_type (user|org)│
│     sync_since           │
│     updated_at           │
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
│ PK  id             BIGINT│
│     owner_login      FK  │──► owner
│     name                 │
│     full_name        (U) │
│     description          │
│     html_url             │
│     is_private           │
│     is_fork              │
│     language             │
│     default_branch       │
│     stargazers_count     │
│     forks_count          │
│     open_issues_count    │
│     created_at           │
│     updated_at           │
│     pushed_at            │
└──────────────────────────┘
```

### Layer 2: Event Store (append-only, immutable)

```
┌──────────────────────────┐
│    commit_event          │   (one row per commit, never updated)
├──────────────────────────┤
│ PK  sha                  │
│     repo_id   BIGINT FK  │──► repository_meta
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
│ PK  id            BIGINT │
│     repo_id   BIGINT FK  │──► repository_meta
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
│ PK  id            BIGINT │
│     repo_id   BIGINT FK  │──► repository_meta
│     workflow_name        │
│     workflow_path        │   (".github/workflows/ci.yml")
│     actor_login          │──► contributor_profile (soft ref)
│     run_number           │
│     status               │   (completed|in_progress|queued)
│     conclusion           │   (success|failure|cancelled|skipped|
│                          │    timed_out|action_required|neutral|stale)
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
├─────────────────────────────────┤   (one all-time row per owner,
│ PK  owner_login             FK  │    recomputed after each sync)
│ --- stats ----------------------│
│     total_repos                 │
│     total_commits               │
│     total_prs                   │
│     open_prs                    │
│     merged_prs                  │
│     total_additions      BIGINT │
│     total_deletions      BIGINT │
│     unique_contributors         │
│     most_active_repo_name       │
│     most_active_repo_commits    │
│     longest_streak              │
│     current_streak              │
│     avg_commits_per_day    REAL │
│ --- embedded arrays (JSONB) ----│
│     top_contributors     JSONB  │   [{login, avatar_url, commits, additions, deletions}]
│     language_breakdown   JSONB  │   [{language, count, color}]
│ --- workflow summary -----------│
│     total_workflow_runs         │
│     workflow_success_rate  REAL │
│     avg_workflow_duration  REAL │
│ --- metadata -------------------│
│     computed_at                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│    repo_snapshot                │   → powers Repo detail + Repositories page
├─────────────────────────────────┤
│ PK  repo_id        BIGINT  FK   │
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
│     total_additions      BIGINT │
│     total_deletions      BIGINT │
│     contributor_count           │
│ --- workflow health             │
│     ci_success_rate        REAL │
│     ci_avg_duration_seconds REAL│
│     last_ci_conclusion          │   (success|failure — "badge" status)
│ --- embedded JSONB              │
│     top_contributors    JSONB   │   [{login, avatar_url, commits, additions, deletions}]
│ --- metadata                    │
│     computed_at                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│    contributor_snapshot         │   → powers Contributors page
├─────────────────────────────────┤   (one all-time row per owner+contributor,
│ PK  owner_login             FK  │    recomputed after each sync)
│ PK  contributor_login           │
│     avatar_url                  │
│     html_url                    │
│ --- aggregated stats            │
│     total_commits               │
│     total_additions      BIGINT │
│     total_deletions      BIGINT │
│     total_prs                   │
│     total_prs_merged            │
│     repos                JSONB  │   ["repo-a", "repo-b"]
│     repo_count                  │
│ --- workflow stats              │
│     workflow_runs_triggered     │
│     workflow_failure_rate  REAL │
│ --- activity                    │
│     first_commit_at             │
│     last_commit_at              │
│     active_days                 │
│ --- metadata                    │
│     computed_at                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│    daily_activity               │   → powers charts, heatmaps, trends
├─────────────────────────────────┤
│     owner_login             FK  │
│     repo_id     BIGINT  FK (N)  │   (nullable — NULL = owner-level aggregate)
│     contributor_login    FK (N) │   (nullable — NULL = repo/owner-level aggregate)
│ PK  date                        │   (composite unique: owner, date, repo_id, contributor)
│     commit_count                │
│     additions            BIGINT │
│     deletions            BIGINT │
│     pr_opened                   │
│     pr_merged                   │
│     pr_closed                   │
│     workflow_runs               │
│     workflow_failures           │
│     computed_at                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│    sync_state                   │   → tracks incremental sync progress
├─────────────────────────────────┤
│ PK  owner_login                 │
│ PK  repo_id        BIGINT  FK   │──► repository_meta
│ PK  resource_type               │   (commits|pulls|workflows)
│     last_synced_at              │
│     earliest_synced_at          │   (how far back we've fetched)
│     last_cursor                 │
│     error_count                 │
│     last_error                  │
└─────────────────────────────────┘
```

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
│  5. Rebuild contributor_snapshot per owner      │
│     SUM across repos from events                │
│                                                 │
│  6. Rebuild owner_snapshot                      │
│     Aggregate from repo_snapshots               │
│                                                 │
│  Steps 3-6 can run in PARALLEL                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Tradeoffs

| Aspect                   | Assessment                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **Read performance**     | Excellent — every page is a single-row or single-table scan, zero JOINs                   |
| **Write performance**    | Moderate — events are fast appends, but snapshots need rebuild after sync                 |
| **Data integrity**       | Moderate — snapshots can drift from events if pipeline fails (need idempotent rebuild)    |
| **Query flexibility**    | Limited for ad-hoc queries — you get what's pre-computed. New views = new snapshot tables |
| **Schema evolution**     | Moderate — adding new snapshot fields requires pipeline changes + backfill                |
| **Complexity**           | Different — simpler reads, but aggregation pipeline is a new system to maintain           |
| **Frontend impact**      | Minimal — API DTOs match snapshot shapes almost 1:1                                       |
| **Workflow stats**       | Ready from day one — baked into every snapshot level                                      |
| **LOC tracking**         | First-class — in events AND rolled up into every snapshot                                 |
| **Contributor tracking** | First-class — `contributor_snapshot` is the pre-built view                                |
| **Time-range queries**   | Via daily_activity time-series; snapshots are all-time only                               |
| **Historical trends**    | Via daily_activity; snapshots don't retain period history                                 |

## Data Cascade Cleanup

Deleting an owner (`DELETE FROM owner WHERE login = ?`) triggers a full cascading cleanup of all associated data via FK
constraints:

```
owner DELETE
  ├→ owner_config          (FK CASCADE)
  ├→ owner_snapshot        (FK CASCADE)
  ├→ contributor_snapshot   (FK CASCADE)
  ├→ daily_activity         (FK CASCADE)
  └→ repository_meta        (FK CASCADE)
       ├→ commit_event      (FK CASCADE)
       ├→ pr_event          (FK CASCADE)
       ├→ workflow_event    (FK CASCADE)
       ├→ repo_snapshot     (FK CASCADE)
       └→ sync_state        (FK CASCADE)
```

All tables with an `owner_login` or `repo_id` reference use `ON DELETE CASCADE`, so a single `DELETE FROM owner` is
enough to wipe every row tied to that owner — no manual cleanup needed.
