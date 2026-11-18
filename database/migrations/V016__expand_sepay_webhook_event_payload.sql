-- Preserve SePay's complete bank notification payload for reconciliation.
ALTER TABLE app_billing.sepay_webhook_events
    ADD COLUMN IF NOT EXISTS gateway VARCHAR(100),
    ADD COLUMN IF NOT EXISTS transaction_date VARCHAR(50),
    ADD COLUMN IF NOT EXISTS account_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sub_account VARCHAR(100),
    ADD COLUMN IF NOT EXISTS provider_code VARCHAR(500),
    ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS content TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS reference_code VARCHAR(150),
    ADD COLUMN IF NOT EXISTS accumulated_vnd BIGINT CHECK (accumulated_vnd IS NULL OR accumulated_vnd >= 0),
    ADD COLUMN IF NOT EXISTS raw_payload JSONB;
