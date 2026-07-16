-- Hotbox Phase 2b — invite_tokens for org-linking flow
-- Apply via Supabase dashboard SQL editor or:
--   psql $DATABASE_URL -f migrations/004_invite_tokens.sql

CREATE TABLE IF NOT EXISTS invite_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL UNIQUE,
  role            TEXT        NOT NULL DEFAULT 'member',
  created_by      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  used_by_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_tokens_org_id_idx    ON invite_tokens(org_id);
CREATE INDEX IF NOT EXISTS invite_tokens_expires_at_idx ON invite_tokens(expires_at);

-- Service role bypasses RLS; policies deferred to Phase 3
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
