Split Architecture: API + Crawler on Railway hosting instead of Deno

Why
Deno Deploy kills isolates and doesn't support Deno.cron. Move to Railway with two services sharing one Postgres DB.

Structure

shared/           ← extract from server/: db/, scraper/, config.ts
server/           ← API only (routes, mappers, errors) + Dockerfile
crawler/          ← NEW: queue processor + Dockerfile

Make sure we do not break the frontend contract.

Look into if the current queue based architecture is still optimal with one shared Azure hosted postgres db.