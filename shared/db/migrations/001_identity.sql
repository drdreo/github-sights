-- Migration 001: Identity Layer
-- Owner, repository metadata, contributor profiles, and config
-- These are small, mutable tables that form the referential backbone.

-- ── Owner ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS owner (
    login           TEXT PRIMARY KEY,
    type            TEXT NOT NULL CHECK (type IN ('user', 'org')),
    avatar_url      TEXT,
    html_url        TEXT,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Repository Metadata ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repository_meta (
    id              INTEGER PRIMARY KEY,
    owner_login     TEXT NOT NULL REFERENCES owner(login) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    full_name       TEXT NOT NULL UNIQUE,
    description     TEXT,
    html_url        TEXT,
    is_private      BOOLEAN NOT NULL DEFAULT FALSE,
    is_fork         BOOLEAN NOT NULL DEFAULT FALSE,
    language        TEXT,
    default_branch  TEXT,
    stargazers_count INTEGER NOT NULL DEFAULT 0,
    forks_count     INTEGER NOT NULL DEFAULT 0,
    open_issues_count INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    pushed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_repository_meta_owner
    ON repository_meta(owner_login);

-- ── Contributor Profile ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contributor_profile (
    login           TEXT PRIMARY KEY,
    avatar_url      TEXT,
    html_url        TEXT,
    name            TEXT,
    email           TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Config (migrated from old schema) ────────────────────────────────────────────
-- This replaces the old `config` table. The migration runner will handle
-- the transition from the old table to this one.

CREATE TABLE IF NOT EXISTS owner_config (
    owner           TEXT PRIMARY KEY REFERENCES owner(login) ON DELETE CASCADE,
    token           TEXT NOT NULL,
    owner_type      TEXT NOT NULL CHECK (owner_type IN ('user', 'org')),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
