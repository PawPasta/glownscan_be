# GlowScan Backend

GlowScan is a personalized skincare application. This repository contains the backend API intended to support the mobile app and admin dashboard.

> **Implementation status:** The product flows below describe the planned system behavior. The current NestJS app is still a scaffold: the only registered endpoint is `GET /`, which returns `Hello World!`. The database schema is a design script and is not connected to the running application.

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

## Backend structure

The intended feature areas include authentication and profiles, skin assessment and analysis, personalized guidance and routines, product recommendations, progress tracking, subscriptions, and catalog administration.

Current repository layout:

| Path                                  | Purpose                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                         | Creates and starts the NestJS application.                                                                                         |
| `src/app.module.ts`                   | Root NestJS module. No feature modules are currently registered.                                                                   |
| `src/modules/auth/domain/entities/`   | Authentication domain entities mapped from the V1 `app_auth` schema.                                                               |
| `src/modules/auth/application/ports/` | Persistence repository contracts for auth entities; adapters can implement them with PostgreSQL or another persistence technology. |
| `src/modules/auth/`                   | Authentication module area; domain entities exist, but authentication behavior is not yet wired into the app.                      |
| `database/migrations/`                | Ordered, versioned PostgreSQL migrations.                                                                                          |
| `database/migrate.js`                 | CLI that tracks and applies database migrations.                                                                                   |
| `test/`                               | Vitest unit and end-to-end test configuration and starter tests.                                                                   |

## Database design

The migrations create schemas for authentication and authorization (`app_auth`), user and skin profiles (`app_profile`), image upload intents (`app_cloudinary`), and skin analysis (`app_skin_analysis`), plus initial auth reference data.

The migration runner connects to PostgreSQL using `DATABASE_URL`. It records applied versions and SHA-256 checksums in `public.schema_migrations`, applies each migration in its own transaction, and uses a PostgreSQL advisory lock to prevent concurrent runs. Migrations are run explicitly from the CLI; the NestJS application does not apply them at startup.

## Getting started

### Requirements

- Node.js 22+ and npm
- PostgreSQL (or a Supabase PostgreSQL project) to apply database migrations

### Install and run

```bash
npm install
npm run start:dev
```

On startup, the application checks PostgreSQL before accepting requests. A successful connection prints `Connected to PostgreSQL database "<database>".` in the NestJS log. If the connection fails, startup stops and logs the error. You can also check the live connection with `GET /health/database`; a healthy response is `{"status":"ok","database":"connected"}`.

By default, the API listens at `http://localhost:3000`. Set the `PORT` environment variable to change the port.
Swagger API documentation is available at `http://localhost:3000/api/docs`.
Browser requests are allowed from the comma-separated origins in `GLOWNSCAN_FRONTEND_URL`; if unset, the local frontend origin `http://localhost:5173` is used. CORS credentials are enabled, so configure explicit trusted origins rather than `*`.

Successful API responses use the shared envelope `{"status":200,"message":"Success","data":{...}}`. Errors use the same shape with `data: null`; known HTTP exceptions retain their HTTP status, while unexpected exceptions return a generic 500 response. Use the shared HTTP exception classes from `src/shared/exceptions/http.exceptions.ts` for common 400, 401, 403, 404, 409, and 422 responses.

The auth `Password` value object requires at least six characters, including an uppercase letter, a lowercase letter, a number, and a special character. Its string/JSON representations are redacted to avoid accidental disclosure.

### Implemented endpoint

| Method | Endpoint           | Response                                 |
| ------ | ------------------ | ---------------------------------------- |
| `GET`  | `/`                | `Hello World!`                           |
| `GET`  | `/health/database` | `{"status":"ok","database":"connected"}` |

### Configure and migrate the database

Set `GLOWNSCAN_DATABASE_URL` in `.env.local` or `.env` to your Supabase PostgreSQL connection string. The application loads `.env.local` before `.env`; `DATABASE_URL` is also accepted as a fallback. Use a database role that can create schemas, tables, indexes, functions, triggers, and constraints for migrations. Prefer Supabase's direct connection or a **session-mode** pooler; transaction-mode poolers cannot guarantee that the advisory lock and migration statements use the same connection.

```bash
npm run db:migrate:status
npm run db:migrate
```

The initial migration sequence is:

| Version | Description                                                |
| ------- | ---------------------------------------------------------- |
| V001    | Authentication and authorization schema                    |
| V002    | User and skin profile schema                               |
| V003    | Seed auth roles, permissions, and role-permission mappings |
| V004    | Cloudinary upload intents                                  |
| V005    | Skin analysis schema                                       |

Add a new `V<number>__description.sql` file for future changes; do not edit a migration after it has been applied. The runner detects missing or modified applied migrations and stops with an error. These migrations are intended for a fresh database; if the old combined SQL script was already run, do not apply these migrations blindly because the database has no recorded baseline. Back up and baseline that database deliberately before using the runner.

The migration role should be separate from the application's runtime credentials. The schemas enable row-level security and revoke access from `PUBLIC`; configure the required database grants and RLS policies for the runtime role as part of application integration.

## Build, test, and lint

```bash
npm run build
npm test
npm run test:e2e
npm run lint
```
