-- 017: Add event type column to workflow_event
--
-- Captures the GitHub API's run.event field (push, pull_request, schedule,
-- workflow_dispatch, dynamic, etc.). The 'dynamic' event type is used for
-- Dependabot auto-generated runs which pollute CI stats.

ALTER TABLE workflow_event ADD COLUMN IF NOT EXISTS event TEXT;
