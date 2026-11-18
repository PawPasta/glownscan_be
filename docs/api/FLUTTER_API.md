# Flutter mobile API contract

This document describes the backend API surface intended for the GlowScan
mobile app. It is an inventory of implemented routes plus missing mobile
capabilities; a route marked **Missing** is not available in the current API.

## Boundary and rationale

Flutter owns the signed-in consumer journey: account/session lifecycle, device
push registration, profile, skin assessment, image analysis, and personalized
recommendations. It does not call admin endpoints. Catalog administration,
admin-account CRUD, and the payment website flows are outside the mobile API
surface by product decision. Recommendation responses currently include
matched product cards; Flutter should not call admin catalog APIs.

All user identity and ownership are derived from the access token. Do not send
`userId` to select an owner. Protected endpoints use `Authorization: Bearer
<accessToken>`. Success responses use `{ status, message, data }`; analysis
creation returns HTTP 202 with the same envelope. Errors include a stable
`code`; `errorCode` remains as a compatibility alias for previously coded
errors. Unknown request fields are rejected.

## Account and session

| Method | Route                                | Status      | Why Flutter uses it                                                                                                        |
| ------ | ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`                     | Implemented | Create a consumer account.                                                                                                 |
| POST   | `/auth/mobile/login`                 | Implemented | Password login; mobile platform is `ANDROID` or `IOS`. FCM token is optional and should be registered after session setup. |
| POST   | `/auth/firebase/mobile/login`        | Implemented | Firebase mobile sign-in.                                                                                                   |
| POST   | `/auth/verify-email`                 | Implemented | Verify an email action token.                                                                                              |
| POST   | `/auth/verify-email/check`           | Implemented | Check token state before completing the UI flow.                                                                           |
| POST   | `/auth/verify-email/resend`          | Implemented | Resend verification email.                                                                                                 |
| POST   | `/auth/refresh`                      | Implemented | Rotate access/refresh credentials.                                                                                         |
| POST   | `/auth/logout`                       | Implemented | Revoke the refresh-token family.                                                                                           |
| POST   | `/auth/password/reset/request`       | Implemented | Start password recovery; response is generic to avoid account enumeration.                                                 |
| POST   | `/auth/password/reset/resend`        | Implemented | Resend the password reset email; same generic response policy.                                                             |
| POST   | `/auth/password/reset/check`         | Implemented | Check reset-token state.                                                                                                   |
| POST   | `/auth/password/reset/confirm`       | Implemented | Set a new password using the action token.                                                                                 |
| POST   | `/auth/password/change`              | Implemented | Change password for the authenticated user.                                                                                |
| GET    | `/auth/profile`                      | Implemented | Load the signed-in user's profile.                                                                                         |
| PATCH  | `/auth/profile`                      | Implemented | Update personal profile fields.                                                                                            |
| POST   | `/auth/profile/avatar/upload-intent` | Implemented | Begin a user-owned avatar upload.                                                                                          |
| POST   | `/auth/profile/avatar/confirm`       | Implemented | Confirm the verified Cloudinary avatar.                                                                                    |
| PUT    | `/devices/me`                        | Implemented | Register/update FCM token by stable installation ID.                                                                       |
| DELETE | `/devices/me`                        | Implemented | Disable this installation's push registration on logout.                                                                   |

Recommended device flow: log in without requiring FCM, persist the session,
then register the current token with `PUT /devices/me`; also sync on token
refresh/app reopen and disable the registration before logout. Do not delete
the Firebase token itself.

### Request bodies

Unless stated otherwise, send `Content-Type: application/json`. The global
validation pipe rejects unknown fields.

`POST /auth/register`:

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

`POST /auth/mobile/login` (do not require FCM during login):

```json
{ "email": "user@example.com", "password": "secret123", "platform": "ANDROID" }
```

`POST /auth/firebase/mobile/login`:

```json
{ "idToken": "<firebase-id-token>", "platform": "IOS" }
```

After login, `PUT /devices/me` syncs the token:

```json
{
  "installationId": "<stable-app-installation-id>",
  "platform": "ANDROID",
  "fcmToken": "<firebase-messaging-token>",
  "appVersion": "1.2.0",
  "locale": "vi-VN",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

`DELETE /devices/me` has a JSON body with the same stable installation ID:

```json
{ "installationId": "<stable-app-installation-id>" }
```

Email/action-token requests:

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
// POST /auth/refresh
{"accessToken":"<current-access-token>","refreshToken":"<current-refresh-token>"}
// POST /auth/logout
{"refreshToken":"<refresh-token>"}
```

`PATCH /auth/profile` accepts any subset of `fullName`, `dateOfBirth`, and
`gender`; nullable fields can be set to `null`:

```json
{
  "fullName": "Nguyen An",
  "dateOfBirth": "1998-04-12",
  "gender": "PREFER_NOT_TO_SAY"
}
```

`fullName` is at most 150 characters, `dateOfBirth` is an ISO date, and
`gender` is `MALE`, `FEMALE`, `OTHER`, or `PREFER_NOT_TO_SAY`. Registration
password is 6–72 characters; action tokens must be at least 32 characters.
Refresh requires both `accessToken` and `refreshToken` in the JSON body.

Access tokens last 15 minutes by default; refresh tokens have a 30-day sliding
idle lifetime capped by a 90-day absolute session lifetime. Client code must
single-flight concurrent refresh attempts and atomically persist the rotated
pair. A duplicate old refresh token received within five seconds returns HTTP
409 with `code: "REFRESH_TOKEN_ALREADY_ROTATED"` without revoking the winning
session. Reuse outside that short concurrency window is treated as possible
replay and revokes the token family. A verified Firebase email is not enough to
link a new provider UID to an existing password account; that attempt returns a
conflict until an explicit account-linking flow is added.

`POST /auth/profile/avatar/upload-intent` has no required body. Upload the
image directly to Cloudinary using the returned signed fields, then confirm:

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

The examples below show the `data` value inside the standard response
envelope `{ "status": 200, "message": "Success", "data": ... }` (POST
routes normally return HTTP 201 and message `Created successfully`).

| Endpoint(s)                                                                                                                                                                                                      | `data` response                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`, `/auth/verify-email`, `/auth/verify-email/resend`, `/auth/logout`, `/auth/password/reset/request`, `/auth/password/reset/resend`, `/auth/password/reset/confirm`, `/auth/password/change` | `{ "message": "..." }`; reset/resend messages are deliberately generic.                                                                                                                                                                                                |
| `POST /auth/verify-email/check`, `/auth/password/reset/check`                                                                                                                                                    | `{ "success": true }` only when this exact token is already marked consumed; `false` otherwise. This is not a preflight check that the token is currently valid.                                                                                                       |
| `POST /auth/mobile/login`, `/auth/firebase/mobile/login`                                                                                                                                                         | `{ "accessToken": "<jwt>", "refreshToken": "<opaque-token>" }`                                                                                                                                                                                                         |
| `POST /auth/refresh`                                                                                                                                                                                             | `{ "accessToken": "<jwt>", "refreshToken": "<rotated-opaque-token>", "expiresIn": 900 }` (`expiresIn` is seconds; use configured runtime value).                                                                                                                       |
| `GET /auth/profile`, `PATCH /auth/profile`, `POST /auth/profile/avatar/confirm`                                                                                                                                  | `{ "profile": { "id": "<uuid>", "userId": "<uuid>", "fullName": "Nguyen An", "avatarUrl": "https://...", "dateOfBirth": "1998-04-12", "gender": "PREFER_NOT_TO_SAY", "createdAt": "<ISO-8601>", "updatedAt": "<ISO-8601>" } }`; nullable profile fields may be `null`. |
| `POST /auth/profile/avatar/upload-intent`                                                                                                                                                                        | `{ "publicId": "glownscan/avatars/...", "timestamp": 1234567890, "signature": "<signature>", "apiKey": "<cloudinary-api-key>", "cloudName": "<cloud-name>" }`                                                                                                          |
| `PUT /devices/me`                                                                                                                                                                                                | `{ "installationId": "<stable-installation-id>", "registered": true, "updatedAt": "<ISO-8601>" }`                                                                                                                                                                      |
| `DELETE /devices/me`                                                                                                                                                                                             | No response data (`undefined`; JSON serialization omits the `data` field).                                                                                                                                                                                             |

The API response envelope's `status` is the HTTP status code, not a separate
business status. Never log or expose the returned access/refresh tokens.

## Core skin experience

| Method | Route                          | Status      | Why Flutter uses it                                                                             |
| ------ | ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/skin-assessments/current`    | Implemented | Load the caller's questionnaire.                                                                |
| PUT    | `/skin-assessments/current`    | Implemented | Save/update self-reported skin context.                                                         |
| GET    | `/skin-analysis/consent-info`  | Implemented | Read the current AI provider and exact consent disclosure before showing consent UI.            |
| POST   | `/skin-analysis/upload-intent` | Implemented | Get a short-lived signed upload intent.                                                         |
| POST   | `/skin-analysis/analyze`       | Implemented | Submit verified Cloudinary metadata; send `Idempotency-Key`; receives 202 and a queued session. |
| GET    | `/skin-analysis/:sessionId`    | Implemented | Poll owned analysis status/result.                                                              |
| GET    | `/skin-analysis?page=&limit=`  | Implemented | Read paginated history.                                                                         |
| GET    | `/recommendations/me?limit=`   | Implemented | Read matched catalog products from assessment and eligible analysis metrics.                    |

Before presenting consent, call `GET /skin-analysis/consent-info`; display its
`disclosureText` and retain its `consentVersion` and `aiProvider`. The current
default provider is Groq. Then submit explicit consent to the upload-intent
endpoint and verify its returned provider/version still match. The backend
records the consent version. Analysis is asynchronous; poll status rather than
keep the create request open.

`USER` is the normal account role; Premium is checked from the caller's
currently active subscription, not from a role or client request field. Free
users may run an analysis and receive the quality outcome and overall status
summary, but not detailed metrics, observations, regions, or highlights. An
active Premium package receives the full result. `ADMIN` bypasses package
entitlement checks. Expired/refunded packages lose Premium API access
immediately. Routine and personalized recommendation APIs return HTTP 403 with
`code: "PREMIUM_REQUIRED"` for Free users; public catalog browsing remains
separate and available under its own contract.

### Core request bodies

`PUT /skin-assessments/current`:

```json
{
  "answers": {
    "skinType": "COMBINATION",
    "sensitivity": "NOT_SURE",
    "concerns": ["ACNE", "OILINESS"],
    "goals": ["REDUCE_ACNE", "OIL_CONTROL"]
  }
}
```

Allowed `skinType`: `NORMAL`, `DRY`, `OILY`, `COMBINATION`, `NOT_SURE`.
Allowed `sensitivity`: `LOW`, `MEDIUM`, `HIGH`, `NOT_SURE`. `concerns` accepts
up to 7 unique values from `ACNE`, `REDNESS`, `DARK_SPOTS`, `PORES`, `DRYNESS`,
`OILINESS`, `TEXTURE`, `NONE`; `NONE` must be used alone. `goals` accepts up
to 6 unique values from `REDUCE_ACNE`, `EVEN_TONE`, `HYDRATION`, `OIL_CONTROL`,
`ANTI_AGING`, `MAINTAIN_HEALTHY_SKIN`.

`POST /skin-analysis/upload-intent` requires consent before uploading:

```json
{ "consentAccepted": true }
```

`GET /skin-analysis/consent-info` has no body and returns:

```json
{
  "consentVersion": "skin-analysis-consent-v3",
  "aiProvider": "GROQ",
  "providerName": "Groq",
  "disclosureText": "Your facial image will be uploaded to Cloudinary and analyzed by Groq for a cosmetic visual estimate. This is not a medical diagnosis."
}
```

Show this disclosure and obtain consent before calling
`POST /skin-analysis/upload-intent`:
`POST /skin-analysis/analyze`:

```json
{
  "publicId": "glownscan/skin-analysis/<user-uuid>/<image-uuid>",
  "version": 1234567890,
  "signature": "<cloudinary-response-signature>",
  "secureUrl": "https://res.cloudinary.com/<cloud>/image/upload/v1234567890/glownscan/skin-analysis/..."
}
```

The analyze request also requires an `Idempotency-Key` header. Reuse the same
key only when retrying the same logical request and same payload. `GET
/skin-analysis` accepts integer query parameters `page` (default 1) and `limit`
(default 20, maximum 100).

### Core response data

`GET /skin-assessments/current` returns `null` before the user has saved an
assessment. GET and PUT otherwise return:

```json
{
  "questionnaireVersion": "skin-assessment-v1",
  "answers": {
    "skinType": "COMBINATION",
    "sensitivity": "NOT_SURE",
    "concerns": ["ACNE", "OILINESS"],
    "goals": ["REDUCE_ACNE", "OIL_CONTROL"]
  },
  "createdAt": "<ISO-8601>",
  "updatedAt": "<ISO-8601>"
}
```

`POST /skin-analysis/upload-intent` returns signed Cloudinary fields:

```json
{
  "publicId": "glownscan/skin-analysis/<user-uuid>/<image-uuid>",
  "timestamp": 1234567890,
  "signature": "<signature>",
  "apiKey": "<cloudinary-api-key>",
  "cloudName": "<cloud-name>",
  "consentVersion": "skin-analysis-consent-v3",
  "aiProvider": "GROQ"
}
```

The upload-intent response includes the same `aiProvider` and
`consentVersion` so the client can ensure they still match the displayed
notice. It also returns the signed upload fields. The create endpoint returns
HTTP 202 with `data` shaped as
`{ "sessionId": "<uuid>", "status": "QUEUED" }`. A retry using the same
user, idempotency key, and payload returns the existing session ID and its
current status; reusing the key with a different payload returns a conflict.
Status polling returns:

```json
{
  "id": "<uuid>",
  "status": "QUEUED",
  "createdAt": "<ISO-8601>",
  "completedAt": null,
  "errorCode": null,
  "result": null
}
```

When completed, status is `SUCCEEDED`. Premium users and admins receive the
full validated skin-analysis JSON (including `schemaVersion`, `quality`,
`limitations`, and `observations`). Free users receive only
`{ "quality": { "accepted", "issues" }, "summary": { "overallSkinScore", "confidence", "notes" }, "premiumRequired": true }`.
Failed jobs have `status: "FAILED"`, a normalized `errorCode`, and normally a
`null` result. History returns `{ "items": [<session>...], "total": 1 }`;
each item follows the same entitlement-aware shape as status polling.

For live updates, connect to Socket.IO namespace `/skin-analysis` on the API
origin using the access token in the Socket.IO `auth` payload (preferred) or an
`Authorization: Bearer <accessToken>` header:

```javascript
const socket = io(`${API_ORIGIN}/skin-analysis`, {
  auth: { token: accessToken },
});
socket.on('analysis.status', (event) => {
  // { sessionId, status, errorCode, occurredAt }
});
socket.on('analysis.ready', () => {
  // Reconcile active sessions through the status/history APIs.
});
```

The server validates the token and derives the user's private room from its
verified identity; clients cannot select another user's room. Events contain no
image, analysis result, or Premium data. Fetch
`GET /skin-analysis/:sessionId` after an event and after reconnect for the
authoritative, entitlement-filtered state. Keep polling as a fallback because
transient Redis/WebSocket outages can drop live events.
`status` is one of `QUEUED`, `RUNNING`, `SUCCEEDED`, or `FAILED` (a repeated
worker attempt can emit `RUNNING`/`QUEUED` more than once). The reverse proxy
must pass WebSocket `Upgrade`/`Connection` headers to the API.
Connections are closed when the access token expires; reconnect with the
rotated/current token. In a multi-instance deployment, keep Socket.IO polling
requests sticky to one API instance, or configure clients and ingress for
WebSocket-only transport.

There are at most three AI-provider processing attempts, one provider request per
attempt, followed by up to three cleanup-only attempts if deletion/purge fails.
Cleanup attempts do not call the AI provider. Once cleanup succeeds, the backend deletes
the Cloudinary image and analysis result data, retains a minimal `FAILED`
session for status/history, and sends inbox, email, and FCM notices asking for
a new upload.

`GET /recommendations/me` returns:

```json
{
  "generatedAt": "<ISO-8601>",
  "source": {
    "assessmentAvailable": true,
    "analysisAvailable": true,
    "concernCodes": ["ACNE", "OILINESS"]
  },
  "items": [
    {
      "id": "<product-uuid>",
      "name": "Daily Moisturizer",
      "brand": "Example",
      "description": "Lightweight moisturizer",
      "imageUrl": "https://...",
      "matchedConcerns": ["ACNE"],
      "reasons": ["Matches your acne concern."],
      "disclaimer": "Cosmetic product information only; not medical advice."
    }
  ]
}
```

The response is wrapped in the common envelope; recommendation `items` are
matched product cards, not a persisted routine or medical advice.

## Routine lifecycle and daily completion

| Method | Route                                   | Status      | Purpose                                                                                                                                |
| ------ | --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/routines/draft`                       | Implemented | Create a draft from caller assessment, latest eligible successful analysis, and matched active products. One current routine per user. |
| GET    | `/routines/current`                     | Implemented | Return caller's current routine or `null`.                                                                                             |
| PATCH  | `/routines/:id`                         | Implemented | Edit title and steps for an owned non-completed routine.                                                                               |
| POST   | `/routines/:id/activate`                | Implemented | Activate a draft or resume a paused routine.                                                                                           |
| POST   | `/routines/:id/pause`                   | Implemented | Pause an active routine.                                                                                                               |
| POST   | `/routines/:id/complete`                | Implemented | Complete/archive an owned routine.                                                                                                     |
| GET    | `/routines/current/today`               | Implemented | Load today's progress (server UTC date).                                                                                               |
| PUT    | `/routines/current/check-ins/:date`     | Implemented | Idempotently upsert step completion and note.                                                                                          |
| GET    | `/routines/current/check-ins?from=&to=` | Implemented | Load check-in history over inclusive ISO dates.                                                                                        |

`POST /routines/draft`:

Send a required `Idempotency-Key` header (unique per logical draft request;
reuse only for a retry with identical body):

```json
{
  "analysisSessionId": null,
  "preferences": { "morning": true, "evening": true, "maxStepsPerRoutine": 4 }
}
```

`analysisSessionId` is optional; if supplied, it must belong to the caller and
be successful. Otherwise the latest successful analysis is used when present.
At least one period is required; `maxStepsPerRoutine` is 1–8. The current
generator uses deterministic general-wellness templates and eligible catalog
matching; it does not call an LLM. It is not medical advice.
Repeating the same key and payload returns the same routine; using the same key
with another payload returns HTTP 409 with `code: "IDEMPOTENCY_KEY_CONFLICT"`.
A second active/draft routine with a different key returns
`ROUTINE_ALREADY_EXISTS`; invalid lifecycle transitions return
`ROUTINE_INVALID_TRANSITION`.

`PATCH /routines/:id` accepts an optional `title`, `morningSteps`, and/or
`eveningSteps`. Each step has `id` (optional), `period` (`MORNING` or
`EVENING`), positive integer `position`, `title`, `instruction`, `optional`,
and optional `product` card. Routine data includes `id`, `title`, `status`
(`DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`), both step arrays and timestamps.
Transition endpoints have no body.

Routine response `data` example:

```json
{
  "id": "<routine-uuid>",
  "title": "Personalized skin routine",
  "status": "DRAFT",
  "morningSteps": [
    {
      "id": "<step-uuid>",
      "period": "MORNING",
      "position": 1,
      "title": "Cleanse",
      "instruction": "Gently cleanse your face and pat dry.",
      "optional": false,
      "product": null
    }
  ],
  "eveningSteps": [],
  "createdAt": "<ISO-8601>",
  "updatedAt": "<ISO-8601>",
  "activatedAt": null,
  "completedAt": null
}
```

Daily check-in body:

```json
{ "completedStepIds": ["<step-uuid>"], "note": "Skin felt dry today" }
```

The path date is `YYYY-MM-DD`; step IDs must belong to the caller's active
routine. Response data contains `date`, `completedStepIds`,
`completionPercent`, and `streakDays`. History returns `{ "items": [...] }`.

## Product detail and notification inbox

| Method    | Route                         | Status      | Purpose                                                        |
| --------- | ----------------------------- | ----------- | -------------------------------------------------------------- |
| GET       | `/products/:id`               | Implemented | Mobile product detail and affiliate handoff; public read only. |
| GET/PATCH | `/notification-preferences`   | Implemented | Read/update caller's notification settings.                    |
| GET       | `/notifications?page=&limit=` | Implemented | Paginated inbox `{ items, total }`.                            |
| PATCH     | `/notifications/:id/read`     | Implemented | Mark one owned entry read.                                     |
| POST      | `/notifications/read-all`     | Implemented | Mark all caller's unread entries read.                         |

`PATCH /notification-preferences` accepts a partial object:

```json
{
  "routineReminders": true,
  "analysisUpdates": true,
  "productRecommendations": false,
  "marketing": false,
  "reminderTime": "20:30",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

Preferences response data echoes the six preference fields and `updatedAt`.
`GET /notifications` data is `{ "items": [{ "id", "type", "title",
"body", "payload", "readAt", "createdAt" }], "total": 0 }`. Mark-one
returns `{ "id": "<notification-uuid>", "read": true }`; mark-all returns
`{ "updatedCount": 0 }`.

Product detail contains `id`, `name`, `brand`, `description`, ingredient
names, `usageInstructions`, `warnings`, `imageUrls`, `externalUrl`, and
`affiliateDisclosure`. Catalog currently does not persist usage instructions
or warnings, so these are `null` and `[]` until catalog schema support is
added. `externalUrl` is the first active affiliate URL or `null`.

Product detail response data example:

```json
{
  "id": "<product-uuid>",
  "name": "Daily Moisturizer",
  "brand": "Example",
  "description": "Lightweight moisturizer",
  "ingredients": ["Niacinamide"],
  "usageInstructions": null,
  "warnings": [],
  "imageUrls": ["https://..."],
  "externalUrl": "https://...",
  "affiliateDisclosure": "This product link may be an affiliate link."
}
```

## Missing Flutter APIs / contracts

- Google Calendar connection for the routine owner: OAuth start/callback or
  native authorization exchange, connection status/disconnect, and idempotent
  sync/retry. A Gmail address alone must never be used as calendar write
  authorization. Calendar sync is optional and separate from routine
  acceptance.
- Analysis retry, source-photo deletion, reporting, and retention status APIs
  remain unavailable. These need an explicit retention and provider-delete /
  reconciliation policy; deleting a session row alone is not image deletion.
- Account export/deletion workflows remain unavailable until coordinated
  retention rules for billing/audit data, Cloudinary assets, devices, routines,
  and analysis records are defined.
- Reminder/analysis-update scheduling is not implemented; notification
  preferences persist, while delivery currently covers payment success.
- Payment and subscription APIs are intentionally assigned to the website by
  the current product boundary. If Flutter must buy/renew Premium, that is a
  product-contract change and requires reassigning the payment endpoints, not
  duplicating payment behavior.
