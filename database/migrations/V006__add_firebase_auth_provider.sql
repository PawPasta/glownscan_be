ALTER TABLE app_auth.users
    ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE app_auth.user_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(30) NOT NULL CHECK (provider = 'FIREBASE'),
    provider_user_id VARCHAR(128) NOT NULL CHECK (btrim(provider_user_id) <> ''),
    sign_in_provider VARCHAR(100) NOT NULL CHECK (btrim(sign_in_provider) <> ''),
    provider_email VARCHAR(320) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT TRUE CHECK (email_verified),
    display_name TEXT,
    photo_url TEXT,
    provider_data JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(provider_data) = 'object'),
    last_authenticated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_providers_identity UNIQUE (provider, provider_user_id),
    CONSTRAINT uq_user_providers_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX ix_user_providers_user ON app_auth.user_providers(user_id);

DROP TRIGGER IF EXISTS trg_user_providers_updated ON app_auth.user_providers;
CREATE TRIGGER trg_user_providers_updated BEFORE UPDATE ON app_auth.user_providers
    FOR EACH ROW EXECUTE FUNCTION app_auth.set_updated_at();

ALTER TABLE app_auth.user_providers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_auth.user_providers FROM PUBLIC;
