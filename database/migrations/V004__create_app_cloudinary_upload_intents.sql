-- Migration V4: create_app_cloudinary_upload_intents
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app_cloudinary;
REVOKE ALL ON SCHEMA app_cloudinary FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_cloudinary.upload_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    public_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_app_cloudinary_upload_intents_public_id CHECK (btrim(public_id) <> ''),
    CONSTRAINT ck_app_cloudinary_upload_intents_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_app_cloudinary_upload_intents_terminal CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS ix_app_cloudinary_upload_intents_public_id
    ON app_cloudinary.upload_intents(public_id);
CREATE INDEX IF NOT EXISTS ix_app_cloudinary_upload_intents_user_expiry
    ON app_cloudinary.upload_intents(user_id, expires_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_app_cloudinary_upload_intents_user_pending
    ON app_cloudinary.upload_intents(user_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE app_cloudinary.upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_cloudinary FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_cloudinary FROM PUBLIC;
