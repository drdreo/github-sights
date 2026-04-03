# GitHub Sights - The full picture of your GitHub activity

GitHub's built-in insights only scratch the surface. GitHub Sights gives you deep analytics you've been missing.

Connect your GitHub account in seconds, and GitHub Sights syncs your repository data for interactive dashboards covering commits, pull requests, contributor activity, and lines-of-code trends across all your repos.

## What you get

### Dashboard Overview

A brief overview of your GitHub presence with commit trends, language distribution, and activity heatmaps.

### Repository Analytics

Browse every repository with key metrics like stars, forks, commit counts, and PR stats. Drill into any repo to see commit history, contributor breakdowns, and code change trends over time.

### Contributor Insights

See who's contributing, how much, and where. View individual contributor profiles with daily activity charts, PR metrics, lines added/deleted, active days, and per-repo breakdowns.

#### Development

## Frontend

React. on Cloudflare Workers
Deploy web app via `wrangler depoly`.

## Backend

### Server

Deno. on Deno Deploy
Deploy server via `deno deploy` but the repository is connected anyway and auto-deploys.

### Crawler

Deno. on Railway
Will auto-generate a new docker image that railway listens to.

### Architecture

Static frontend app is hosted as a Cloudflare worker.
Server app is deployed on Deno which will sleep on idle requests within minutes.
Crawler app is hosted on Railway which sleeps on inactivity after 10 minutes.

#### Wake chain

All three services can sleep independently. The wake chain ensures sync jobs
resume even after prolonged inactivity:

```
Client polls /api/sync/progress/:owner
  → Deno server wakes up (Deno auto-wakes on HTTP)
  → Server reads sync_job from DB
  → If the job's heartbeat (claimed_at) is stale (>2 min), server POSTs /wake to the crawler
  → Railway wakes the crawler on the inbound request
  → Crawler resumes draining the job queue
```

The server acts as the bridge: a client progress poll can transitively wake the
crawler, so no job stays stuck in "running" after the crawler scales to zero.
