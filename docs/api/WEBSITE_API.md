# Website API contract

This document describes the backend surface for the public landing site and
the administrator/payment pages hosted on the website. It lists current API
routes and gaps. Static marketing pages do not need backend endpoints unless
their content must be editable or personalized.

## Boundary and rationale

The website handles public catalog discovery, account authentication needed
for web users/admins, the admin console, and the requested wallet/`PREMIUM`
payment experience. It must not expose admin capabilities to ordinary users;
the backend enforces `ADMIN` role checks regardless of frontend visibility.
Flutter does not call these admin routes.

Most responses use `{ status, message, data }`; the SePay webhook has its own
server-to-server response. Protected routes use Bearer access tokens. The
current refresh endpoint accepts access and refresh tokens in the body; cookie
HttpOnly/CSRF web session support is not currently implemented. A website
should not assume it can safely use the same storage strategy as Flutter.

## Authentication used by website

| Method    | Route                                               | Status      | Website use                                                     |
| --------- | --------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| POST      | `/auth/register`                                    | Implemented | Public account registration.                                    |
| POST      | `/auth/login`                                       | Implemented | Password login; set `platform: "WEBSITE"` when applicable.      |
| POST      | `/auth/firebase/login`                              | Implemented | Optional Firebase web login.                                    |
| POST      | `/auth/verify-email`                                | Implemented | Complete verification link flow.                                |
| POST      | `/auth/verify-email/check`                          | Implemented | Check verification token state.                                 |
| POST      | `/auth/verify-email/resend`                         | Implemented | Resend verification email.                                      |
| POST      | `/auth/refresh`                                     | Implemented | Rotate tokens; currently body-based, not HttpOnly-cookie based. |
| POST      | `/auth/logout`                                      | Implemented | Revoke refresh session.                                         |
| POST      | `/auth/password/reset/request`                      | Implemented | Request password reset; generic response.                       |
| POST      | `/auth/password/reset/resend`                       | Implemented | Resend reset email; same generic response policy.               |
| POST      | `/auth/password/reset/check`                        | Implemented | Check reset-token state.                                        |
| POST      | `/auth/password/reset/confirm`                      | Implemented | Complete password reset.                                        |
| GET/PATCH | `/auth/profile`                                     | Implemented | Read/update signed-in profile where web UX needs it.            |
| POST      | `/auth/password/change`                             | Implemented | Change password for signed-in account.                          |
| POST      | `/auth/profile/avatar/upload-intent` and `/confirm` | Implemented | Optional web profile/avatar UX.                                 |

### Authentication request bodies

`POST /auth/register`:

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

Registration and new/reset passwords are 6–72 characters. Email must be a
valid email address; verification/action tokens must be at least 32 characters.

`POST /auth/login` (the platform field is optional, but use `WEBSITE` for a
web session):

```json
{ "email": "user@example.com", "password": "secret123", "platform": "WEBSITE" }
```

`POST /auth/firebase/login`:

```json
{ "idToken": "<firebase-id-token>", "platform": "WEBSITE" }
```

Other auth requests:

```json
// POST /auth/verify-email
{"email":"user@example.com","token":"<email-verification-token>"}
// POST /auth/verify-email/check or /auth/password/reset/check
{"email":"user@example.com","token":"<action-token>"}
// POST /auth/verify-email/resend, /auth/password/reset/request, or /auth/password/reset/resend
{"email":"user@example.com"}
// POST /auth/password/reset/confirm
{"email":"user@example.com","token":"<reset-token>","newPassword":"newSecret123"}
// POST /auth/password/change (Bearer token required)
{"oldPassword":"oldSecret123","newPassword":"newSecret123"}
// POST /auth/refresh (current implementation is body-based)
{"accessToken":"<current-access-token>","refreshToken":"<current-refresh-token>"}
// POST /auth/logout
{"refreshToken":"<refresh-token>"}
// PATCH /auth/profile (send only fields being changed)
{"fullName":"Nguyen An","dateOfBirth":"1998-04-12","gender":"PREFER_NOT_TO_SAY"}
```

`POST /auth/profile/avatar/upload-intent` has no required body. Upload to
Cloudinary using the signed response, then `/auth/profile/avatar/confirm`:

```json
{
  "publicId": "glownscan/avatars/<user-uuid>/<image-uuid>",
  "version": 1234567890,
  "signature": "<cloudinary-signature>",
  "secureUrl": "https://res.cloudinary.com/<cloud>/image/upload/v1234567890/glownscan/avatars/..."
}
```

Avatar confirmation requires a positive integer `version`, a 40-character
hex `signature`, and a `publicId` under the authenticated user's avatar path.

### Authentication response data

Examples below show the `data` value inside `{ "status", "message", "data" }`.
POST routes normally use HTTP 201 with message `Created successfully`; GET,
PATCH, and DELETE routes use `Success`.

| Endpoint(s)                                                                                                                                                                                                      | `data` response                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`, `/auth/verify-email`, `/auth/verify-email/resend`, `/auth/logout`, `/auth/password/reset/request`, `/auth/password/reset/resend`, `/auth/password/reset/confirm`, `/auth/password/change` | `{ "message": "..." }`; reset/resend messages do not reveal whether an account exists.                                                                                                                                                                         |
| `POST /auth/verify-email/check`, `/auth/password/reset/check`                                                                                                                                                    | `{ "success": true }` only when this exact token is already marked consumed; `false` otherwise. This is not a preflight check that the token is currently valid.                                                                                               |
| `POST /auth/login`, `/auth/firebase/login`                                                                                                                                                                       | `{ "accessToken": "<jwt>", "refreshToken": "<opaque-token>" }`                                                                                                                                                                                                 |
| `POST /auth/refresh`                                                                                                                                                                                             | `{ "accessToken": "<jwt>", "refreshToken": "<rotated-opaque-token>", "expiresIn": 900 }`; duration is seconds and configurable.                                                                                                                                |
| `GET /auth/profile`, `PATCH /auth/profile`, `POST /auth/profile/avatar/confirm`                                                                                                                                  | `{ "profile": { "id": "<uuid>", "userId": "<uuid>", "fullName": "Nguyen An", "avatarUrl": "https://...", "dateOfBirth": "1998-04-12", "gender": "PREFER_NOT_TO_SAY", "createdAt": "<ISO-8601>", "updatedAt": "<ISO-8601>" } }`; nullable fields may be `null`. |
| `POST /auth/profile/avatar/upload-intent`                                                                                                                                                                        | `{ "publicId": "glownscan/avatars/...", "timestamp": 1234567890, "signature": "<signature>", "apiKey": "<cloudinary-api-key>", "cloudName": "<cloud-name>" }`                                                                                                  |

Login and refresh responses contain credentials; do not log them. The response
envelope's `status` field is the HTTP status code.

## Public catalog pages

| Method | Route                                          | Status      | Purpose                          |
| ------ | ---------------------------------------------- | ----------- | -------------------------------- |
| GET    | `/catalog/products?page=&limit=&search=`       | Implemented | Product listing/search.          |
| GET    | `/catalog/products/:productId`                 | Implemented | Product detail.                  |
| GET    | `/catalog/products/:productId/affiliate-links` | Implemented | External partner purchase links. |
| GET    | `/catalog/ingredients`                         | Implemented | Ingredient directory.            |
| GET    | `/catalog/skin-concerns`                       | Implemented | Concern directory.               |

Catalog reads are public and return active data. The affiliate purchase is
completed by an external partner; GlowScan does not own checkout or retailer
inventory/pricing.

### Catalog response data

List routes return the common envelope with `data` shaped as
`{ "items": [...], "page": 1, "limit": 20, "total": 1 }`. Product list
items contain `id`, `name`, `brand`, `description`, `imageUrl`, `isActive`,
`createdAt`, and `updatedAt`. Ingredient items contain `id`, `name`,
`description`, `isActive`, `createdAt`, and `updatedAt`; skin-concern items
also contain `code`.

Product detail and admin product create/update return a product object with
those product fields plus `ingredients: [{ "id", "name" }]` and
`skinConcerns: [{ "id", "code", "name" }]`. Public affiliate-link listing
returns an array of `{ "id", "productId", "partnerName", "url", "isActive",
"createdAt", "updatedAt" }`; admin create/update returns the corresponding
link fields (timestamps are omitted from write responses).

Note: admin ingredient/skin-concern create and update currently return raw
database rows (`snake_case`, e.g. `is_active`, `created_at`), while their list
responses use `camelCase` (`isActive`, `createdAt`). Treat this as an existing
response inconsistency until the backend normalizes it.

## Catalog query and write bodies

List routes accept `page` (default 1), `limit` (default 20, maximum 100), and
optional `search`. Product listing/detail routes use GET and have no body.

## Admin console

All listed routes require a valid access token and `ADMIN` role.

### Representative create/update bodies

`POST /admin/catalog/products` and `PATCH /admin/catalog/products/:id`:

```json
{
  "name": "Daily Moisturizer",
  "brand": "Example",
  "description": "Lightweight moisturizer",
  "imageUrl": "https://cdn.example.com/product.jpg",
  "isActive": true,
  "ingredientIds": ["<ingredient-uuid>"],
  "skinConcernIds": ["<concern-uuid>"]
}
```

On PATCH, every field is optional. `name` is required on create; `brand`,
`description`, `imageUrl`, `isActive`, `ingredientIds`, and `skinConcernIds`
are optional. IDs must be UUID v4; image URL must use HTTPS.

`POST /admin/catalog/ingredients`:

```json
{
  "name": "Niacinamide",
  "description": "Ingredient description",
  "isActive": true
}
```

`POST /admin/catalog/skin-concerns`:

```json
{
  "code": "ACNE",
  "name": "Acne",
  "description": "Concern description",
  "isActive": true
}
```

`POST /admin/catalog/products/:productId/affiliate-links`:

```json
{
  "partnerName": "Example Shop",
  "url": "https://shop.example.com/product",
  "isActive": true
}
```

Ingredient, skin-concern, and affiliate-link PATCH bodies accept any subset of
their create fields. Their create-required fields are respectively `name`;
`code` and `name`; and `partnerName` and HTTPS `url`. DELETE routes have no
body.

Admin-account bodies:

```json
// POST /admin/accounts
{"email":"staff@example.com","password":"secret123","fullName":"Catalog Admin","roleCodes":["ADMIN"]}
// PATCH /admin/accounts/:id
{"fullName":"Updated Name","status":"ACTIVE","roleCodes":["ADMIN"]}
```

Create requires email and password; update fields are optional. `status` is
`ACTIVE` or `SUSPENDED`. List routes accept `page`, `limit`, and `search`.

| Method           | Route                                                | Status      | Purpose                                      |
| ---------------- | ---------------------------------------------------- | ----------- | -------------------------------------------- |
| GET/POST         | `/admin/accounts`                                    | Implemented | List/create admin-managed accounts.          |
| GET/PATCH/DELETE | `/admin/accounts/:id`                                | Implemented | Read/update/deactivate managed account.      |
| GET/POST         | `/admin/catalog/products`                            | Implemented | List/create products.                        |
| GET/PATCH/DELETE | `/admin/catalog/products/:id`                        | Implemented | Read/update/remove product.                  |
| GET/POST         | `/admin/catalog/ingredients`                         | Implemented | List/create ingredients.                     |
| PATCH/DELETE     | `/admin/catalog/ingredients/:id`                     | Implemented | Update/remove ingredient.                    |
| GET/POST         | `/admin/catalog/skin-concerns`                       | Implemented | List/create skin concerns.                   |
| PATCH/DELETE     | `/admin/catalog/skin-concerns/:id`                   | Implemented | Update/remove concern.                       |
| GET/POST         | `/admin/catalog/products/:productId/affiliate-links` | Implemented | List/create affiliate links.                 |
| PATCH/DELETE     | `/admin/catalog/affiliate-links/:id`                 | Implemented | Update/remove affiliate link.                |
| POST             | `/payment/admin/orders/:orderId/refund`              | Implemented | Issue an internal-wallet refund with reason. |

Refund requires a reason in the request body:

```json
{ "reason": "Customer support case: duplicate transfer" }
```

### Admin response data

Admin account list returns `{ "items": [<account>...], "page": 1,
"limit": 20, "total": 1 }`. An account has `id`, `email`, `fullName`,
`status`, `emailVerifiedAt`, `createdAt`, and `roles`. Account get/create/update
return one account object; delete returns `{ "message": "Account deleted." }`.

Catalog create/update responses use the catalog shapes described above.
Catalog and affiliate-link DELETE operations are soft deactivations and return
`{ "id": "<uuid>", "isActive": false }`.

## Payment pages

| Method | Route                                       | Status      | Purpose                                                       |
| ------ | ------------------------------------------- | ----------- | ------------------------------------------------------------- |
| POST   | `/payment/top-ups`                          | Implemented | Create a wallet top-up order and VietQR URL.                  |
| POST   | `/payment/premium-checkouts`                | Implemented | Create a fixed-package checkout using a package code.         |
| GET    | `/payment/wallet`                           | Implemented | Read the signed-in user's wallet balance.                     |
| GET    | `/payment/wallet/transactions?page=&limit=` | Implemented | Read wallet ledger history.                                   |
| GET    | `/payment/orders/:orderId`                  | Implemented | Poll only the caller's order status.                          |
| POST   | `/payment/orders/:orderId/cancel`           | Implemented | Cancel own pending order with reason.                         |
| POST   | `/payment/webhook`                          | Implemented | Server-to-server SePay callback; never called by the browser. |

### Payment request bodies

`POST /payment/top-ups` (authenticated):

```json
{ "amountVnd": 100000 }
```

`amountVnd` must be an integer from 10,000 to 50,000,000 VND.

`POST /payment/premium-checkouts` (authenticated):

```json
{ "packageCode": "PREMIUM_MONTHLY" }
```

`packageCode` must identify an active package stored in the database. The
client must not send or choose the package price.

`POST /payment/orders/:orderId/cancel`:

```json
{ "cancelReason": "I created this order by mistake" }
```

`GET /payment/wallet/transactions` accepts integer `page` (default 1) and
`limit` (default 20, maximum 100).

### Payment response data

`POST /payment/top-ups` and `POST /payment/premium-checkouts` return order and
QR data:

```json
{
  "id": "<order-uuid>",
  "type": "TOP_UP",
  "amountVnd": 100000,
  "paymentCode": "GS0123456789ABCDEF0123",
  "expiresAt": "<ISO-8601>",
  "qrImageUrl": "https://<vietqr-image-url>"
}
```

For a Premium checkout, `type` is `PREMIUM_PURCHASE` and `amountVnd` comes
from the active database package. `GET /payment/wallet` returns
`{ "balanceVnd": 100000 }`. Transaction history returns an array of ledger
rows with `id`, `type`, `direction`, `amountVnd`, `balanceAfterVnd`,
`description`, and `createdAt` (the current endpoint does not include page or
total metadata in the response). `GET /payment/orders/:orderId` returns
`{ "id", "type", "packageCode", "amountVnd", "status", "expiresAt" }`.
Cancel returns `{ "id": "<order-uuid>", "status": "CANCELLED" }`; admin
refund returns `{ "id": "<order-uuid>", "status": "REFUNDED" }`.

The server-to-server webhook bypasses the common envelope and responds with
HTTP 200 `{ "success": true }` after accepting a valid event. The browser
should poll its authenticated order endpoint to determine payment status.

SePay calls `POST /payment/webhook` with the provider's JSON body and
`X-SePay-Timestamp` and `X-SePay-Signature` headers. Example body:

```json
{
  "gateway": "TPBank",
  "transactionDate": "2026-03-02 18:29:25",
  "accountNumber": "07701221901",
  "subAccount": null,
  "code": null,
  "content": "QR - GS0123456789ABCDEF0123",
  "transferType": "in",
  "description": "BankAPINotify QR - GS0123456789ABCDEF0123",
  "transferAmount": 100000,
  "referenceCode": "272V602260613233",
  "accumulated": 100001,
  "id": 43842569
}
```

The webhook validates the raw-body signature and timestamp, then extracts the
GlowScan payment code from `code`, `content`, or `description`. Never call it
from browser code or expose the signing secret.

Important contract gap: `SePayWebhookDto` currently whitelists only `id`,
`transferType`, `transferAmount`, `code`, `content`, and `description`, while
the provider's full sample also contains fields such as `gateway`,
`transactionDate`, `accountNumber`, `subAccount`, `referenceCode`, and
`accumulated`. Because the global validation pipe rejects unknown fields, the
full provider payload may receive HTTP 400 before signature/business
processing. The DTO must be aligned with SePay's configured webhook payload
before relying on this sample in production. The minimal shape currently
accepted by the DTO is:

```json
{
  "id": 43842569,
  "transferType": "in",
  "transferAmount": 100000,
  "code": "GS0123456789ABCDEF0123",
  "content": "QR - GS0123456789ABCDEF0123",
  "description": "BankAPINotify QR - GS0123456789ABCDEF0123"
}
```

## Missing website APIs / contracts

- `GET /payment/packages` (or equivalent) to list active package name, code,
  VND price, duration, and display order. Today checkout accepts a package code
  and validates it against database data, but there is no public listing route
  for rendering current prices.
- `GET /payment/subscription` (or equivalent) for the caller's active
  entitlement/expiry and Premium status. The website otherwise cannot reliably
  render subscription state or explain when it expires.
- Payment reconciliation/status semantics for unmatched, partial, overpaid,
  expired, or delayed bank transfers, plus a support route/process for recovery.
- If web login uses refresh tokens, a dedicated secure cookie contract
  (HttpOnly, Secure, SameSite), CSRF protection, CORS credentials policy, and
  logout/revocation behavior should be agreed before moving away from the
  current request-body token contract.
- Admin audit/report endpoints and operational views (catalog change history,
  payment reconciliation, failed notifications) are not available. Do not
  implement these as privileged client-side database access.
- Static landing content, SEO metadata, FAQs, and public pricing copy can stay
  static; add CMS/content APIs only if non-developer editing is a requirement.
