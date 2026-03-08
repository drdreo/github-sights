-- Add FK constraints with CASCADE to tables that were previously cleaned up manually.

-- contributor_snapshot: add FK to owner(login)
ALTER TABLE contributor_snapshot
    ADD CONSTRAINT fk_contributor_snapshot_owner
    FOREIGN KEY (owner_login) REFERENCES owner(login) ON DELETE CASCADE;

-- daily_activity: add FK to owner(login)
ALTER TABLE daily_activity
    ADD CONSTRAINT fk_daily_activity_owner
    FOREIGN KEY (owner_login) REFERENCES owner(login) ON DELETE CASCADE;
