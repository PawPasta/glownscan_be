# GlowScan Backend

GlowScan is a personalized skincare application. This repository contains the backend API intended to support the mobile app and admin dashboard.

> **Implementation status:** The backend includes website and mobile authentication, profiles, skin assessments, asynchronous skin analysis, deterministic product recommendations, mobile routines/check-ins, notification preferences and inbox, public/admin catalog APIs, SePay wallet payments, and admin audit records. Google Calendar sync, scheduled reminders, and account/analysis privacy workflows are not implemented yet; see [Known gaps and planned work](#known-gaps-and-planned-work).

## Product flows

The backend currently supports the following user journeys. The API contracts are documented separately for [Flutter](docs/api/FLUTTER_API.md) and the [website](docs/api/WEBSITE_API.md).

### 1. Account setup and personalization

```text
Register / log in on web or mobile
  → Verify email when required
  → Load or update profile
  → Save the versioned skin assessment
  → On mobile, register the FCM token after login
```

Account, profile, and the versioned skin-assessment questionnaire provide the
starting point for a user's skin profile and later recommendations.

### 2. Skin analysis and skincare guidance

```text
Request a one-time upload intent
  → Upload directly to Cloudinary
  → Submit verified metadata with Idempotency-Key
  → Receive 202 + analysis session ID
  → Outbox dispatcher enqueues a BullMQ job
  → Worker validates image/result and calls Gemini
  → Poll owned status/history endpoints
  → View result and matched catalog products
```

Analysis creation is idempotent and does not wait for Gemini. The persisted
session/outbox supports worker restarts and duplicate queue delivery. History
and result reads are scoped to the authenticated user. `GET
/recommendations/me` returns deterministic product matches from assessment
concerns and eligible analysis metrics; it does not call an LLM to generate
product recommendations.

### 3. Routine and progress tracking

```text
Generate an idempotent routine draft using assessment data and an optional or latest eligible analysis
  → Review/edit morning and evening steps
  → Activate, pause, or complete the routine
  → Upsert daily completed-step check-ins
  → Read today's progress or check-in history
```

Routine steps currently come from a built-in deterministic template, with
eligible catalog product matching; routine generation does not call Gemini.
Google Calendar integration and scheduled reminders are not available.

### 4. Notifications

```text
Read/update notification preferences
  → Receive payment-success notification in the inbox
  → Read one notification or mark all as read
```

Payment success is written to the inbox and dispatched by email/FCM on a
best-effort basis. The preference CRUD API is implemented, but preference-based
suppression and routine/analysis reminder delivery are not wired yet.

### 5. Premium access

```text
View Premium plans
  → Select a plan
  → Complete and verify purchase
      ├─ Not verified → Show status and recovery options
      └─ Verified → Enable Premium features
  → View or manage subscription
```

`PREMIUM` is the sole paid entitlement (the UI may call it “VIP”). SePay-backed
top-ups and package purchases are implemented. A verified payment credits the
internal wallet and, for a package purchase, immediately pays the package and
extends the user's `PREMIUM` subscription. The specific premium product
capabilities remain to be defined.

### 6. Product catalog and administration

```text
Admin signs in
  → Manage products and availability
  → Maintain ingredients, skin types, and skin concerns
  → Associate catalog products with relevant skin data
  → Maintain affiliate links
```

The catalog exposes public read endpoints (including product details for
mobile) and `ADMIN`-only CRUD for products, ingredients, skin concerns,
affiliate links, and managed accounts. Admin actions are recorded in the audit
log. Purchases through affiliate links take place on external marketplaces,
not in GlowScan.

## Known gaps and planned work

These are intentionally identified as follow-up work; the current Flutter and
website flows can operate without them, but product/privacy/operations work is
needed before treating them as complete:

- **Google Calendar:** routine-owner OAuth/authorization, connection management,
  and idempotent event sync are not implemented. A saved Gmail address alone
  is not authorization to write to that person's calendar.
- **Routine reminders and notification preferences:** preference read/update
  and inbox APIs exist, but scheduled reminders and enforcement of channel
  preferences are not implemented. Analysis-update and recommendation
  notifications are also not delivered.
- **Analysis privacy/recovery:** retry, delete, report-result, account export,
  account deletion, and a complete image-retention/deletion workflow are not
  available. Define retention and consent handling before production rollout.
- **Product content:** mobile product detail currently returns empty warnings
  and `usageInstructions: null`; those fields are not stored in the catalog.
- **Payment operations:** the admin view does not yet provide an unmatched
  SePay-event inbox or operator decisions for partial, overpaid, or late
  transfers. Verify the exact provider webhook payload against the DTO before
  enabling the live SePay integration.
- **Web session hardening:** web refresh remains body-based. HttpOnly cookie,
  CSRF, and credentialed CORS session flows are not implemented.
- **Premium entitlements:** package purchase and subscription state are
  implemented, but the product capabilities gated by `PREMIUM` still need a
  defined policy.

See the [Flutter API contract](docs/api/FLUTTER_API.md),
[Website API contract](docs/api/WEBSITE_API.md), and relevant
[business workflows](docs/business/) for endpoint-level details.

## Flow and requirements diagrams

- [Screen flow](docs/diagram/GlowScan_Diagram-Screen%20Flow.drawio.png) — client navigation across user and admin screens.
- [Use case diagram](docs/diagram/GlowScan_Diagram-Use%20Case%20Diagram.drawio.png) — system actors and planned capabilities.
- [User requirements diagram](docs/diagram/GlowScan_Diagram-User%20Requirements.drawio.png) — high-level information exchanged across user, admin, and analysis workflows.

## Documentation

See [Skin assessment](docs/business/Skin-Assessment.md) for the persisted
questionnaire, validation rules, and its two authenticated endpoints.

Project documentation is organized in the [`docs/`](docs/) folder:

- [`api/`](docs/api/) — client API boundaries for [Flutter](docs/api/FLUTTER_API.md) and [Website](docs/api/WEBSITE_API.md), including implemented routes and missing contracts.
- [`architecture/`](docs/architecture/) — backend architecture and source-code responsibilities.
- [`business/`](docs/business/) — workflows for [authentication](docs/business/Authentication.md), [profiles](docs/business/Profile.md), [image uploads](docs/business/Upload-Image.md), [skin analysis](docs/business/Skin-Analysis.md), [skin assessment](docs/business/Skin-Assessment.md), [recommendations and routines](docs/business/Recommendation.md), [catalog](docs/business/Catalog.md), [payments](docs/business/Payment.md), and [notifications](docs/business/Notification.md).
- [`aws/`](docs/aws/) — AWS deployment setup and operations, including EC2, Docker, GitHub Actions, and troubleshooting.
- [`diagram/`](docs/diagram/) — visual references for screen flows, use cases, and user requirements.
- [`git/`](docs/git/) — repository contribution conventions, including [commit message rules](docs/git/COMMIT.md).

## Runtime architecture

```text
Flutter -> NestJS controller -> application service -> port -> adapter
                              |                    |       |- PostgreSQL
                              |                    |       |- Cloudinary
                              |                    |       |- Gemini
                              |                    |       |- Firebase Cloud Messaging
                              |                    |       `- SMTP
                              `-> authenticated user / ownership boundary
```

The API is a modular monolith with PostgreSQL as the transactional source of
truth. It uses `pg` directly at the infrastructure boundary and forward-only
database migrations.

### Analysis sequence

```text
client -> upload intent -> Cloudinary direct upload -> confirm/analyze API
       -> ownership + quota + idempotency -> session + transactional outbox
       -> Redis/BullMQ worker -> verified image download -> Gemini
       -> result validator -> transactional result persistence -> status/history API
```

Use `Idempotency-Key` on analysis creation. Do not send access tokens,
Cloudinary URLs, image bytes, or provider responses to logs.

`POST /skin-analysis/analyze` is asynchronous. It returns `202 Accepted` with
`{ "sessionId": "…", "status": "QUEUED" }`; clients poll the owned session
endpoint until it becomes `SUCCEEDED` or `FAILED`. The session and its outbox
event are written in one PostgreSQL transaction. A dispatcher safely republishes
unpublished events after a Redis outage, and the worker claims `QUEUED` sessions
atomically so duplicate BullMQ delivery does not call Gemini twice.
Run the HTTP API with `npm run start:prod` and the separate worker process with
`npm run start:analysis-worker`; both require PostgreSQL and Redis.

## Local setup and performance tests

Copy `.env.example` to `.env.local`, provide non-placeholder values, run
`npm ci`, `npm run db:migrate`, then `npm run start:dev`. Load-test instructions
are in [load-tests/README.md](load-tests/README.md); they are restricted to
non-production environments and deliberately do not invoke AI.

## Profile API

Send an access token in the Bearer authorization header for profile endpoints.
`GET /auth/profile` returns the authenticated user's personal profile. Use
`PATCH /auth/profile` to update personal details; fields omitted from a patch are
unchanged and nullable fields can be set to `null` to clear them. Skin profile
estimates are returned by `POST /skin-analysis/analyze`, not by the profile
endpoints.

To set an avatar, call `POST /auth/profile/avatar/upload-intent`, upload the image
directly to Cloudinary using the returned `cloudName`, `apiKey`, `timestamp`,
`publicId`, and `signature`, then call `POST /auth/profile/avatar/confirm` with
Cloudinary's `public_id`, `version`, `signature`, and `secure_url`. The upload
intent metadata is stored in `app_cloudinary.upload_intents` with purpose
`AVATAR`; it expires after 10 minutes and can only be consumed once. Creating a
new intent revokes the previous pending avatar intent. On confirmation, the backend
atomically consumes that intent and updates `app_auth.users.avatar_url`
with Cloudinary's verified `secure_url`. The image URL is not stored in the
upload-intent table. Configure
`GLOWNSCAN_CLOUDINARY_CLOUD_NAME`, `GLOWNSCAN_CLOUDINARY_API_KEY`, and
`GLOWNSCAN_CLOUDINARY_API_SECRET` in the backend environment.

## Skin assessment API

The questionnaire is owned by the authenticated user and uses the current
version, `skin-assessment-v1`. `GET /skin-assessments/current` returns the
saved assessment or `null` when it has not been completed. `PUT
/skin-assessments/current` validates and upserts the answers. Supported fields
are `skinType`, `sensitivity`, `concerns`, and `goals`; `NONE` may be used only
as the sole value in `concerns`. See the [skin-assessment business
document](docs/business/Skin-Assessment.md) for request examples.

## Skin analysis API

Configure `GLOWNSCAN_GEMINI_API_KEY`, optional `GLOWNSCAN_GEMINI_MODEL`
(defaults to `gemini-2.5-flash`), optional `GLOWNSCAN_GEMINI_BASE_URL`
(defaults to `https://generativelanguage.googleapis.com/v1beta/models`), and
`GLOWNSCAN_CLOUDINARY_CLOUD_NAME`.
Before uploading a JPEG, PNG, or WebP image to Cloudinary, call
`POST /skin-analysis/upload-intent` with the access token. The response
contains the Cloudinary `cloudName`, `apiKey`, `timestamp`, `publicId`, and
`signature`; use them to upload directly to Cloudinary. The backend stores a
10-minute, one-time `SKIN_ANALYSIS` intent in the same
`app_cloudinary.upload_intents` table used for avatars. A new intent revokes the
previous pending skin-analysis intent, without revoking an avatar intent.
After Cloudinary confirms the upload, call `POST /skin-analysis/analyze`
with the access token and Cloudinary's `public_id`, `version`, `signature`, and
`secure_url`:

```json
{
  "publicId": "glownscan/skin-analysis/{authenticated-user-id}/{uuid}",
  "version": 1234567890,
  "signature": "<cloudinary-response-signature>",
  "secureUrl": "https://res.cloudinary.com/<cloud-name>/image/upload/v1234567890/glownscan/skin-analysis/..."
}
```

The backend verifies the Cloudinary response signature and exact URL, consumes
the matching unexpired upload intent once, queues durable worker work, and
returns `202 Accepted`. The worker downloads the verified image, sends it to
Gemini, validates the returned JSON, and transactionally stores the session,
result, and observations. It does not analyze images based on an unverified
URL. Retrieve an owned result with `GET /skin-analysis/:analysisId` and paged
history with `GET /skin-analysis`.

The response contains a 0–100 overall visible-skin score, an estimated
`skinProfile` (visual skin type, nullable sensitivity level, and brief notes),
0–100 scores for seven visible concern metrics, confidence and visibility for
each metric, regional scores, observations, and `highlights` with normalized
image coordinates (`x`, `y`, and `radius`, each in the 0–1000 coordinate space).
Sensitivity cannot be established from one image, so `sensitivityLevel` is
returned as `null`.
Highlights can be used by the mobile app to draw emphasis markers on the
original image. Scores are visual estimates, not medical diagnoses or
instrument measurements. The client should obtain the user's consent before
uploading or analyzing a facial image.

## AI analysis abuse and cost controls

Skin-analysis upload intents and analysis requests require a valid access token
and are rate limited per authenticated user (10 upload intents/minute and 5
analysis requests/minute). Analysis reservations are persisted atomically in
PostgreSQL before Cloudinary confirmation or a Gemini call. This prevents a
user from exceeding its daily quota or concurrent-analysis limit even when the
API runs on multiple instances. A rejected request returns the standard 429
response envelope and, where applicable, a `Retry-After` response header.

Configure these limits in the application environment:

```text
GLOWNSCAN_ANALYSIS_DAILY_QUOTA_FREE=3
GLOWNSCAN_ANALYSIS_DAILY_QUOTA_PREMIUM=30
GLOWNSCAN_ANALYSIS_MAX_CONCURRENT_PER_USER=1
GLOWNSCAN_ANALYSIS_MAX_CONCURRENT_GLOBAL=10
GLOWNSCAN_ANALYSIS_RESERVATION_TTL_SECONDS=180
GLOWNSCAN_REDIS_URL=redis://localhost:6379
GLOWNSCAN_ANALYSIS_WORKER_CONCURRENCY=3
GLOWNSCAN_ANALYSIS_WORKER_ATTEMPTS=3
GLOWNSCAN_ANALYSIS_OUTBOX_POLL_MS=1000
GLOWNSCAN_ANALYSIS_WORKER_RECLAIM_AFTER_SECONDS=25
```

New accounts use the free quota. A confirmed `PREMIUM` package purchase creates
or updates `app_skin_analysis.user_analysis_entitlements` with
`plan = 'PREMIUM'`; a user-specific `daily_quota` is also supported. Usage is
tracked in `daily_analysis_usage`. A Gemini attempt consumes a reserved daily
credit even if its returned payload is invalid, while failures before the
provider call release the credit.

## Mobile authentication API

`POST /auth/mobile/login` accepts `email`, `password`, `platform` (`ANDROID` or
`IOS`), plus optional `installationId` and `fcmToken`. FCM is deliberately not
required for login. Flutter stores the session, obtains its FCM token, then
calls authenticated `PUT /devices/me` with `installationId`, `platform`, and
`fcmToken`. The stable installation ID makes synchronization an upsert rather
than creating a device on each app launch. Call `DELETE /devices/me` with the
installation ID before clearing the local session to disable push delivery.
`POST /auth/logout` also deactivates the push registration associated with the
revoked refresh-token session as a server-side fallback.

`POST /auth/firebase/mobile/login` follows the same device-registration flow:
`idToken` and `platform` are required; `installationId` and `fcmToken` are
optional at login and can be synchronized later through `PUT /devices/me`.

Mobile clients can poll `POST /auth/verify-email/check` and
`POST /auth/password/reset/check` with `{ "email": "...", "token": "..." }`.
Both return `data.success: true` only after that one-time token has been
successfully used on the website. An unused, expired, or replaced token returns
`false`.

Use `POST /auth/verify-email/resend` to send a replacement verification email
and `POST /auth/password/reset/resend` to send a replacement password-reset
email. Resending revokes the previous unused token; verification links expire
after 24 hours and password-reset links after 1 hour. The existing
`POST /auth/password/reset/request` endpoint performs the same password-reset
email operation.

## Backend structure

The intended feature areas include authentication and profiles, skin assessment and analysis, personalized guidance and routines, product recommendations, progress tracking, subscriptions, and catalog administration.

The implemented layers follow Hexagonal Architecture: the presentation layer
adapts HTTP requests, application services orchestrate use cases and define
outbound ports, domain code holds business concepts and rules, and
infrastructure adapters connect those ports to PostgreSQL or SMTP.

```text
src/modules/auth/
├── presentation/       # HTTP controllers, validation DTOs, JWT guard
├── application/
│   ├── ports/          # Outbound contracts grouped by use-case needs
│   └── use-case/       # AuthenticationService
├── domain/             # Entities, enums, value objects
├── infrastructure/
│   └── adapters/       # PostgreSQL and SMTP implementations
└── auth.module.ts      # Nest dependency wiring

src/modules/skin-analysis/   # Assessments, Cloudinary verification, Gemini analysis, result persistence
src/modules/payment/         # SePay webhook, VietQR orders, wallets, and PREMIUM entitlement
src/modules/routine/         # Routine lifecycle and daily check-ins
src/modules/notification/    # Payment delivery, mobile inbox, and preferences
src/modules/audit/           # Admin action audit records
src/shared/                  # API, configuration, database, errors, security, types
database/                # Versioned migrations and explicit admin bootstrap
test/                    # Unit and end-to-end tests
```

For source-code responsibilities and module boundaries, see the architecture
documentation in [`docs/architecture/`](docs/architecture/).

Key application and shared files:

| Path                                                                          | Purpose                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/main.ts`                                                                 | Creates and starts the NestJS application.                                                 |
| `src/app.module.ts`                                                           | Root NestJS module with database and authentication modules.                               |
| `src/modules/auth/application/use-case/authentication.service.ts`             | Coordinates authentication use cases through application-owned outbound ports.             |
| `src/modules/auth/application/ports/authentication.use-case.ports.ts`         | Defines the contracts and DI tokens required by authentication use cases.                  |
| `src/modules/auth/infrastructure/adapters/postgres-authentication.adapter.ts` | Implements authentication persistence and transactional SQL operations.                    |
| `src/modules/auth/infrastructure/adapters/smtp-email.service.ts`              | Sends verification and password-reset emails.                                              |
| `src/modules/auth/presentation/`                                              | HTTP routes, request validation DTOs, and JWT authentication guard.                        |
| `src/modules/auth/domain/`                                                    | Auth entities, enums, and email/password value objects.                                    |
| `src/shared/`                                                                 | Reusable API, CORS/Swagger configuration, database, exception, security, and type helpers. |
| `database/migrations/`                                                        | Ordered, versioned PostgreSQL migrations.                                                  |
| `database/migrate.js`                                                         | CLI that tracks and applies database migrations.                                           |
| `test/`                                                                       | Vitest unit tests and end-to-end test setup.                                               |

## Database design

The migrations create schemas for authentication and user profiles (`app_auth`),
shared purpose-based image upload intents (`app_cloudinary`), skin assessment
and analysis (`app_skin_analysis`), and wallets/payments (`app_billing`), plus
initial auth reference data. Skin-analysis results include the generated skin
profile, while each user has one versioned questionnaire record. Avatar and
skin-analysis uploads use the same upload-intent table and service; the
skin-analysis schema does not own upload-intent storage.

The migration runner connects to PostgreSQL using `GLOWNSCAN_DATABASE_URL` (`DATABASE_URL` is a fallback). It records applied versions and SHA-256 checksums in `public.schema_migrations`, applies each migration in its own transaction, and uses a PostgreSQL advisory lock to prevent concurrent runs. Migrations are run explicitly from the CLI; the NestJS application does not apply them at startup.

## Getting started

### Requirements

- Node.js 22+ and npm
- PostgreSQL (or a Supabase PostgreSQL project) to apply database migrations

### Install and run

```bash
npm install
npm run start:dev
```

On startup, the application checks PostgreSQL before accepting requests. A successful connection prints `Connected to PostgreSQL database "<database>".` in the NestJS log. If the connection fails, startup stops and logs the error. `GET /health/database` checks the live database connection.

By default, the API listens at `http://localhost:3000`. Set the `PORT` environment variable to change the port.
Swagger API documentation is available at `http://localhost:3000/api/docs`. The `POST /auth/password/change` operation supports the **Authorize** button with a JWT Bearer access token.
Browser requests are allowed from the comma-separated origins in `GLOWNSCAN_FRONTEND_URL`; if unset, the local frontend origin `http://localhost:5173` is used. CORS credentials are enabled, so configure explicit trusted origins rather than `*`.

Successful API responses use the shared envelope `{"status":200,"message":"Success","data":{...}}`. Errors use the same shape with `data: null`; known HTTP exceptions retain their HTTP status, while unexpected exceptions return a generic 500 response. Use the shared HTTP exception classes from `src/shared/handler/http.exceptions.ts` for common 400, 401, 403, 404, 409, and 422 responses.

Protected-client integrations can use the stable `errorCode` field on error
responses: `ACCESS_TOKEN_EXPIRED` means a refresh attempt is appropriate;
`INVALID_ACCESS_TOKEN` means the access token cannot be accepted; and
`SESSION_REVOKED` means the client must clear its local session. Refresh only
retries the original safe request once. Do not refresh for login failures or
automatically replay state-changing requests.

The auth `Password` value object requires at least six characters, including an uppercase letter, a lowercase letter, a number, and a special character. Its string/JSON representations are redacted to avoid accidental disclosure.

### Implemented endpoint

| Method      | Endpoint                                                       | Response                                                               |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET`       | `/health/database`                                             | `{"status":"ok","database":"connected"}`                               |
| `GET`       | `/health/live`                                                 | Process liveness probe                                                 |
| `GET`       | `/health/ready`                                                | Dependency readiness probe                                             |
| `POST`      | `/auth/register`                                               | Create a pending user with the `USER` role and send email verification |
| `POST`      | `/auth/verify-email`                                           | Verify a registration token using `{ "email", "token" }`               |
| `POST`      | `/auth/verify-email/resend`                                    | Resend a verification link without revealing account status            |
| `POST`      | `/auth/login`                                                  | Return a JWT access token and opaque refresh token                     |
| `POST`      | `/auth/firebase/login`                                         | Verify a Firebase ID token, link/create the account, and return tokens |
| `POST`      | `/auth/mobile/login`, `/auth/firebase/mobile/login`            | Mobile login; FCM registration is a separate post-login request        |
| `PUT`       | `/devices/me`                                                  | Upsert the caller's FCM token for a stable installation ID             |
| `DELETE`    | `/devices/me`                                                  | Disable notifications for the caller's installation ID                 |
| `POST`      | `/auth/refresh`                                                | Rotate a refresh token and return a new access/refresh token pair      |
| `POST`      | `/auth/logout`                                                 | Revoke the refresh token family                                        |
| `POST`      | `/auth/password/reset/request`                                 | Send a reset link without revealing whether the email exists           |
| `POST`      | `/auth/password/reset/confirm`                                 | Reset using `{ "email", "token", "newPassword" }`                      |
| `POST`      | `/auth/password/change`                                        | Authenticated; verify `oldPassword`, set `newPassword`                 |
| `GET`       | `/skin-assessments/current`                                    | Return the caller's current questionnaire or `null`                    |
| `PUT`       | `/skin-assessments/current`                                    | Validate and save the caller's questionnaire                           |
| `POST`      | `/skin-analysis/upload-intent`                                 | Create a one-time owned Cloudinary upload intent                       |
| `POST`      | `/skin-analysis/analyze`                                       | Verify upload and return `202` queued analysis session                 |
| `GET`       | `/skin-analysis`                                               | Return the caller's paginated analysis history                         |
| `GET`       | `/skin-analysis/:analysisId`                                   | Return an analysis only when it belongs to the caller                  |
| `GET`       | `/recommendations/me`                                          | Return assessment/analysis-matched catalog product cards               |
| `GET`       | `/products/:id`                                                | Return mobile product details and affiliate handoff                    |
| `POST`      | `/routines/draft`                                              | Create an idempotent routine draft from eligible user data             |
| `GET/PATCH` | `/routines/current`, `/routines/:id`                           | Read or edit the caller's current routine                              |
| `POST`      | `/routines/:id/activate`, `/pause`, `/complete`                | Transition an owned routine through supported states                   |
| `GET/PUT`   | `/routines/current/today`, `/routines/current/check-ins/:date` | Read or upsert daily progress                                          |
| `GET`       | `/routines/current/check-ins`                                  | Read bounded check-in history                                          |
| `GET/PATCH` | `/notification-preferences`                                    | Read or update the caller's notification preferences                   |
| `GET`       | `/notifications`                                               | Return paginated inbox items                                           |
| `PATCH`     | `/notifications/:id/read`                                      | Mark an owned notification as read                                     |
| `POST`      | `/notifications/read-all`                                      | Mark all of the caller's notifications as read                         |
| `POST`      | `/payment/top-ups`                                             | Create a VietQR-backed internal-wallet top-up                          |
| `POST`      | `/payment/premium-checkouts`                                   | Create a VietQR-backed `PREMIUM` package checkout                      |
| `GET`       | `/payment/orders/:orderId`                                     | Return an owned payment order                                          |
| `GET`       | `/payment/wallet`                                              | Return the caller's wallet and ledger                                  |
| `POST`      | `/payment/webhook`                                             | Receive authenticated SePay payment confirmation                       |

All POST request bodies are validated; unknown fields are rejected. Passwords are bcrypt-hashed and limited to 72 UTF-8 bytes to match bcrypt's input limit. Verification and reset tokens are random, single-use, expire, and are stored only as SHA-256 hashes. Refresh tokens are opaque, rotated on use, and stored hashed in `app_auth.refresh_tokens` (not `action_tokens`). Password changes invalidate existing access tokens and revoke refresh sessions. Five consecutive failed login attempts lock the account for 15 minutes. Password-reset requests always return the same message whether or not the account exists.

Firebase login accepts `{ "idToken": "<Firebase ID token>" }` at
`POST /auth/firebase/login`. The backend verifies the token with Firebase
Admin against `GLOWNSCAN_FIREBASE_PROJECT_ID`; decoded JWT payloads are never
trusted without signature and claim verification. A verified email is required.
New Firebase accounts are created as active users with a nullable password,
and Firebase identity claims are stored in `app_auth.user_providers`.
`name` and `picture` populate missing profile fields. Do not send a device UUID:
the backend generates one for each login session.

### Configure and migrate the database

Set `GLOWNSCAN_DATABASE_URL` in `.env.local` or `.env` to your Supabase PostgreSQL connection string. The application loads `.env.local` before `.env`; `DATABASE_URL` is also accepted as a fallback. Use a database role that can create schemas, tables, indexes, functions, triggers, and constraints for migrations. Prefer Supabase's direct connection or a **session-mode** pooler; transaction-mode poolers cannot guarantee that the advisory lock and migration statements use the same connection.

```bash
npm run db:migrate:status
npm run db:migrate
```

The initial migration sequence is:

| Version | Description                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------- |
| V001    | Authentication, authorization, Firebase provider identities, user profile fields, and nullable user passwords |
| V002    | Seed auth roles, permissions, and role-permission mappings                                                    |
| V003    | Cloudinary upload intents                                                                                     |
| V004    | Skin analysis schema                                                                                          |
| V005    | Rate-limit and analysis quota schema                                                                          |
| V006    | Internal wallets, SePay payment orders/events, ledger, and PREMIUM subscriptions                              |
| V007    | Versioned user skin-assessment questionnaire                                                                  |
| V008    | Product catalog, ingredients, skin concerns, and affiliate links                                              |
| V009    | 100 replaceable Lorem demo catalog products                                                                   |
| V010    | Payment support requests, notification delivery attempts, and admin audit records                             |
| V011    | Mobile routines/check-ins, notification inbox/preferences, and device metadata                                |

Add a new `V<number>__description.sql` file for future changes; do not edit a migration after it has been applied. The runner detects missing or modified applied migrations and stops with an error. The V001–V011 sequence is intended for a clean schema. **The current `db:migrate:reset` helper has not yet been updated to drop `app_routines` and `app_notifications` created by V011**, so do not use that helper to reset a database after V011 has been applied; use a deliberately provisioned clean development database until reset support is updated. Reset is destructive and has no confirmation guard; never run it against production or data that must be retained. If the old combined SQL script was already run, do not apply these migrations blindly; back up and baseline that database deliberately.

The migration role should be separate from the application's runtime credentials. The schemas enable row-level security and revoke access from `PUBLIC`; configure the required database grants and RLS policies for the runtime role as part of application integration.

### SePay, wallet, and PREMIUM payments

After a payment transaction commits, the notification module sends a payment
confirmation email and an FCM notification to the user's registered devices.
Notification delivery is best-effort and does not roll back a confirmed payment.

`PREMIUM` is the only paid entitlement; “VIP” is merely a UI label, not a second plan. Packages are `PREMIUM_MONTHLY` (45,000 VND / 30 days), `PREMIUM_QUARTERLY` (120,000 VND / 90 days), and `PREMIUM_YEARLY` (500,000 VND / 365 days).

Set the SePay secret and bank-account settings in `.env.local`. The existing deployment spelling `GLOWNSCAN_ADMIN_EMAI` is supported, with `GLOWNSCAN_ADMIN_EMAIL` as fallback. Authenticated clients create QR-backed top-ups at `POST /payment/top-ups`, or fixed-price package checkouts at `POST /payment/premium-checkouts`; both return a VietQR image URL and a payment code. Clients poll `GET /payment/orders/:orderId`, read their wallet and ledger under `/payment/wallet`, and may cancel their own pending order with a reason. An ADMIN can issue an internal-wallet refund with a reason at `POST /payment/admin/orders/:orderId/refund`.

SePay calls `POST /payment/webhook`. The endpoint verifies the five-minute `X-SePay-Timestamp` and HMAC-SHA256 `X-SePay-Signature` over the raw body, and deduplicates the SePay transaction ID. One database transaction credits the customer wallet and administrator collection ledger; for a PREMIUM checkout it immediately pays from that wallet, credits the administrator sale ledger, creates or extends the subscription, and applies the existing `PREMIUM` entitlement. Refunds debit the administrator wallet and credit the customer wallet only—no external bank transfer is initiated.

### Auth configuration and admin bootstrap

Configure the SMTP, frontend URLs, JWT secret, database, and Firebase project ID values from `.env.example` in `.env.local`. Use a unique `GLOWNSCAN_JWT_ACCESS_SECRET` of at least 32 characters. The app requires database, SMTP, and Firebase project ID configuration at startup.

Run migrations first, then create the initial admin explicitly:

```bash
npm run db:migrate
npm run db:bootstrap-admin
```

`db:bootstrap-admin` creates `GLOWNSCAN_ADMIN_EMAIL` (defaults to `admin@example.com`) with the password in `GLOWNSCAN_ADMIN_PASSWORD`; it hashes the password and never stores a fixed bootstrap password in source or migrations. Do not commit `.env.local`.

Email links use `GLOWNSCAN_FRONTEND_URL` plus `GLOWNSCAN_EMAIL_VERIFY_PATH` (default `/verify-email`) and `GLOWNSCAN_PASSWORD_RESET_PATH` (default `/reset-password`). Both links include `email` and the one-time raw token as query parameters; the backend stores only its hash.

## Build, test, and lint

```bash
npm run build
npm test
npm run test:e2e
npm run lint
```
