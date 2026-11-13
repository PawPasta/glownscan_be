-- Migration V4: create_api_rate_limits_schema
-- Shared persistence for endpoint-scoped API rate limits.

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
