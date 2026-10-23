# Backend code structure

This document explains where backend behavior belongs, how the authentication
request flows through the application, and the responsibilities of the main
source files.

## Architecture at a glance

The backend uses NestJS with a Hexagonal Architecture boundary around
application use cases:

```text
HTTP request
  -> presentation adapter (controller, DTO validation, auth guard)
  -> application service / use case
  -> application outbound port
  -> infrastructure adapter (PostgreSQL or SMTP)
  -> external system
```

The application layer owns business orchestration and defines the ports it
needs. Infrastructure implements those ports. Domain entities and value
objects express domain state and rules without depending on NestJS, PostgreSQL,
or HTTP.

## Repository map

```text
src/
├── main.ts
├── app.module.ts
├── modules/
│   └── auth/
│       ├── auth.module.ts
│       ├── presentation/
│       ├── application/
│       │   ├── ports/
│       │   └── use-case/
│       ├── domain/
│       │   ├── entities/
│       │   └── value-objects/
│       └── infrastructure/
│           └── adapters/
└── shared/
    ├── api/
    ├── config/
    ├── database/
    ├── handler/
    ├── security/
    └── types/

database/
├── migrate.js
├── bootstrap-admin.js
└── migrations/

test/
docs/
└── architecture/
```

## Application layers

### `src/modules/auth/presentation/` — inbound HTTP adapter

This layer translates HTTP requests into application calls. DTO classes define
the request shape and `class-validator` rules; controllers select the use case
and pass request metadata; guards authenticate protected requests. It should
not contain persistence SQL or business workflows.

| File | Responsibility |
| --- | --- |
| `auth.controller.ts` | Maps `/auth` routes and HTTP request data to `AuthenticationService` methods. |
| `auth.dto.ts` | Defines and validates request payloads for registration, login, verification, refresh, and password operations. |
| `jwt-auth.guard.ts` | Reads and verifies the Bearer JWT, asks the application to validate its user/token version, and attaches the `SecurityContext` to the request. |

### `src/modules/auth/application/use-case/` — application logic

| File | Responsibility |
| --- | --- |
| `authentication.service.ts` | Orchestrates register, email verification/resend, login, refresh/logout, password reset/change, and access-token validation. Applies password/email rules, hashes secrets, issues JWTs, and calls outbound ports. |

The service depends on contracts from `application/ports`; it should not import
the PostgreSQL adapter or issue SQL itself.

### `src/modules/auth/application/ports/` — outbound contracts

| File | Responsibility |
| --- | --- |
| `authentication.use-case.ports.ts` | Declares the persistence capabilities needed by auth use cases, grouped by use-case responsibility, along with the Nest injection tokens and data contracts. |
| `index.ts` | Barrel exports port contracts and tokens for stable, concise imports. |

These are application-owned outbound ports. The adapter can be replaced or
mocked without changing use-case behavior.

### `src/modules/auth/domain/` — domain model

| Path / file | Responsibility |
| --- | --- |
| `entities/user.entity.ts` | User identity and account-state invariants. |
| `entities/role.entity.ts` | Authorization role. |
| `entities/permission.entity.ts` | Permission granted by the authorization model. |
| `entities/user-role.entity.ts` | Association between users and roles. |
| `entities/role-permission.entity.ts` | Association between roles and permissions. |
| `entities/action-token.entity.ts` | One-time actions such as email verification and password reset. |
| `entities/refresh-token.entity.ts` | Refresh-token/session state and rotation metadata. |
| `entities/user-device.entity.ts` | A user's registered device and platform. |
| `entities/push-registration.entity.ts` | Push-notification registration state. |
| `entities/auth-audit-log.entity.ts` | Authentication and authorization audit event. |
| `entities/enums/auth.enums.ts` | Shared domain enums for statuses, purposes, and event types. |
| `entities/index.ts` | Barrel exports for auth entities and enums. |
| `value-objects/email.vo.ts` | Email normalization and validity rules. |
| `value-objects/password.vo.ts` | Password policy and safe/redacted string representation. |

Domain code is independent of transport and persistence implementation details.

### `src/modules/auth/infrastructure/adapters/` — outbound adapters

| File | Responsibility |
| --- | --- |
| `postgres-authentication.adapter.ts` | Implements auth persistence ports with PostgreSQL queries and transactions. Multi-table workflows such as registration, password updates, and refresh rotation remain atomic here. |
| `smtp-email.service.ts` | Builds frontend verification/reset links and sends them through SMTP. |

### `src/modules/auth/auth.module.ts` — dependency wiring

Registers auth use cases, adapters, JWT settings, and binds each port token to
the PostgreSQL implementation. This is the composition root for the auth
feature; it contains wiring rather than business rules.

## Shared code

| Path / file | Responsibility |
| --- | --- |
| `src/shared/api/api-response.ts` | Generic response envelope type used across endpoints. |
| `src/shared/api/response.interceptor.ts` | Wraps successful endpoint results in the shared API response format. |
| `src/shared/config/cors.config.ts` | Configures trusted browser origins and CORS behavior. |
| `src/shared/config/swagger.config.ts` | Configures the Swagger document and Bearer JWT scheme. |
| `src/shared/database/database.module.ts` | Exposes the shared PostgreSQL service through Nest dependency injection. |
| `src/shared/database/database.service.ts` | Owns the PostgreSQL pool, startup connection check, query helper, and transaction helper. |
| `src/shared/database/health.controller.ts` | Exposes the database health endpoint. |
| `src/shared/handler/global-exception.filter.ts` | Converts unhandled/HTTP exceptions into the shared error response envelope. |
| `src/shared/handler/http.exceptions.ts` | Common HTTP exception types such as bad request, unauthorized, and conflict. |
| `src/shared/security/security.context.ts` | Authenticated user context and decorator used by protected endpoints. |
| `src/shared/types/domain.types.ts` | Shared primitive domain types and validation helpers. |

## Application entry points and database tooling

| File / path | Responsibility |
| --- | --- |
| `src/main.ts` | Creates the Nest application and installs validation, CORS, Swagger, response, and exception handling. |
| `src/app.module.ts` | Loads environment configuration and imports the root/shared/auth modules. |
| `database/migrate.js` | Applies ordered SQL migrations, verifies checksums, and records migration history. |
| `database/migrations/V001__create_auth_schema.sql` | Creates auth tables and the `app_auth` schema. |
| `database/migrations/V002__create_profile_schema.sql` | Creates profile tables and the `app_profile` schema. |
| `database/migrations/V003__seed_auth_reference_data.sql` | Seeds auth roles, permissions, and mappings. |
| `database/migrations/V004__create_app_cloudinary_upload_intents.sql` | Creates Cloudinary upload-intent storage. |
| `database/migrations/V005__create_skin_analysis_schema.sql` | Creates skin-analysis tables and schema. |
| `database/bootstrap-admin.js` | Explicitly creates an initial admin from environment configuration after migrations. |
| `test/` | Vitest unit tests and end-to-end test setup. |

## Example: registration request

```text
POST /auth/register
  -> AuthController.register(RegisterDto)
  -> Nest ValidationPipe validates the payload
  -> AuthenticationService.register(...)
      -> validates email/password and confirmation
      -> hashes password and creates a one-time verification token
      -> RegisterAccountPort.registerUser(...)
          -> PostgresAuthenticationAdapter.registerUser(...)
              -> transaction: create USER, role association, action token
      -> SmtpEmailService.sendVerificationEmail(...)
  -> ResponseInterceptor wraps the success result
```

To add a new auth capability, define its application contract in
`authentication.use-case.ports.ts`, orchestrate it from the application
service, implement persistence or external I/O in an infrastructure adapter,
bind it in `auth.module.ts`, and expose it through presentation only when it
needs an HTTP endpoint.
