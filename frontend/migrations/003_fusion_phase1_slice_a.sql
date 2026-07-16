-- Hotbox Fusion Phase 1 Slice A — auth + org + agent foundations
-- Apply via Supabase dashboard SQL editor or:
--   psql $DATABASE_URL -f migrations/003_fusion_phase1_slice_a.sql

-- orgs
CREATE TABLE IF NOT EXISTS orgs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- users (human headmaster accounts)
-- Service role bypasses RLS; policies deferred until client-direct access in Phase 2+
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'headmaster',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_org_id_idx ON users(org_id);

-- refresh_tokens (SHA-256 hashed; raw token returned to client once then discarded)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx ON refresh_tokens(expires_at);

-- agent_accounts (email = name@{org_slug}.internal; api_token raw for MVP)
CREATE TABLE IF NOT EXISTS agent_accounts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  role         TEXT        NOT NULL,
  email        TEXT        NOT NULL UNIQUE,
  password_hash TEXT       NOT NULL,
  api_token    TEXT        NOT NULL UNIQUE,
  llm_provider TEXT,
  llm_model    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS agent_accounts_org_id_idx ON agent_accounts(org_id);

-- org_llm_keys (AES-256-GCM encrypted; LLM_KEY_SECRET rotation requires re-encrypt all rows)
CREATE TABLE IF NOT EXISTS org_llm_keys (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  provider         TEXT        NOT NULL,
  key_encrypted    TEXT        NOT NULL,
  key_iv           TEXT        NOT NULL,
  active           BOOLEAN     NOT NULL DEFAULT false,
  models_available TEXT[],
  validated_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);
CREATE INDEX IF NOT EXISTS org_llm_keys_org_id_idx ON org_llm_keys(org_id);
-- Only one active key per org per provider is enforced; one active total per org via partial index
CREATE UNIQUE INDEX IF NOT EXISTS org_llm_keys_one_active ON org_llm_keys(org_id) WHERE active = true;

-- member_pages (minimal; full profile lens deferred to Slice B)
CREATE TABLE IF NOT EXISTS member_pages (
  agent_id     UUID PRIMARY KEY REFERENCES agent_accounts(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  skills       TEXT[],
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS enabled; all policies deferred to Phase 2 (server-side service-role key bypasses RLS)
ALTER TABLE orgs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_llm_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_pages ENABLE ROW LEVEL SECURITY;
