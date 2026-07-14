-- Persistent key storage for Hotbox E2E encryption.
-- Replaces /tmp/hotbox/<org>/pubkeys.json and wrapped-bundles.json
-- which were ephemeral per Vercel serverless cold start.
--
-- Run once against the Supabase project:
--   psql $DATABASE_URL -f migrations/002_hotbox_keys.sql

CREATE TABLE IF NOT EXISTS hotbox_keys (
  org_id     TEXT        NOT NULL,
  key_type   TEXT        NOT NULL,  -- 'pubkey' | 'wrapped' | 'probe'
  key_path   TEXT        NOT NULL,  -- memberId for pubkey; 'chatId:memberId' for wrapped
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key_type, key_path)
);

CREATE INDEX IF NOT EXISTS idx_hotbox_keys_org_type ON hotbox_keys (org_id, key_type);
