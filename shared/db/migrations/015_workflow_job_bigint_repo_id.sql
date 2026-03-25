-- Migration 015: workflow_job.repo_id INTEGER → BIGINT
-- Migration 011 created workflow_job after migration 005 widened repository_meta.id
-- to BIGINT, but used INTEGER for the repo_id FK. Align it with the parent column.

ALTER TABLE workflow_job
    ALTER COLUMN repo_id SET DATA TYPE BIGINT;
