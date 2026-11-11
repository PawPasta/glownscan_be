# Authentication

## Purpose

Authentication lets a GlowScan user create an account, verify ownership of an
email address, sign in, and maintain or recover access to that account.

## Main workflows

### Register and verify an email

1. The user submits an email, password, and password confirmation to
   `POST /auth/register`.
2. The backend normalizes and validates the email and password, checks that the
   confirmation matches, and hashes the password.
3. In one database transaction, the backend creates a pending account, assigns
   the standard `USER` role, and stores a one-time email-verification token
   hash. The raw token is sent to the user's email.
4. The user submits the email and token to `POST /auth/verify-email`.
5. If the matching token is unexpired and unused, the backend consumes it and
   changes the account to `ACTIVE`.

The user may request a new verification email through
`POST /auth/verify-email/resend`. A new token revokes any previous pending
verification token. The check endpoint reports whether a verification token
has already been consumed; it does not consume the token.

### Sign in

The backend supports password sign-in (`POST /auth/login`), mobile
password sign-in (`POST /auth/mobile/login`), Firebase sign-in
(`POST /auth/firebase/login`), and mobile Firebase sign-in
(`POST /auth/firebase/mobile/login`).

For password sign-in, the backend finds the account by normalized email,
compares the submitted password with its stored hash, and requires the account
to be active. A pending account must verify its email before signing in.
Firebase sign-in requires a valid Firebase identity with a verified email;
the backend links it to an existing account with that email or creates an
active account if none exists. An identity or email already linked elsewhere
is rejected rather than silently merged.

Successful sign-in creates a refresh-token session for a device and returns an
access token and refresh token. Mobile sign-in also associates the supplied
FCM token with the device. Request IP address and user-agent are recorded with
the refresh session.

### Renew or end a session

- `POST /auth/refresh` validates the access-token identity and rotates the
  refresh token. The old token is revoked and a replacement token is issued.
  Reuse of a revoked token revokes the active token in that token family.
- `POST /auth/logout` revokes the refresh-token family, ending the session.
- Protected routes require an active account and a token version matching the
  current account record. This allows password changes and resets to invalidate
  previously issued access tokens.

### Recover or change a password

1. The user requests a reset at `POST /auth/password/reset/request`.
2. If the account exists, the backend creates a one-hour, one-time reset token
   and emails its raw value to the user. The response is intentionally generic
   whether or not an account exists.
3. The user submits the email, token, and new password to
   `POST /auth/password/reset/confirm`.
4. A valid token is consumed, the password hash is replaced, the account token
   version is incremented, and all refresh sessions are revoked.

An authenticated user can instead call `POST /auth/password/change` with the
current and new passwords. The new password must differ from the current one;
changing it also invalidates existing sessions, so the user must sign in again.

## Business rules

- New password accounts remain `PENDING_VERIFICATION` until email verification
  succeeds.
- Email addresses are normalized before account lookup and creation.
- Passwords are stored as hashes; action-token values and refresh-token values
  are stored as hashes rather than raw tokens.
- Five consecutive incorrect password attempts lock an active account for
  15 minutes. A successful login clears the failed-attempt count.
- Locked accounts can become active again after the lock period when looked up
  for sign-in; suspended, deleted, or otherwise inactive accounts cannot sign
  in.
- Verification tokens expire after 24 hours. Password-reset tokens expire after
  one hour. Each action token is single-use; issuing a replacement revokes the
  previous pending token for that purpose.
- Access-token and refresh-token lifetimes are configurable. Defaults are
  15 minutes and 30 days, respectively.

## Business data

Account status, profile identity, roles, Firebase provider links, action-token
state, device registrations, and refresh/push registrations belong to the
`app_auth` context. The schema includes an authentication audit-log table, but
the current authentication workflows do not write audit events to it. Email
delivery is an external side effect; it does not change account state beyond
the database actions described above.
