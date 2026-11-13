-- Migration V9: create_skin_assessment_schema
-- A user's current self-reported cosmetic assessment. Analysis-session snapshots
-- remain immutable records in app_skin_analysis.assessment_snapshots.

CREATE TABLE IF NOT EXISTS app_skin_analysis.user_assessments (
    user_id UUID PRIMARY KEY REFERENCES app_auth.users(id) ON DELETE CASCADE,
    questionnaire_version VARCHAR(100) NOT NULL,
    answers JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_user_assessments_questionnaire_version CHECK (btrim(questionnaire_version) <> ''),
    CONSTRAINT ck_user_assessments_answers CHECK (jsonb_typeof(answers) = 'object')
);

DROP TRIGGER IF EXISTS trg_user_assessments_updated ON app_skin_analysis.user_assessments;
CREATE TRIGGER trg_user_assessments_updated BEFORE UPDATE ON app_skin_analysis.user_assessments
    FOR EACH ROW EXECUTE FUNCTION app_skin_analysis.set_updated_at();

ALTER TABLE app_skin_analysis.user_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_skin_analysis.user_assessments FROM PUBLIC;
