-- Migration V2: create_auth_session_lifetime_schema
-- Bounded refresh-token families and server-side session lifecycle.

CREATE TABLE app_auth.auth_sessions (
    token_family_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES app_auth.user_devices(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idle_expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoke_reason VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    CONSTRAINT ck_auth_session_idle_expiry CHECK (idle_expires_at > created_at),
    CONSTRAINT ck_auth_session_absolute_expiry CHECK (absolute_expires_at >= idle_expires_at),
    CONSTRAINT ck_auth_session_revoke_reason CHECK (revoked_at IS NOT NULL OR revoke_reason IS NULL)
);

CREATE INDEX ix_auth_sessions_user_active
    ON app_auth.auth_sessions(user_id, last_refreshed_at DESC)
    WHERE revoked_at IS NULL;
CREATE INDEX ix_auth_sessions_absolute_expiry
    ON app_auth.auth_sessions(absolute_expires_at);

REVOKE ALL ON app_auth.auth_sessions FROM PUBLIC;
