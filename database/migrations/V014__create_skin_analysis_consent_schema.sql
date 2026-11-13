-- Captures explicit consent before a signed skin-analysis upload.
CREATE TABLE app_cloudinary.upload_intent_consents (
    upload_intent_id UUID PRIMARY KEY
        REFERENCES app_cloudinary.upload_intents(id) ON DELETE CASCADE,
    consent_version VARCHAR(100) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_upload_intent_consent_version CHECK (btrim(consent_version) <> '')
);

REVOKE ALL ON app_cloudinary.upload_intent_consents FROM PUBLIC;
