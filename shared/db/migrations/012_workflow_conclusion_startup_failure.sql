-- Migration 012: Add 'startup_failure' to workflow conclusion check constraints
-- GitHub API can return 'startup_failure' as a workflow run conclusion,
-- which was missing from the original check constraints.

-- Drop and recreate the check constraint on workflow_event
ALTER TABLE workflow_event DROP CONSTRAINT IF EXISTS workflow_event_conclusion_check;
ALTER TABLE workflow_event ADD CONSTRAINT workflow_event_conclusion_check
    CHECK (conclusion IN ('success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale', 'startup_failure'));

-- Drop and recreate the check constraint on workflow_job
ALTER TABLE workflow_job DROP CONSTRAINT IF EXISTS workflow_job_conclusion_check;
ALTER TABLE workflow_job ADD CONSTRAINT workflow_job_conclusion_check
    CHECK (conclusion IN ('success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale', 'startup_failure'));
