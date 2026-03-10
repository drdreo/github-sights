-- Session table for GitHub OAuth
CREATE TABLE IF NOT EXISTS session (
    id          TEXT PRIMARY KEY,               -- random session ID (stored in httpOnly cookie)
    github_id   BIGINT NOT NULL,                -- GitHub user ID
    github_login TEXT NOT NULL,                  -- GitHub username
    avatar_url  TEXT,                            -- GitHub avatar URL
    access_token TEXT NOT NULL,                  -- OAuth access token (gho_...)
    scopes      TEXT,                            -- granted OAuth scopes
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_session_github_id ON session (github_id);
CREATE INDEX IF NOT EXISTS idx_session_expires ON session (expires_at);
