-- Mobile routine lifecycle, check-ins, and notification inbox/preferences.
-- New-schema reference migration; creates objects only.

CREATE SCHEMA IF NOT EXISTS app_routines;
REVOKE ALL ON SCHEMA app_routines FROM PUBLIC;

CREATE TABLE app_routines.routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    idempotency_key VARCHAR(255),
    request_fingerprint CHAR(64),
    morning_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    evening_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_analysis_session_id UUID REFERENCES app_skin_analysis.analysis_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_routine_status CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
    CONSTRAINT ck_routine_title CHECK (btrim(title) <> ''),
    CONSTRAINT ck_routine_steps_arrays CHECK (jsonb_typeof(morning_steps) = 'array' AND jsonb_typeof(evening_steps) = 'array')
);
CREATE UNIQUE INDEX ux_routines_user_idempotency_key ON app_routines.routines (user_id, idempotency_key);
CREATE INDEX ix_routines_user_recent ON app_routines.routines (user_id, created_at DESC);
CREATE UNIQUE INDEX ux_routines_one_current_per_user ON app_routines.routines (user_id)
    WHERE status IN ('DRAFT', 'ACTIVE', 'PAUSED');

CREATE TABLE app_routines.daily_check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id UUID NOT NULL REFERENCES app_routines.routines(id) ON DELETE CASCADE,
    check_in_date DATE NOT NULL,
    completed_step_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    note VARCHAR(500),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ux_routine_check_in_date UNIQUE (routine_id, check_in_date),
    CONSTRAINT ck_routine_check_in_steps CHECK (jsonb_typeof(completed_step_ids) = 'array')
);
CREATE INDEX ix_routine_check_ins_date ON app_routines.daily_check_ins (routine_id, check_in_date DESC);

CREATE SCHEMA IF NOT EXISTS app_notifications;
REVOKE ALL ON SCHEMA app_notifications FROM PUBLIC;

CREATE TABLE app_notifications.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES app_auth.users(id) ON DELETE CASCADE,
    routine_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    analysis_updates BOOLEAN NOT NULL DEFAULT TRUE,
    product_recommendations BOOLEAN NOT NULL DEFAULT FALSE,
    marketing BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_time TIME NOT NULL DEFAULT '20:30',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE app_notifications.inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    type VARCHAR(60) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_notification_inbox_user_recent ON app_notifications.inbox (user_id, created_at DESC);
CREATE INDEX ix_notification_inbox_unread ON app_notifications.inbox (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE app_auth.device_metadata (
    device_id UUID PRIMARY KEY REFERENCES app_auth.user_devices(id) ON DELETE CASCADE,
    app_version VARCHAR(50),
    locale VARCHAR(35),
    timezone VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

REVOKE ALL ON ALL TABLES IN SCHEMA app_routines FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app_notifications FROM PUBLIC;
REVOKE ALL ON app_auth.device_metadata FROM PUBLIC;
