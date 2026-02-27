-- Migration 004: Drop legacy tables
-- These tables are replaced by the new event-sourced schema:
--   config        → owner_config      (001_identity.sql)
--   repo_commits  → commit_event      (002_events.sql)
--   data_cache    → owner_snapshot +   (003_snapshots.sql)
--                   repo_snapshot +
--                   contributor_snapshot +
--                   daily_activity

DROP TABLE IF EXISTS data_cache;
DROP TABLE IF EXISTS repo_commits;
DROP TABLE IF EXISTS config;
