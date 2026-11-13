# GlowScan Backend

GlowScan Backend is a NestJS API for the GlowScan skincare application. It is a
TypeScript modular monolith using PostgreSQL (`pg`) for persistence, with
provider integrations behind infrastructure adapters.

## What is in this repository

- Authentication, profiles, and device registration for website and Flutter.
- Skin assessment and asynchronous AI skin analysis using Cloudinary, Gemini,
  Redis, and BullMQ.
- Product catalog, personalized product matching, routines, and daily progress.
- SePay/VietQR wallet payments for the `PREMIUM` entitlement.
- Admin catalog/account operations, notifications, and audit records.

This is a backend repository; client applications are maintained separately.
For product behavior and known gaps, use the business documentation rather than
treating this overview as the full specification.

## Architecture at a glance

```text
Flutter / Website
       |
       v
NestJS presentation -> application use cases -> ports <- infrastructure adapters
                                                   |          |- PostgreSQL
                                                   |          |- Redis/BullMQ
                                                   |          |- Cloudinary/Gemini
                                                   |          `- Firebase/SMTP
```

The code follows Hexagonal Architecture: application/domain code does not
depend on SQL clients or provider SDKs. Nest modules wire application ports to
infrastructure adapters. See [repository architecture rules](.codex/ARCHITECTURE.md)
and the [Authentication module architecture](docs/architecture/Auth-Architecture.md).

## Documentation

- API contracts: [Flutter](docs/api/FLUTTER_API.md) ·
  [Website](docs/api/WEBSITE_API.md)
- Business workflows: [Authentication](docs/business/Authentication.md) ·
  [Skin analysis](docs/business/Skin-Analysis.md) ·
  [Recommendations](docs/business/Recommendation.md) ·
  [Payments](docs/business/Payment.md) ·
  [Catalog](docs/business/Catalog.md) ·
  [Notifications](docs/business/Notification.md)
- [Architecture docs](docs/architecture/) ·
  [Deployment guides](docs/aws/deploy-EC2/) ·
  [Load-test instructions](load-tests/README.md)

The business documents distinguish implemented behavior from planned work.
The API contracts describe request/response fields and client-specific routes.

## Local development

Requirements: Node.js 22+, npm, PostgreSQL, and Redis. Copy `.env.example` to
`.env.local`, replace every placeholder with local/development credentials,
then install dependencies and apply migrations:

```bash
npm ci
npm run db:migrate:status
npm run db:migrate
npm run start:dev
```

The HTTP API listens on `http://localhost:3000` by default. Swagger is available
at `http://localhost:3000/api/docs`. Skin analysis uses a separate worker
process; start it in another terminal with `npm run start:analysis-worker`.
Both API and worker need the configured PostgreSQL and Redis services. Do not
run migration reset commands against production or a database containing data
that must be retained.

## Environment and migrations

Environment variable names and safe placeholders are listed in
[`.env.example`](.env.example). Keep real credentials in `.env.local` or a
secret manager; never commit them. Startup validates required configuration.

Database definitions are versioned in [`database/migrations/`](database/migrations/).
The directory README explains module order and dependencies. This sequence is a
resettable schema baseline; it is not compatible with migration history from
the prior numbering. Apply it with `npm run db:migrate` only after confirming
the target database is the intended clean environment. The API does not migrate
the database on startup.

## Verification

```bash
npm run lint
npm test
npm run test:cov
npm run test:e2e
npm run build
```

## Current follow-up areas

The repository documents remaining product and operational work, including
Google Calendar authorization/sync, scheduled notification delivery, account
export/deletion, analysis/image retention workflows, and some payment
reconciliation operations. See the relevant [business workflows](docs/business/)
and [client API contracts](docs/api/) for status and rationale.
