-- Migration V6: create_wallet_and_payment_schema
-- Monetary amounts are integral VND. Wallet movements are immutable ledger entries.

CREATE SCHEMA IF NOT EXISTS app_billing;
REVOKE ALL ON SCHEMA app_billing FROM PUBLIC;

CREATE TABLE IF NOT EXISTS app_billing.wallets (
    user_id UUID PRIMARY KEY REFERENCES app_auth.users(id) ON DELETE CASCADE,
    balance_vnd BIGINT NOT NULL DEFAULT 0 CHECK (balance_vnd >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_billing.premium_packages (
    code VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_premium_packages_code CHECK (code = upper(btrim(code)) AND code <> ''),
    CONSTRAINT ck_premium_packages_name CHECK (btrim(name) <> '')
);

INSERT INTO app_billing.premium_packages (code, name, amount_vnd, duration_days)
VALUES
    ('PREMIUM_MONTHLY', 'PREMIUM 1 month', 45000, 30),
    ('PREMIUM_QUARTERLY', 'PREMIUM 3 months', 120000, 90),
    ('PREMIUM_YEARLY', 'PREMIUM 1 year', 500000, 365)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_billing.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE RESTRICT,
    order_type VARCHAR(30) NOT NULL,
    premium_package VARCHAR(30) REFERENCES app_billing.premium_packages(code) ON DELETE RESTRICT,
    premium_duration_days INTEGER,
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    payment_code VARCHAR(80) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    sepay_transaction_id VARCHAR(100) UNIQUE,
    cancel_reason TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_payment_orders_type CHECK (order_type IN ('TOP_UP', 'PREMIUM_PURCHASE')),
    CONSTRAINT ck_payment_orders_package CHECK (
        (order_type = 'TOP_UP' AND premium_package IS NULL AND premium_duration_days IS NULL) OR
        (order_type = 'PREMIUM_PURCHASE' AND premium_package IS NOT NULL AND premium_duration_days > 0)
    ),
    CONSTRAINT ck_payment_orders_status CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED')),
    CONSTRAINT ck_payment_orders_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_payment_orders_paid CHECK (paid_at IS NULL OR status IN ('PAID', 'REFUNDED')),
    CONSTRAINT ck_payment_orders_cancelled CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
    CONSTRAINT ck_payment_orders_refunded CHECK ((status = 'REFUNDED') = (refunded_at IS NOT NULL)),
    CONSTRAINT ck_payment_orders_cancel_reason CHECK (cancel_reason IS NULL OR btrim(cancel_reason) <> '')
);
CREATE INDEX IF NOT EXISTS ix_payment_orders_user_created ON app_billing.payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_orders_pending_expiry ON app_billing.payment_orders(expires_at) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS app_billing.sepay_webhook_events (
    sepay_transaction_id VARCHAR(100) PRIMARY KEY,
    payment_code VARCHAR(80),
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_result VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' CHECK (processing_result IN ('RECEIVED', 'APPLIED', 'IGNORED'))
);

CREATE TABLE IF NOT EXISTS app_billing.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE RESTRICT,
    payment_order_id UUID REFERENCES app_billing.payment_orders(id) ON DELETE RESTRICT,
    transaction_type VARCHAR(30) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    balance_after_vnd BIGINT NOT NULL CHECK (balance_after_vnd >= 0),
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_wallet_transactions_type CHECK (transaction_type IN ('SEPAY_TOP_UP', 'SEPAY_COLLECTION', 'PREMIUM_PURCHASE', 'PREMIUM_SALE', 'PREMIUM_REFUND')),
    CONSTRAINT ck_wallet_transactions_direction CHECK (direction IN ('CREDIT', 'DEBIT')),
    CONSTRAINT uq_wallet_transactions_order_type_wallet UNIQUE (payment_order_id, transaction_type, wallet_user_id)
);
CREATE INDEX IF NOT EXISTS ix_wallet_transactions_user_created ON app_billing.wallet_transactions(wallet_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_billing.premium_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_auth.users(id) ON DELETE RESTRICT,
    payment_order_id UUID NOT NULL UNIQUE REFERENCES app_billing.payment_orders(id) ON DELETE RESTRICT,
    package_code VARCHAR(30) NOT NULL CHECK (package_code IN ('PREMIUM_MONTHLY', 'PREMIUM_QUARTERLY', 'PREMIUM_YEARLY')),
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REFUNDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_premium_subscriptions_period CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS ix_premium_subscriptions_user_active ON app_billing.premium_subscriptions(user_id, expires_at DESC) WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION app_billing.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_orders_updated ON app_billing.payment_orders;
CREATE TRIGGER trg_payment_orders_updated BEFORE UPDATE ON app_billing.payment_orders
    FOR EACH ROW EXECUTE FUNCTION app_billing.set_updated_at();
DROP TRIGGER IF EXISTS trg_wallets_updated ON app_billing.wallets;
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON app_billing.wallets
    FOR EACH ROW EXECUTE FUNCTION app_billing.set_updated_at();

ALTER TABLE app_billing.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_billing.premium_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_billing.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_billing.sepay_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_billing.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_billing.premium_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_billing FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_billing FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_billing FROM PUBLIC;
