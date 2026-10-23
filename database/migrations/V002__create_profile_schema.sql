-- Migration V2: create_profile_schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app_profile;
REVOKE ALL ON SCHEMA app_profile FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_profile.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS app_profile.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    full_name VARCHAR(150),
    avatar_url TEXT,
    date_of_birth DATE,
    gender VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id)
        REFERENCES app_auth.users(id) ON DELETE CASCADE,
    CONSTRAINT ck_user_profiles_full_name CHECK (full_name IS NULL OR btrim(full_name) <> ''),
    CONSTRAINT ck_user_profiles_gender CHECK (
        gender IS NULL OR gender IN ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')
    )
);

CREATE TABLE IF NOT EXISTS app_profile.skin_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL UNIQUE,
    skin_type VARCHAR(30),
    sensitivity_level VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_skin_profiles_user_profile FOREIGN KEY (user_profile_id)
        REFERENCES app_profile.user_profiles(id) ON DELETE CASCADE,
    CONSTRAINT ck_skin_profiles_skin_type CHECK (
        skin_type IS NULL OR skin_type IN ('NORMAL', 'DRY', 'OILY', 'COMBINATION')
    ),
    CONSTRAINT ck_skin_profiles_sensitivity CHECK (
        sensitivity_level IS NULL OR sensitivity_level IN ('LOW', 'MEDIUM', 'HIGH')
    ),
    CONSTRAINT ck_skin_profiles_notes CHECK (notes IS NULL OR btrim(notes) <> '')
);

-- Legacy installations stored profile details on app_auth.users. Keep those
-- values when migrating an existing database; new installations lack these columns.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'app_auth' AND table_name = 'users' AND column_name = 'full_name'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'app_auth' AND table_name = 'users' AND column_name = 'avatar_url'
    ) THEN
        EXECUTE $copy_legacy_profile$
            INSERT INTO app_profile.user_profiles (user_id, full_name, avatar_url)
            SELECT id, NULLIF(btrim(full_name), ''), avatar_url
            FROM app_auth.users
            ON CONFLICT (user_id) DO NOTHING
        $copy_legacy_profile$;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_updated ON app_profile.user_profiles;
CREATE TRIGGER trg_user_profiles_updated BEFORE UPDATE ON app_profile.user_profiles
    FOR EACH ROW EXECUTE FUNCTION app_profile.set_updated_at();

DROP TRIGGER IF EXISTS trg_skin_profiles_updated ON app_profile.skin_profiles;
CREATE TRIGGER trg_skin_profiles_updated BEFORE UPDATE ON app_profile.skin_profiles
    FOR EACH ROW EXECUTE FUNCTION app_profile.set_updated_at();

ALTER TABLE app_profile.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_profile.skin_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_profile FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_profile FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_profile FROM PUBLIC;
