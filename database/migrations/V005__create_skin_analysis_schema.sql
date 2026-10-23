-- Migration V5: create_skin_analysis_schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app_skin_analysis;
REVOKE ALL ON SCHEMA app_skin_analysis FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_skin_analysis.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS app_skin_analysis.upload_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    public_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_skin_analysis_upload_intents_public_id CHECK (btrim(public_id) <> ''),
    CONSTRAINT ck_skin_analysis_upload_intents_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_skin_analysis_upload_intents_terminal CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX IF NOT EXISTS ix_skin_analysis_upload_intents_user_expiry
    ON app_skin_analysis.upload_intents(user_id, expires_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_skin_analysis_upload_intents_user_pending
    ON app_skin_analysis.upload_intents(user_id)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_skin_analysis_upload_intents_public_id
    ON app_skin_analysis.upload_intents(public_id);
ALTER TABLE app_skin_analysis.upload_intents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS app_skin_analysis.analysis_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'UPLOAD_PENDING',
    analysis_kind VARCHAR(30) NOT NULL,
    provider VARCHAR(30) NOT NULL DEFAULT 'GEMINI',
    provider_task_id VARCHAR(255),
    model_version VARCHAR(150),
    prompt_version VARCHAR(100),
    result_schema_version VARCHAR(100),
    rules_version VARCHAR(100),
    idempotency_key VARCHAR(255),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_analysis_sessions_status CHECK (status IN (
        'UPLOAD_PENDING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED'
    )),
    CONSTRAINT ck_analysis_sessions_kind CHECK (analysis_kind IN ('INITIAL', 'FOLLOW_UP')),
    CONSTRAINT ck_analysis_sessions_provider CHECK (provider IN ('GEMINI', 'YOUCAM', 'HAUT_AI')),
    CONSTRAINT ck_analysis_sessions_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT ck_analysis_sessions_terminal_time CHECK (
        completed_at IS NULL OR status IN ('SUCCEEDED', 'FAILED', 'REJECTED')
    ),
    CONSTRAINT ck_analysis_sessions_error CHECK (
        (error_code IS NULL AND error_message IS NULL) OR status IN ('FAILED', 'REJECTED')
    ),
    CONSTRAINT ck_analysis_sessions_idempotency CHECK (
        idempotency_key IS NULL OR btrim(idempotency_key) <> ''
    ),
    CONSTRAINT uq_analysis_sessions_user_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_analysis_sessions_user_created
    ON app_skin_analysis.analysis_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_analysis_sessions_status_next_attempt
    ON app_skin_analysis.analysis_sessions(status, next_attempt_at)
    WHERE status IN ('QUEUED', 'RUNNING');
CREATE UNIQUE INDEX IF NOT EXISTS ux_analysis_sessions_provider_task
    ON app_skin_analysis.analysis_sessions(provider, provider_task_id)
    WHERE provider_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_skin_analysis.analysis_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES app_skin_analysis.analysis_sessions(id) ON DELETE CASCADE,
    image_view VARCHAR(20) NOT NULL,
    storage_public_id TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    byte_size BIGINT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    sha256 CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT ck_analysis_images_view CHECK (image_view IN ('FRONT', 'LEFT', 'RIGHT')),
    CONSTRAINT ck_analysis_images_public_id CHECK (btrim(storage_public_id) <> ''),
    CONSTRAINT ck_analysis_images_mime_type CHECK (btrim(mime_type) <> ''),
    CONSTRAINT ck_analysis_images_byte_size CHECK (byte_size > 0),
    CONSTRAINT ck_analysis_images_dimensions CHECK (width > 0 AND height > 0),
    CONSTRAINT ck_analysis_images_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT uq_analysis_images_session_view UNIQUE (session_id, image_view),
    CONSTRAINT uq_analysis_images_storage_public_id UNIQUE (storage_public_id)
);
CREATE INDEX IF NOT EXISTS ix_analysis_images_sha256 ON app_skin_analysis.analysis_images(sha256);

CREATE TABLE IF NOT EXISTS app_skin_analysis.assessment_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES app_skin_analysis.analysis_sessions(id) ON DELETE CASCADE,
    questionnaire_version VARCHAR(100) NOT NULL,
    answers JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_assessment_snapshots_questionnaire_version CHECK (btrim(questionnaire_version) <> ''),
    CONSTRAINT ck_assessment_snapshots_answers CHECK (jsonb_typeof(answers) = 'object')
);

CREATE TABLE IF NOT EXISTS app_skin_analysis.analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES app_skin_analysis.analysis_sessions(id) ON DELETE CASCADE,
    quality_accepted BOOLEAN NOT NULL,
    quality_issues JSONB NOT NULL DEFAULT '[]'::JSONB,
    limitations JSONB NOT NULL DEFAULT '[]'::JSONB,
    provider_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_analysis_results_quality_issues CHECK (jsonb_typeof(quality_issues) = 'array'),
    CONSTRAINT ck_analysis_results_limitations CHECK (jsonb_typeof(limitations) = 'array'),
    CONSTRAINT ck_analysis_results_provider_payload CHECK (jsonb_typeof(provider_payload) = 'object')
);

CREATE TABLE IF NOT EXISTS app_skin_analysis.analysis_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES app_skin_analysis.analysis_sessions(id) ON DELETE CASCADE,
    observation_type VARCHAR(50) NOT NULL,
    severity SMALLINT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL,
    visibility VARCHAR(20) NOT NULL,
    note TEXT,
    box_2d JSONB NOT NULL,
    mask JSONB,
    display_order SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_analysis_observations_type CHECK (observation_type IN (
        'VISIBLE_ACNE', 'VISIBLE_REDNESS', 'VISIBLE_DARK_SPOTS', 'VISIBLE_PORES',
        'VISIBLE_DRYNESS', 'VISIBLE_OILINESS', 'UNEAVEN_TEXTURE'
    )),
    CONSTRAINT ck_analysis_observations_severity CHECK (severity BETWEEN 0 AND 4),
    CONSTRAINT ck_analysis_observations_confidence CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT ck_analysis_observations_visibility CHECK (visibility IN ('CLEAR', 'UNCERTAIN', 'NOT_VISIBLE')),
    CONSTRAINT ck_analysis_observations_note CHECK (note IS NULL OR btrim(note) <> ''),
    CONSTRAINT ck_analysis_observations_box_2d CHECK (
        jsonb_typeof(box_2d) = 'array' AND jsonb_array_length(box_2d) = 4
    ),
    CONSTRAINT ck_analysis_observations_mask CHECK (mask IS NULL OR jsonb_typeof(mask) = 'array'),
    CONSTRAINT ck_analysis_observations_display_order CHECK (display_order >= 0),
    CONSTRAINT uq_analysis_observations_session_order UNIQUE (session_id, display_order)
);
CREATE INDEX IF NOT EXISTS ix_analysis_observations_session ON app_skin_analysis.analysis_observations(session_id);
CREATE INDEX IF NOT EXISTS ix_analysis_observations_type ON app_skin_analysis.analysis_observations(observation_type);

CREATE TABLE IF NOT EXISTS app_skin_analysis.analysis_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL UNIQUE REFERENCES app_skin_analysis.analysis_sessions(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL,
    consent_version VARCHAR(100) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_analysis_consents_purpose CHECK (purpose = 'SKIN_ANALYSIS'),
    CONSTRAINT ck_analysis_consents_version CHECK (btrim(consent_version) <> '')
);
CREATE INDEX IF NOT EXISTS ix_analysis_consents_user_accepted
    ON app_skin_analysis.analysis_consents(user_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS app_skin_analysis.analysis_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES app_skin_analysis.analysis_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_analysis_outbox_event_type CHECK (event_type = 'PROCESS_ANALYSIS'),
    CONSTRAINT ck_analysis_outbox_status CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')),
    CONSTRAINT ck_analysis_outbox_payload CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT ck_analysis_outbox_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT ck_analysis_outbox_processed CHECK (
        processed_at IS NULL OR status IN ('PUBLISHED', 'FAILED')
    )
);
CREATE INDEX IF NOT EXISTS ix_analysis_outbox_dispatch
    ON app_skin_analysis.analysis_outbox(status, available_at, created_at)
    WHERE status IN ('PENDING', 'PROCESSING');

DROP TRIGGER IF EXISTS trg_analysis_sessions_updated ON app_skin_analysis.analysis_sessions;
CREATE TRIGGER trg_analysis_sessions_updated BEFORE UPDATE ON app_skin_analysis.analysis_sessions
    FOR EACH ROW EXECUTE FUNCTION app_skin_analysis.set_updated_at();

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'analysis_sessions', 'analysis_images', 'assessment_snapshots', 'analysis_results',
        'analysis_observations', 'analysis_consents', 'analysis_outbox'
    ]
    LOOP
        EXECUTE format('ALTER TABLE app_skin_analysis.%I ENABLE ROW LEVEL SECURITY', table_name);
    END LOOP;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA app_skin_analysis FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_skin_analysis FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_skin_analysis FROM PUBLIC;
