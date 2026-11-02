# GlowScan Backend

GlowScan is a personalized skincare application. This repository contains the backend API intended to support the mobile app and admin dashboard.

> **Implementation status:** The backend includes authentication, profile, and PostgreSQL integration. A first skin-analysis endpoint can send a user's Cloudinary image to Gemini and return structured visual scores and face-overlay coordinates. Persisted analysis history, routines, recommendations, subscriptions, and catalog features remain planned.

## Product flows

The backend is planned to support these main user journeys:

### 1. Account setup and personalization

```text
Open app
  → Register or log in
  → Complete skin assessment
  → Review and save assessment
  → View personalized home
```

Account and profile data provide the starting point for a user's skin profile and later recommendations.

### 2. Skin analysis and skincare guidance

```text
Capture or upload facial image
  → Validate image and face visibility
      ├─ Invalid → Explain the issue → Try another image
      └─ Valid
          → Analyze observable skin characteristics
          → Save analysis result
          → Update skin profile
          → Show personalized guidance, routine, and product recommendations
```

Analysis history can then be used to review results over time and compare supported skin metrics. Recommendations are intended to use the user's assessment, skin profile, and products in GlowScan's curated catalog.

### 3. Routine and progress tracking

```text
Open routine
  → View morning/evening steps
  → Check in completed steps
  → Review routine history

Run a new skin analysis
  → Add result to analysis history
  → Compare with an earlier result
  → Review changes over time
```

### 4. Premium access

```text
View Premium plans
  → Select a plan
  → Complete and verify purchase
      ├─ Not verified → Show status and recovery options
      └─ Verified → Enable Premium features
  → View or manage subscription
```

Premium capabilities are planned for advanced analysis, progress insights, and routine features. Purchase processing and verification are not implemented in this repository yet.

### 5. Product catalog administration

```text
Admin signs in
  → Manage products and availability
  → Maintain ingredients, skin types, and skin concerns
  → Associate catalog products with relevant skin data
  → Maintain affiliate links
```

The curated catalog is intended to supply product recommendations to users. Purchases through affiliate links take place on external marketplaces, not in GlowScan.

## Flow and requirements diagrams

- [Screen flow](docs/diagram/GlowScan_Diagram-Screen%20Flow.drawio.png) — client navigation across user and admin screens.
- [Use case diagram](docs/diagram/GlowScan_Diagram-Use%20Case%20Diagram.drawio.png) — system actors and planned capabilities.
- [User requirements diagram](docs/diagram/GlowScan_Diagram-User%20Requirements.drawio.png) — high-level information exchanged across user, admin, and analysis workflows.

## Documentation

Project documentation is organized in the [`docs/`](docs/) folder:

- [`architecture/`](docs/architecture/) — backend architecture and source-code responsibilities. See [Backend code structure](docs/architecture/CODE_STRUCTURE.md).
- [`aws/`](docs/aws/) — AWS deployment setup and operations, including EC2, Docker, GitHub Actions, and troubleshooting.
- [`diagram/`](docs/diagram/) — visual references for screen flows, use cases, and user requirements.
- [`git/`](docs/git/) — repository contribution conventions, including [commit message rules](docs/git/COMMIT.md).

## Profile API

Send an access token in the Bearer authorization header for profile endpoints.
`GET /profile` returns the personal and skin profiles. Use `PATCH /profile`
to update personal details and `PATCH /profile/skin` to update skin details.
Fields omitted from a patch are unchanged; nullable fields can be set to
`null` to clear them.

To set an avatar, call `POST /profile/avatar/upload-intent`, upload the image
directly to Cloudinary using the returned `cloudName`, `apiKey`, `timestamp`,
`publicId`, and `signature`, then call `POST /profile/avatar/confirm` with
Cloudinary's `public_id`, `version`, `signature`, and `secure_url`. The upload
intent metadata is stored in `app_cloudinary.upload_intents` with purpose
`AVATAR`; it expires after 10 minutes and can only be consumed once. Creating a
new intent revokes the previous pending avatar intent. On confirmation, the backend
atomically consumes that intent and updates `app_profile.user_profiles.avatar_url`
with Cloudinary's verified `secure_url`. The image URL is not stored in the
upload-intent table. Configure
`GLOWNSCAN_CLOUDINARY_CLOUD_NAME`, `GLOWNSCAN_CLOUDINARY_API_KEY`, and
`GLOWNSCAN_CLOUDINARY_API_SECRET` in the backend environment.

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
the matching unexpired upload intent once, downloads the image, sends it to
Gemini, validates the returned JSON, and returns the analysis. It does not
analyze images based on an unverified URL. This first version does not persist
the analysis result.

The response contains a 0–100 overall visible-skin score, 0–100 scores for
seven visible concern metrics, confidence and visibility for each metric,
regional scores, observations, and `highlights` with normalized image
coordinates (`x`, `y`, and `radius`, each in the 0–1000 coordinate space).
Highlights can be used by the mobile app to draw emphasis markers on the
original image. Scores are visual estimates, not medical diagnoses or
instrument measurements. The client should obtain the user's consent before
uploading or analyzing a facial image.

## Mobile authentication API

`POST /auth/mobile/login` accepts `email`, `password`, `platform` (`ANDROID` or
`IOS`), and `fcmToken`. A successful login stores or refreshes the FCM
registration associated with the login device.

`POST /auth/firebase/mobile/login` accepts `idToken`, `platform` (`ANDROID` or
`IOS`), and `fcmToken`. Firebase mobile login verifies the ID token and stores
or refreshes the FCM registration associated with the login device.

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

src/shared/              # API, configuration, database, errors, security, types
database/                # Versioned migrations and explicit admin bootstrap
test/                    # Unit and end-to-end tests
```

For a detailed **code explain**—including responsibilities of key files and a
registration request walkthrough—see [Backend code structure](docs/architecture/CODE_STRUCTURE.md).

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

The migrations create schemas for authentication and authorization (`app_auth`), user and skin profiles (`app_profile`), shared purpose-based image upload intents (`app_cloudinary`), and skin analysis (`app_skin_analysis`), plus initial auth reference data. Avatar and skin-analysis uploads use the same upload-intent table and service; the skin-analysis schema does not own upload-intent storage.

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

The auth `Password` value object requires at least six characters, including an uppercase letter, a lowercase letter, a number, and a special character. Its string/JSON representations are redacted to avoid accidental disclosure.

### Implemented endpoint

| Method | Endpoint                       | Response                                                               |
| ------ | ------------------------------ | ---------------------------------------------------------------------- |
| `GET`  | `/health/database`             | `{"status":"ok","database":"connected"}`                               |
| `POST` | `/auth/register`               | Create a pending user with the `USER` role and send email verification |
| `POST` | `/auth/verify-email`           | Verify a registration token using `{ "email", "token" }`               |
| `POST` | `/auth/verify-email/resend`    | Resend a verification link without revealing account status            |
| `POST` | `/auth/login`                  | Return a JWT access token and opaque refresh token                     |
| `POST` | `/auth/firebase/login`         | Verify a Firebase ID token, link/create the account, and return tokens |
| `POST` | `/auth/firebase/mobile/login`  | Firebase mobile login; also register the device FCM token              |
| `POST` | `/auth/refresh`                | Rotate a refresh token and return a new access/refresh token pair      |
| `POST` | `/auth/logout`                 | Revoke the refresh token family                                        |
| `POST` | `/auth/password/reset/request` | Send a reset link without revealing whether the email exists           |
| `POST` | `/auth/password/reset/confirm` | Reset using `{ "email", "token", "newPassword" }`                      |
| `POST` | `/auth/password/change`        | Authenticated; verify `oldPassword`, set `newPassword`                 |

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

| Version | Description                                                                              |
| ------- | ---------------------------------------------------------------------------------------- |
| V001    | Authentication, authorization, Firebase provider identities, and nullable user passwords |
| V002    | User and skin profile schema                                                             |
| V003    | Seed auth roles, permissions, and role-permission mappings                               |
| V004    | Cloudinary upload intents                                                                |
| V005    | Skin analysis schema                                                                     |

Add a new `V<number>__description.sql` file for future changes; do not edit a migration after it has been applied. The runner detects missing or modified applied migrations and stops with an error. The current V001–V005 set has been rebuilt and requires a clean schema. `npm run db:migrate:reset` drops the application schemas (`app_auth`, `app_profile`, `app_cloudinary`, `app_skin_analysis`) and `public.schema_migrations`, then reapplies all migrations. It does not drop unrelated schemas, but is destructive and has no confirmation guard; verify `GLOWNSCAN_DATABASE_URL` and use only for demo/development data. Never run it against production or a database whose data must be retained. If the old combined SQL script was already run, do not apply these migrations blindly; back up and baseline that database deliberately.

The migration role should be separate from the application's runtime credentials. The schemas enable row-level security and revoke access from `PUBLIC`; configure the required database grants and RLS policies for the runtime role as part of application integration.

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
