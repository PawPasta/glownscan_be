-- Migration V7: seed_demo_catalog_data
-- Replace this non-production Lorem dataset through ADMIN catalog CRUD.

INSERT INTO app_catalog.ingredients (name, description)
SELECT
    format('Lorem Ingredient %s', number),
    format('Lorem ipsum ingredient description %s.', number)
FROM generate_series(1, 20) AS number;

INSERT INTO app_catalog.skin_concerns (code, name, description)
SELECT
    format('LOREM_CONCERN_%s', lpad(number::text, 2, '0')),
    format('Lorem Concern %s', number),
    format('Lorem ipsum skin concern description %s.', number)
FROM generate_series(1, 12) AS number;

INSERT INTO app_catalog.products (name, brand, description, image_url)
SELECT
    format('Lorem Product %s', lpad(number::text, 3, '0')),
    format('Lorem Brand %s', ((number - 1) % 10) + 1),
    format('Lorem ipsum demo skincare product %s. Replace this catalog record with verified product data.', number),
    format('https://placehold.co/600x600?text=Lorem+Product+%s', number)
FROM generate_series(1, 100) AS number;

INSERT INTO app_catalog.product_ingredients (product_id, ingredient_id, position)
SELECT p.id, i.id, 1
FROM app_catalog.products p
JOIN app_catalog.ingredients i
  ON i.name = format('Lorem Ingredient %s', ((substring(p.name from '[0-9]+$')::integer - 1) % 20) + 1)
WHERE p.name LIKE 'Lorem Product %';

INSERT INTO app_catalog.product_skin_concerns (product_id, skin_concern_id)
SELECT p.id, c.id
FROM app_catalog.products p
JOIN app_catalog.skin_concerns c
  ON c.code = format('LOREM_CONCERN_%s', lpad((((substring(p.name from '[0-9]+$')::integer - 1) % 12) + 1)::text, 2, '0'))
WHERE p.name LIKE 'Lorem Product %';

INSERT INTO app_catalog.affiliate_links (product_id, partner_name, url)
SELECT
    p.id,
    'Lorem Partner',
    format('https://example.com/affiliate/lorem-product-%s', substring(p.name from '[0-9]+$'))
FROM app_catalog.products p
WHERE p.name LIKE 'Lorem Product %';
