-- Migration 005: password reset tokens + email verification
-- Apply via Supabase Management API (boss) or SQL editor.

-- Add email_verified_at to users (nullable; backfill existing rows as verified).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

-- Password reset tokens (48-byte raw token, sha256 stored, 1h TTL).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prt_user_id_idx    ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS prt_expires_at_idx ON password_reset_tokens(expires_at);
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Email verification tokens (48-byte raw token, sha256 stored, 24h TTL).
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT        NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evt_user_id_idx ON email_verification_tokens(user_id);
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
