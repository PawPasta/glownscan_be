-- Payment support, operational notification attempts, and admin audit records.
-- Kept as CREATE-only schema definitions for the resettable sample database.

CREATE TABLE IF NOT EXISTS app_billing.payment_support_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES app_billing.payment_orders(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE RESTRICT,
    subject VARCHAR(150) NOT NULL,
    note TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_payment_support_subject CHECK (btrim(subject) <> ''),
    CONSTRAINT ck_payment_support_note CHECK (btrim(note) <> '')
);
CREATE INDEX IF NOT EXISTS ix_payment_support_user_created
    ON app_billing.payment_support_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_support_status_created
    ON app_billing.payment_support_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS app_billing.payment_notification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES app_billing.payment_orders(id) ON DELETE RESTRICT,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL', 'FCM')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED', 'SKIPPED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_payment_notification_failed_created
    ON app_billing.payment_notification_attempts(created_at DESC)
    WHERE status = 'FAILED';

CREATE TABLE IF NOT EXISTS app_billing.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE RESTRICT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_admin_audit_action CHECK (btrim(action) <> ''),
    CONSTRAINT ck_admin_audit_resource_type CHECK (btrim(resource_type) <> ''),
    CONSTRAINT ck_admin_audit_metadata CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX IF NOT EXISTS ix_admin_audit_created
    ON app_billing.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_admin_audit_resource
    ON app_billing.admin_audit_logs(resource_type, resource_id, created_at DESC);

REVOKE ALL ON app_billing.payment_support_requests FROM PUBLIC;
REVOKE ALL ON app_billing.payment_notification_attempts FROM PUBLIC;
REVOKE ALL ON app_billing.admin_audit_logs FROM PUBLIC;
