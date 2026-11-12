# Product catalog

## User-facing discovery

Public `GET /catalog/products`, `GET /catalog/products/:productId`,
`GET /catalog/ingredients`, `GET /catalog/skin-concerns`, and
`GET /catalog/products/:productId/affiliate-links` return active catalog data
with pagination/search where supported. Affiliate links take the user to an
external retailer; GlowScan does not process those purchases or confirm
availability/pricing at the retailer.

## Administrator management

An authenticated account with the `ADMIN` role can create, list, update, and
remove products, ingredients, skin concerns, and affiliate links under
`/admin/catalog`. Inactive catalog entities are hidden from public reads but
remain available to administrators. Product associations connect products to
ingredients and concerns.

## Business gaps and risks

- Product, price, stock, and affiliate-link freshness are not verified against
  the external retailer. Define a review/expiry process and disclose that
  availability and prices may change.
- Ingredient data and usage instructions are not rich enough to guarantee safe
  AI-generated routine recommendations; require verified ingredient lists,
  usage guidance, and contraindication review before product-specific claims.
- Define admin audit history, approval/review ownership, and soft-delete rules
  for catalog content referenced by past recommendations.
- Demo seed data is illustrative and must not be presented as verified product
  information.
