-- =====================================================================
-- AI-Powered Competitive Programming Analyzer — Database Schema
-- Target: Neon Postgres (serverless)
-- Run this once against your Neon database before first deploy, e.g.:
--   psql "$DATABASE_URL" -f schema.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS analyses (
    id                        SERIAL PRIMARY KEY,

    -- Inputs
    leetcode_username         VARCHAR(100),
    codeforces_username       VARCHAR(100),

    -- AI-derived results (from Gemini)
    comprehensive_score       INTEGER      NOT NULL CHECK (comprehensive_score BETWEEN 0 AND 100),
    skill_level               VARCHAR(50)  NOT NULL,
    total_solved_combined     INTEGER      NOT NULL DEFAULT 0,
    strengths                 JSONB        NOT NULL DEFAULT '[]',
    weaknesses                JSONB        NOT NULL DEFAULT '[]',
    roadmap_recommendations   JSONB        NOT NULL DEFAULT '[]',
    coach_summary             TEXT,

    -- Raw source snapshots (kept for auditing / re-analysis / debugging)
    raw_leetcode_data         JSONB,
    raw_codeforces_data       JSONB,

    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Speeds up "history" lookups and duplicate-username checks
CREATE INDEX IF NOT EXISTS idx_analyses_leetcode_username
    ON analyses (leetcode_username);

CREATE INDEX IF NOT EXISTS idx_analyses_codeforces_username
    ON analyses (codeforces_username);

CREATE INDEX IF NOT EXISTS idx_analyses_created_at
    ON analyses (created_at DESC);
