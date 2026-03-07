# AGENTS.md — Project Rules for AI Agents

## Database Architecture Rules

This project follows an **event-sourced + pre-aggregated snapshot** architecture.
See `DATA_DESIGN_B_EVENT_SOURCED.md` for the full design document.

### Data Flow (mandatory)

```
GitHub API → raw events (commit_event, pr_event, ...) → aggregation pipeline → snapshots → API responses
```

### Rules

1. **Serve from snapshots, not raw events** — Dashboard pages, contributor stats, and repo overviews must read from pre-aggregated snapshot tables (`owner_snapshot`, `repo_snapshot`, `contributor_snapshot`, `daily_activity`). Never compute aggregates at query time.

2. **Enrich via SQL JOINs, not application-level lookups** — When raw event queries need supplementary data (e.g., `avatar_url` from `contributor_profile`), add a `LEFT JOIN` in the SQL query itself. Do NOT fetch data in the route handler and merge it in application code.

    ```sql
    -- CORRECT: JOIN in the query
    SELECT ce.*, cp.avatar_url
    FROM commit_event ce
    LEFT JOIN contributor_profile cp ON cp.login = ce.author_login
    WHERE ce.repo_id = $1

    -- WRONG: separate lookup in route handler
    const commits = await getCommitsByRepo(repoId);
    const avatars = await getAvatarsByLogins(logins);  // don't do this
    commits.forEach(c => c.avatar_url = avatars.get(c.login));
    ```

3. **No on-the-fly patching** — If data is missing from a query response, fix the query or the aggregation pipeline. Do not add ad-hoc lookup helpers in route handlers to compensate.

4. **Raw event queries are for detail views only** — Commits list, PR list, and similar paginated detail views may query event tables directly (they're indexed). But even these queries should JOIN identity tables for display fields rather than resolving them in application code.

5. **Aggregation rebuilds snapshots** — After sync (or progressively per-repo), the aggregation pipeline rebuilds snapshot tables from raw events. Snapshots are the source of truth for all aggregate/summary data served to the frontend.
