# Authentication module architecture

This document describes the current implementation in `src/modules/auth` and
its security boundaries. It is implementation documentation, not a penetration
test report or a claim that a deployment is correctly configured.

## Layer boundaries

```text
HTTP / NestJS
  presentation/
  AuthController, DeviceController, AdminAccountController, DTOs
           |
           v
  application/use-case/
  AuthenticationService, TokenService, AdminAccountService
           |
           v
  application/ports/  <------------------------ domain/
  Use-case persistence/provider contracts       Entities, enums, value objects
           ^
           |
  infrastructure/adapters/
  PostgreSQL | Firebase Admin | JWT | bcrypt | SMTP
           ^
           |
  auth.module.ts (composition root binds tokens to adapters)
```

Dependency direction is inward. Controllers validate and translate transport;
application services coordinate use cases; domain types express account,
action-token, refresh-token, auth-session, device, and profile concepts. Infrastructure owns
SQL/transactions and provider SDK calls. `AuthModule` is the only place that
knows the concrete adapter bindings.

| Capability                                                                     | Application contract               | Infrastructure implementation   |
| ------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------- |
| Account registration, login, recovery, profile, device and refresh persistence | `authentication.use-case.ports.ts` | `PostgresAuthenticationAdapter` |
| Admin account CRUD                                                             | `admin-account.port.ts`            | `PostgresAdminAccountAdapter`   |
| Access-token runtime and claims                                                | `token-runtime.port.ts`            | `JwtTokenRuntimeAdapter`        |
| Password hashing                                                               | `password-hasher.port.ts`          | `BcryptPasswordHasherAdapter`   |
| Firebase token verification                                                    | `FirebaseIdTokenVerifierPort`      | `FirebaseIdTokenVerifier`       |
| Verification/reset email delivery                                              | `authentication-email.port.ts`     | `SmtpEmailService`              |

The current auth persistence adapter implements several use-case ports. This
keeps shared SQL transactions together, but makes the adapter large. It should
be split along transaction/business boundaries only after real-PostgreSQL tests
cover current behavior.

## Authentication flows

### Password registration and verification

```text
POST /auth/register
  -> DTO validation and rate limit
  -> normalize email / validate password / hash password
  -> one PostgreSQL transaction:
       create pending user + USER role + verification-token hash
  -> SMTP sends the raw action token after commit
  -> POST /auth/verify-email atomically consumes token and activates user
```

SMTP is currently a non-transactional side effect. If SMTP fails after the
database commit, a user or reset action may require a resend; durable outbox,
bounded retry, and operational visibility remain planned.

### Login and Firebase trust boundary

Password login verifies a local bcrypt hash. Firebase login asks Firebase Admin
to verify signature/claims and check token revocation. Both paths require an
active local user before issuing a session.

```text
Firebase ID token
  -> Firebase Admin verifyIdToken(token, checkRevoked=true)
  -> require provider email_verified
  -> lookup existing provider UID
      -> linked + active local account: sign in
      -> unlinked + email unused: create new active account and provider link
      -> unlinked + email already belongs to local account: 409 conflict
  -> create refresh session
```

Email matching is not considered proof that two identities should be merged.
An explicit link flow must require recent authentication of the existing
account; it is not implemented. Firebase revocation checks add a provider
round-trip; provider errors fail closed.

### Refresh-session rotation

```text
POST /auth/refresh (current access JWT + refresh token)
  -> verify JWT signature, issuer, audience; allow JWT expiry only here
  -> load current user; enforce ACTIVE + token_version
  -> hash refresh token; create candidate successor hash
  -> PostgreSQL transaction locks refresh-token row + auth-session row
  -> enforce token status, idle expiry, absolute expiry, account state
  -> mark previous token ROTATED; update idle expiry, capped at absolute expiry
  -> insert successor token hash in same family
  -> return new access/refresh pair once
```

The raw refresh token exists only in the response; the database stores its
SHA-256 hash. `app_auth.auth_sessions` owns the family-level idle/absolute
boundary. `refresh_tokens` records the rotating token chain. Logout, password
reset/change, expiration, and confirmed reuse revoke the session family.

If the old token is presented again within five seconds of a successful
rotation, the adapter returns a typed duplicate-rotation outcome mapped to
HTTP 409 `REFRESH_TOKEN_ALREADY_ROTATED`; it does not revoke the winning
successor. The stale request still cannot mint a token. After the bounded
window, reuse revokes the active family as possible theft. Clients must
single-flight refreshes and atomically persist the winning token pair. If the
first response is lost, this API does not recover the successor; reauthentication
may be required.

Session defaults are access 900 seconds, refresh idle 30 days, and absolute
family age 90 days. `GLOWNSCAN_REFRESH_SESSION_ABSOLUTE_TTL_DAYS` cannot be less
than the idle lifetime. Migration V002 creates the family-session table as part
of the clean schema baseline. Existing token families are not backfilled by
this resettable schema script.

### Password reset/change and revocation

Action tokens are high-entropy random values; only hashes and purpose/expiry /
consumption state are persisted. Reset/change transactions update the password
hash, increment the user's `token_version`, consume the action token when
applicable, and revoke active refresh sessions. Protected requests load the
current user and compare token version and status, so an old access token is
rejected immediately rather than waiting for JWT expiry.

## Security controls currently present

- Strict DTO whitelist and reject-unknown-fields validation.
- Email verification and password reset action tokens are one-time and expire.
- Opaque refresh tokens are hashed at rest and rotated under row locks.
- Refresh families have both idle and absolute expiration.
- Access JWT issuer/audience/expiration and server-side token-version checks.
- Firebase ID-token revocation checks and no implicit linking by email alone.
- Endpoint-scoped PostgreSQL-backed rate limits for sign-in, registration,
  email actions, refresh, logout, and password recovery.
- Generic password-reset responses and redacted credentials in logs.

Rate limits use `request.ip`. The application currently does not enable Express
`trust proxy` globally, which avoids blindly trusting attacker-supplied
forwarded headers. In a reverse-proxy deployment, configure a trusted proxy
chain deliberately and prevent direct public access to the NestJS listener;
otherwise legitimate requests may share the proxy address for rate limiting.

## Database ownership and atomicity

`app_auth` stores accounts, profile fields, roles/permissions, provider links,
devices, push registrations, action tokens, refresh-token rows, auth sessions,
and an auth audit-log table. SQL, row mapping, `PoolClient`, and transactions
remain in infrastructure adapters.

Atomic adapter operations include registration, email verification, password
reset/change, session creation, refresh rotation, and family revocation. Ports
describe these as domain-oriented operations and do not expose SQL or a generic
transaction callback to application services.

## Known gaps and next work

- No disposable-PostgreSQL integration suite currently proves real concurrent
  refresh, migration application order, unique constraints, or rollback behavior. Unit
  tests around adapter decisions are not a substitute for that integration
  coverage.
- `app_auth.auth_audit_logs` exists but authentication flows do not yet persist
  login/replay/revocation/password security events.
- Email verification/reset sends lack a transactional outbox and bounded retry.
- There is no session list/revoke-one/revoke-others API.
- There is no authenticated account-linking flow for an existing local account
  and a new Firebase identity.
- Rate-limit behavior has not yet been verified behind the production proxy or
  across shared mobile-carrier IPs; metrics and progressive per-account/device
  throttles remain future work.
- Browser refresh is body-token based; HttpOnly-cookie, CSRF, and staged web
  migration remain a separate API-contract change.
- Password policy remains six characters minimum plus current character-class
  rules and bcrypt's 72-byte input limit. A longer passphrase/compromised-secret
  policy and any hash algorithm migration require a separate compatibility
  plan.
- Authentication use cases and the PostgreSQL adapter remain large; further
  decomposition is deferred until integration tests protect transaction
  boundaries.

See [Authentication business rules](../business/Authentication.md) and the
[Flutter](../api/FLUTTER_API.md) / [website](../api/WEBSITE_API.md) API contracts.
