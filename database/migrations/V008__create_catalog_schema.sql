-- Migration V8: create_catalog_schema
-- Product discovery data is public-read at the API layer; writes are ADMIN-only.

CREATE SCHEMA IF NOT EXISTS app_catalog;
REVOKE ALL ON SCHEMA app_catalog FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_catalog.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS app_catalog.ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_catalog_ingredient_name CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_ingredients_name
    ON app_catalog.ingredients (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS app_catalog.skin_concerns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_catalog_skin_concern_code CHECK (code = upper(btrim(code)) AND code <> ''),
    CONSTRAINT ck_catalog_skin_concern_name CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_skin_concerns_code
    ON app_catalog.skin_concerns (code);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_skin_concerns_name
    ON app_catalog.skin_concerns (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS app_catalog.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    brand VARCHAR(150),
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_catalog_product_name CHECK (btrim(name) <> ''),
    CONSTRAINT ck_catalog_product_brand CHECK (brand IS NULL OR btrim(brand) <> ''),
    CONSTRAINT ck_catalog_product_image_url CHECK (image_url IS NULL OR image_url ~ '^https://')
);
CREATE INDEX IF NOT EXISTS ix_catalog_products_active_created
    ON app_catalog.products (created_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS ix_catalog_products_name
    ON app_catalog.products (lower(name));

CREATE TABLE IF NOT EXISTS app_catalog.product_ingredients (
    product_id UUID NOT NULL REFERENCES app_catalog.products(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES app_catalog.ingredients(id) ON DELETE RESTRICT,
    position SMALLINT,
    PRIMARY KEY (product_id, ingredient_id),
    CONSTRAINT ck_catalog_product_ingredient_position CHECK (position IS NULL OR position > 0)
);

CREATE TABLE IF NOT EXISTS app_catalog.product_skin_concerns (
    product_id UUID NOT NULL REFERENCES app_catalog.products(id) ON DELETE CASCADE,
    skin_concern_id UUID NOT NULL REFERENCES app_catalog.skin_concerns(id) ON DELETE RESTRICT,
    PRIMARY KEY (product_id, skin_concern_id)
);

CREATE TABLE IF NOT EXISTS app_catalog.affiliate_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES app_catalog.products(id) ON DELETE CASCADE,
    partner_name VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_catalog_affiliate_partner CHECK (btrim(partner_name) <> ''),
    CONSTRAINT ck_catalog_affiliate_url CHECK (url ~ '^https://')
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_affiliate_product_partner
    ON app_catalog.affiliate_links (product_id, lower(btrim(partner_name)));
CREATE INDEX IF NOT EXISTS ix_catalog_affiliate_product_active
    ON app_catalog.affiliate_links (product_id) WHERE is_active;

CREATE TRIGGER trg_catalog_ingredients_updated BEFORE UPDATE ON app_catalog.ingredients
    FOR EACH ROW EXECUTE FUNCTION app_catalog.set_updated_at();
CREATE TRIGGER trg_catalog_skin_concerns_updated BEFORE UPDATE ON app_catalog.skin_concerns
    FOR EACH ROW EXECUTE FUNCTION app_catalog.set_updated_at();
CREATE TRIGGER trg_catalog_products_updated BEFORE UPDATE ON app_catalog.products
    FOR EACH ROW EXECUTE FUNCTION app_catalog.set_updated_at();
CREATE TRIGGER trg_catalog_affiliate_links_updated BEFORE UPDATE ON app_catalog.affiliate_links
    FOR EACH ROW EXECUTE FUNCTION app_catalog.set_updated_at();

REVOKE ALL ON ALL TABLES IN SCHEMA app_catalog FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_catalog FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_catalog FROM PUBLIC;
