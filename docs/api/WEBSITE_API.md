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

Mobile-only routine, check-in, notification preference/inbox, and device
registration APIs are documented in `FLUTTER_API.md`; they are not part of the
website surface. Public product reads are shared: the website may use
`GET /catalog/products/:productId`, while the mobile client may use the
presentation alias `GET /products/:id`. Both are public read-only routes and
must not be confused with `/admin/catalog/**`.

Success responses use `{ status, message, data }`; errors include a stable
`code` and may also include legacy `errorCode`. The SePay webhook has its own
server-to-server response. Protected routes use Bearer access tokens. The
current refresh endpoint accepts access and refresh tokens in the body; cookie
HttpOnly/CSRF web session support is not currently implemented. A website
should not assume it can safely use the same storage strategy as Flutter.

`ADMIN` and `USER` are account roles; Premium is an active subscription, not a
role. Admin APIs require `ADMIN`. Registration and sign-in are available to
Free users; the website may list and sell Premium packages. Premium-only
mobile capabilities are enforced by subscription-backed permissions in the
backend, and clients must not send a plan or role to claim access.

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

Access tokens last 15 minutes by default; refresh tokens use a 30-day sliding
idle lifetime capped by a 90-day absolute session lifetime. Web clients should
single-flight concurrent refresh attempts and atomically persist the rotated
pair. A duplicate old refresh token within five seconds returns HTTP 409 with
`code: "REFRESH_TOKEN_ALREADY_ROTATED"` and does not revoke the winning
session. Reuse outside that window revokes the family as possible replay. A
verified Firebase email does not silently link a new provider identity to an
existing password account; the endpoint returns a conflict until a secure link
flow is available.

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
| POST             | `/skin-analysis/admin/test-groq`                     | Implemented | Admin-only diagnostic using the configured AI provider. |

Refund requires a reason in the request body:

```json
{ "reason": "Customer support case: duplicate transfer" }
```

The Groq diagnostic endpoint accepts `{ "secureUrl": "https://..." }` and
returns the selected `aiProvider`, provider name, model, timing, and validated
analysis result. It is rate-limited and requires the `ADMIN` role. The legacy
`/skin-analysis/admin/test-ai` and `/skin-analysis/admin/test-gemini` paths
remain available for compatibility; all three paths use the provider selected
by `GLOWNSCAN_ANALYSIS_AI_PROVIDER` (Groq by default).

### Admin response data

Admin account list returns `{ "items": [<account>...], "page": 1,
"limit": 20, "total": 1 }`. An account has `id`, `email`, `fullName`,
`status`, `emailVerifiedAt`, `createdAt`, and `roles`. Account get/create/update
return one account object; delete returns `{ "message": "Account deleted." }`.

Catalog create/update responses use the catalog shapes described above.
Catalog and affiliate-link DELETE operations are soft deactivations and return
`{ "id": "<uuid>", "isActive": false }`.

## Payment pages

| Method | Route                                        | Status      | Purpose                                                       |
| ------ | -------------------------------------------- | ----------- | ------------------------------------------------------------- |
| GET    | `/payment/packages`                          | Implemented | List active Premium offers and server-managed prices.         |
| POST   | `/payment/top-ups`                           | Implemented | Create a wallet top-up order and VietQR URL.                  |
| POST   | `/payment/premium-checkouts`                 | Implemented | Create a fixed-package checkout using a package code.         |
| GET    | `/payment/wallet`                            | Implemented | Read the signed-in user's wallet balance.                     |
| GET    | `/payment/wallet/transactions?page=&limit=`  | Implemented | Read wallet ledger history.                                   |
| GET    | `/payment/subscription`                      | Implemented | Read the caller's Premium status and expiry.                  |
| GET    | `/payment/orders?page=&limit=`               | Implemented | Read the caller's paginated payment-order history.            |
| GET    | `/payment/orders/:orderId`                   | Implemented | Poll only the caller's order status.                          |
| POST   | `/payment/orders/:orderId/cancel`            | Implemented | Cancel own pending order with reason.                         |
| POST   | `/payment/orders/:orderId/support-requests`  | Implemented | Create a support request for an owned payment order.          |
| GET    | `/payment/admin/orders?page=&limit=&status=` | Implemented | ADMIN-only order reconciliation view.                         |
| POST   | `/payment/webhook`                           | Implemented | Server-to-server SePay callback; never called by the browser. |

The active package listing is public; subscription and order-history routes
require a bearer token. Support requests are scoped to orders owned by that
token. Admin reconciliation requires the `ADMIN` role.

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

`GET /payment/orders` accepts the same pagination query. Support-request body:

```json
{
  "subject": "Transfer has not been recognised",
  "note": "Bank reference: 272V602260613233"
}
```

`subject` is required and at most 150 characters; `note` is required and at
most 2,000 characters. The order must belong to the authenticated user.
`GET /payment/admin/orders` accepts optional `status` from `PENDING`, `PAID`,
`CANCELLED`, `EXPIRED`, `REFUNDED`, or `FAILED`, with `page`/`limit` as above.

### Admin operations

| Method | Route                            | Status      | Purpose                                             |
| ------ | -------------------------------- | ----------- | --------------------------------------------------- |
| GET    | `/admin/dashboard/summary`       | Implemented | Payment, wallet, Premium, and notification summary. |
| GET    | `/admin/audit-logs?page=&limit=` | Implemented | Paginated sensitive admin-action history.           |

Both routes require a bearer token and the `ADMIN` role.

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

`GET /payment/packages` returns
`{ "items": [{ "code", "name", "description", "priceVnd", "durationDays", "displayOrder", "isActive" }] }`.
`displayOrder` is currently derived from duration then package code because
the existing package schema has no editable display-order column; `priceVnd`
is display-only and checkout still uses the database price.

`GET /payment/subscription` returns `{ "isPremium", "packageCode",
"startedAt", "expiresAt", "status" }`. With no subscription, the values
are `false`, `null`, `null`, `null`, and `NONE`; statuses returned are
`ACTIVE`, `EXPIRED`, `CANCELLED` (refunded subscription), or `NONE`.

`GET /payment/orders` returns `{ "items": [<order>...], "page": 1,
"limit": 20, "total": 1 }`; each item includes `id`, `type`, `packageCode`,
`amountVnd`, `status`, `paymentCode`, `createdAt`, `expiresAt`, and `paidAt`.
Support-request creation returns `{ "id", "orderId", "status": "OPEN",
"createdAt" }`.

`GET /payment/admin/orders` returns `{ "items": [<order>...], "page": 1,
"limit": 20, "total": 1 }`. Items include the user's ID/email, expected and
received amounts, payment/provider references, timestamps, and a derived
`reconciliationStatus` (`MATCHED`, `UNMATCHED`, `PARTIAL`, `OVERPAID`, or
`LATE`). `MANUAL_REVIEW` is reserved for a future operator decision flow.

The admin dashboard summary's `failedPaymentNotifications` counts distinct
orders with at least one recorded failed email/FCM delivery. Audit logs return
`{ "items": [<audit-entry>...], "page": 1, "limit": 20, "total": 1 }`;
entries include `actorUserId`, `action`, `resourceType`, `resourceId`, safe
metadata, and `createdAt`. Account changes, catalog writes, and refunds are
recorded. The API does not yet expose a manual reconciliation decision route
or include unmatched SePay events that have no corresponding order.

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

### Live skin-analysis status (optional signed-in experience)

If the website exposes an authenticated analysis UI, it may use the same
Socket.IO namespace as Flutter: `/skin-analysis` on the API origin. Authenticate
the handshake with `auth: { token: accessToken }` or a Bearer authorization
header. The server derives the private user room from the validated token; there
is no client-selected room or `userId` subscription parameter. Listen for
`analysis.status` events shaped as
`{ sessionId, status, errorCode, occurredAt }`. Events contain no result or
image data. Treat them as hints, fetch the protected status endpoint for the
authoritative response, and retain polling as reconnect/outage fallback. Public
landing pages and payment flows do not need this socket. A reverse proxy must
forward WebSocket `Upgrade`/`Connection` headers to the API.

The DTO accepts the full listed provider payload. Database event records retain
both queryable fields (`gateway`, `transaction_date`, `account_number`,
`sub_account`, `provider_code`, `content`, `description`, `reference_code`,
`transfer_type`, `amount_vnd`, and `accumulated_vnd`) and the complete request
body in `raw_payload` JSONB. Signature and timestamp headers are used for
authentication and are not stored. Duplicate event IDs are idempotently
ignored. Valid but unmatched, missing-code, and outgoing transfers are stored
with `processing_result: "IGNORED"`; only matching incoming payments update
wallets/orders.

## Remaining website APIs / contracts

- Manual reconciliation decisions, unmatched SePay event inbox, and handling
  for overpayment/partial/late transfers still need a privileged workflow.
- `FAILED` is accepted as an admin filter for forward compatibility, but the
  current payment-order schema and processing flow do not create that status.
- If web login uses refresh tokens, a dedicated secure cookie contract
  (HttpOnly, Secure, SameSite), CSRF protection, CORS credentials policy, and
  logout/revocation behavior should be agreed before moving away from the
  current request-body token contract.
- Admin audit/report endpoints and operational views (catalog change history,
  payment reconciliation, failed notifications) are not available. Do not
  implement these as privileged client-side database access.
- Static landing content, SEO metadata, FAQs, and public pricing copy can stay
  static; add CMS/content APIs only if non-developer editing is a requirement.
