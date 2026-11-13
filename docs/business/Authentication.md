# Authentication

## Purpose

Authentication establishes account ownership and manages the user's credentials,
sessions, recovery actions, and sign-in providers. All protected API ownership
is derived from the authenticated server-side security context; clients must not
choose an owner by sending `userId`.

## Roles, permissions, and Premium entitlements

`ADMIN` and `USER` are account roles; Premium is a time-bounded subscription,
not a role. Registration assigns `USER` and does not require payment. The
access-policy seed grants `ADMIN` every permission and grants `USER` the
ordinary profile/device permissions plus `SKIN_ANALYSIS_BASIC`.

Premium package permissions are stored separately from role permissions. An
active, not-yet-expired subscription grants the permissions mapped to its
package in `app_billing.premium_package_permissions`. Current Premium packages
grant `SKIN_ANALYSIS_DETAILS`, `RECOMMENDATION_READ`, and `ROUTINE_MANAGE`.
Access checks use the subscription period in PostgreSQL, not a client-supplied
plan, role claim, or stale analysis-quota row. Expired/refunded subscriptions
lose these permissions automatically. `ADMIN` bypasses package checks; it does
not bypass infrastructure protections such as global rate or concurrency
limits.

Free users may sign in, complete their skin assessment, and submit an image for
a basic cosmetic status summary. They cannot read detailed metrics,
observations, or highlights, and cannot access personalized recommendation or
routine APIs. These premium-only APIs return HTTP 403 with
`code: "PREMIUM_REQUIRED"`. Public catalog browsing is not a personalized
recommendation and remains available according to the catalog API contract.

## Account lifecycle

### Register and verify email

1. `POST /auth/register` accepts email, password, and confirmation. The backend
   normalizes email, validates the password, hashes it, and transactionally
   creates a `PENDING_VERIFICATION` user, `USER` role, and one-time verification
   token hash.
2. The raw token is sent by email. It is not stored in PostgreSQL.
3. `POST /auth/verify-email` consumes an unexpired token once and activates the
   account. Resend revokes the prior outstanding token and creates a replacement.
4. The `/check` route reports whether that exact token was consumed; it is not
   a token-validity preflight.

Email delivery currently happens after the database transaction. If SMTP fails,
the account/action-token state may already have committed; durable email outbox
and retry handling remain planned. Reset and resend responses remain generic to
avoid account enumeration.

### Password sign-in and lockout

`POST /auth/login` and `POST /auth/mobile/login` verify the password against the
stored bcrypt hash and require an active account. A pending account must verify
its email. Five consecutive incorrect password attempts lock the account for
15 minutes; successful login clears the counter. The current policy is
account-wide and should be reviewed for denial-of-service risk.

Mobile login does not depend on FCM. After the access/refresh pair is stored,
the app registers or refreshes its installation through `PUT /devices/me`.
Device registration is independent from the authentication session, although
logout also disables the registration associated with the logged-out session.

### Firebase sign-in and account linking

`POST /auth/firebase/login` and `/auth/firebase/mobile/login` require a Firebase
ID token whose signature, audience, issuer, expiry, and revocation status are
checked by Firebase Admin. The token must assert a verified email.

- An already-linked Firebase UID may sign in only to its linked active local
  account. A suspended, pending, deleted, or currently locked account is not
  activated by provider sign-in.
- A first-time Firebase UID may create a new active account if the normalized
  email is not already attached to a local account.
- Matching a verified Firebase email to an existing password account is not
  sufficient to link identities. The API returns a conflict; an explicit,
  authenticated account-linking flow is not implemented yet.
- Firebase revocation checking increases provider dependency/latency; transient
  Firebase verification errors fail closed rather than creating a local login.

### Session creation, refresh, and revocation

Password and Firebase sign-in create an opaque refresh token with 256 bits of
randomness. PostgreSQL stores only its SHA-256 hash. The token belongs to a
device and a stable token family; request IP and user-agent metadata are stored
for operational investigation. Access JWTs include issuer, audience, expiry,
and `tokenVersion`. Protected requests compare that version and active account
status with PostgreSQL.

`POST /auth/refresh` currently requires both the access token and refresh token
in the JSON body. The access JWT signature, issuer, audience, and token version
are checked; expiry is ignored only for this refresh validation. A valid,
unexpired database refresh token is then rotated while its row and session are
locked transactionally.

The session uses a sliding idle lifetime, capped by an absolute lifetime:

- Access token: 15 minutes by default (`GLOWNSCAN_ACCESS_TOKEN_TTL_SECONDS`).
- Refresh idle lifetime: 30 days by default
  (`GLOWNSCAN_REFRESH_TOKEN_TTL_DAYS`).
- Absolute session lifetime: 90 days by default
  (`GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS`); it must not be shorter than
  the idle lifetime.

The absolute boundary is persisted in `app_auth.auth_sessions`; refreshing can
extend idle expiry but never extend the session past its absolute expiry.
Migration V002 creates this table for a clean schema initialization. The
current migration set is a resettable baseline and does not backfill sessions
for an existing database.

Refresh token state and reuse behavior:

```text
ACTIVE --successful rotation--> ROTATED + successor ACTIVE
  |                                  |
  | idle/absolute expiry             | duplicate within 5 seconds
  v                                  v
REVOKED                           HTTP 409 REFRESH_TOKEN_ALREADY_ROTATED
                                     (winning session stays active)

ROTATED token replay after the grace window --> revoke active family
logout/password reset/change                --> revoke active family
```

The five-second duplicate window prevents two near-simultaneous requests from
revoking the winning rotation, but does not issue the successor twice. Flutter
and website clients must implement single-flight refresh, persist the new token
pair atomically, and retry the original safe request at most once. A stale retry
outside the window is treated as possible replay and revokes the family. If a
response containing the newly rotated token is lost, the client may need to
authenticate again; encrypted successor-token recovery is intentionally not
implemented.

`POST /auth/logout` revokes the whole token family. Password change and reset
increment `token_version` and revoke active refresh sessions, so old access JWTs
and refresh tokens stop working. Existing access JWTs are checked against the
database on each protected request.

### Password recovery and change

Reset tokens are random, single-use, stored as hashes, and expire after one
hour. Verification tokens expire after 24 hours. Password reset and password
change invalidate sessions. Reset request/resend responses are intentionally
generic. Registration/reset/change currently use a 6–72 character password
contract plus the domain password policy; longer passphrase-first rules and
compromised-password screening remain a product/security decision.

## Abuse controls

Login, registration, resend, reset request, verify, refresh, logout, action-token
checks, and reset confirmation have endpoint-specific limits backed by the
shared PostgreSQL rate-limit store. Limits are currently keyed by `request.ip`;
deployment must ensure the app is reachable only through the trusted proxy and
that proxy forwarding is configured deliberately. The current app does not
blindly trust arbitrary `X-Forwarded-For` headers. Per-account/device controls,
progressive backoff, rate-limit metrics, and shared-carrier NAT analysis remain
follow-up work.

## Hexagonal architecture

The module uses these inward dependencies:

```text
AuthController / DeviceController / AdminAccountController
                         |
                         v
 AuthenticationService / TokenService / AdminAccountService
       |             |              |             |
       v             v              v             v
 application ports: auth use cases, token runtime, password hash, email
       ^             ^              ^             ^
       |             |              |             |
 PostgreSQL adapter  JWT adapter   bcrypt adapter  SMTP adapter
 Firebase verifier   (JWT library)  (bcryptjs)     (nodemailer)
                         |
                    AuthModule
             (composition root / DI)
```

`presentation/` owns transport DTOs, guards, and HTTP routes. `application/`
coordinates workflows through typed ports and maps expected failures to API
errors. `domain/` owns account/session/token concepts and value objects.
`infrastructure/adapters/` contains PostgreSQL transactions, JWT/Firebase SDK
calls, password hashing, and SMTP delivery. `auth.module.ts` binds interfaces to
implementations. Application/domain code must not import SQL clients, Firebase,
JWT, SMTP, or adapter classes. See
[Auth module architecture](../architecture/Auth-Architecture.md).

Refresh rotation and credential invalidation are adapter-level atomic database
operations. The application decides the policy and token material; the adapter
locks records, changes session/token state, and returns a typed account result.
Raw refresh/action tokens must never cross persistence ports or logs.

## Data and API boundaries

The `app_auth` schema contains users, profiles, roles/permissions, Firebase
provider identities, devices, push registrations, refresh-token records,
action-token records, and the existing auth audit-log table. V002 creates the
server-side auth-session table. Public request/response bodies are documented in
the [Flutter API contract](../api/FLUTTER_API.md) and
[Website API contract](../api/WEBSITE_API.md).

## Remaining auth work

- Add disposable-PostgreSQL integration tests for real locking, rotation,
  uniqueness, reset invalidation, Firebase-link concurrency, and migrations.
- Implement authenticated session list/revoke-one/revoke-others endpoints with
  safe device metadata.
- Add an explicit account-linking flow requiring current-account proof.
- Persist auth security events in `app_auth.auth_audit_logs`; define retention,
  read permissions, redaction, and alerting.
- Make verification/reset email dispatch transactional and retryable without
  retaining raw action tokens in plaintext outbox rows.
- Test rate limits behind the real Nginx topology; add trusted-proxy
  configuration, metrics, and shared-IP fairness controls.
- Define web HttpOnly-cookie/CSRF refresh handling before changing the current
  body-token contract.
- Split `AuthenticationService` and `PostgresAuthenticationAdapter` by business
  transaction responsibility after integration-test coverage exists; avoid a
  behavior-changing line-count-only refactor.

The roadmap is a prioritized hardening plan, not a claim of a completed pentest
or proof that every production deployment is configured securely.
