CREATE SCHEMA IF NOT EXISTS app_security;
REVOKE ALL ON SCHEMA app_security FROM PUBLIC;

CREATE TABLE app_security.rate_limit_windows (
    scope VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    window_started_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
    PRIMARY KEY (scope, subject, window_started_at)
);
CREATE INDEX ix_rate_limit_windows_expiry ON app_security.rate_limit_windows(window_started_at);
ALTER TABLE app_security.rate_limit_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_security FROM PUBLIC;

CREATE TABLE app_skin_analysis.user_analysis_entitlements (
    user_id UUID PRIMARY KEY REFERENCES app_auth.users(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PREMIUM')),
    daily_quota INTEGER CHECK (daily_quota IS NULL OR daily_quota >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE app_skin_analysis.daily_analysis_usage (
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE app_skin_analysis.analysis_usage_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'CHARGED', 'RELEASED', 'EXPIRED')),
    expires_at TIMESTAMPTZ NOT NULL,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (expires_at > created_at)
);
CREATE INDEX ix_analysis_usage_reservations_active ON app_skin_analysis.analysis_usage_reservations(user_id, expires_at)
    WHERE status = 'RESERVED';
ALTER TABLE app_skin_analysis.user_analysis_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_skin_analysis.daily_analysis_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_skin_analysis.analysis_usage_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_skin_analysis FROM PUBLIC;
