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
<accessToken>`. Most responses use `{ status, message, data }`; analysis
creation returns HTTP 202 with the same envelope. Errors use the backend error
envelope and stable error codes where defined. Unknown request fields are
rejected.

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
  "fcmToken": "<firebase-messaging-token>"
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
| `PUT /devices/me`                                                                                                                                                                                                | `{ "message": "Device registration synchronized." }`                                                                                                                                                                                                                   |
| `DELETE /devices/me`                                                                                                                                                                                             | No response data (`undefined`; JSON serialization omits the `data` field).                                                                                                                                                                                             |

The API response envelope's `status` is the HTTP status code, not a separate
business status. Never log or expose the returned access/refresh tokens.

## Core skin experience

| Method | Route                          | Status      | Why Flutter uses it                                                                             |
| ------ | ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/skin-assessments/current`    | Implemented | Load the caller's questionnaire.                                                                |
| PUT    | `/skin-assessments/current`    | Implemented | Save/update self-reported skin context.                                                         |
| POST   | `/skin-analysis/upload-intent` | Implemented | Get a short-lived signed upload intent.                                                         |
| POST   | `/skin-analysis/analyze`       | Implemented | Submit verified Cloudinary metadata; send `Idempotency-Key`; receives 202 and a queued session. |
| GET    | `/skin-analysis/:sessionId`    | Implemented | Poll owned analysis status/result.                                                              |
| GET    | `/skin-analysis?page=&limit=`  | Implemented | Read paginated history.                                                                         |
| GET    | `/recommendations/me?limit=`   | Implemented | Read matched catalog products from assessment and eligible analysis metrics.                    |

The app must obtain and explain consent before uploading facial images. The
current backend does not persist that consent, despite a schema/entity being
present. Analysis is asynchronous; the app should poll status rather than keep
the create request open.

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

`POST /skin-analysis/upload-intent` has no body. Upload the image to Cloudinary
using the signed intent response, then submit the returned upload metadata to
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
  "cloudName": "<cloud-name>"
}
```

The create endpoint returns HTTP 202 with `data` shaped as
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

When completed, status is `SUCCEEDED` and `result` contains the validated skin-analysis JSON (including
`schemaVersion`, `quality`, `limitations`, and `observations`). Failed jobs
have `status: "FAILED"`, a normalized `errorCode`, and normally a `null`
result. History returns `{ "items": [<session>...], "total": 1 }`; `items`
use the same session shape as status polling.

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

## Missing Flutter APIs / contracts

- Routine lifecycle: generate/persist a recommendation draft from assessment,
  analysis, and eligible catalog data; get/list drafts; accept, edit, reject;
  create/update/pause/complete a routine; daily step check-ins and history.
- Google Calendar connection for the routine owner: OAuth start/callback or
  native authorization exchange, connection status/disconnect, and idempotent
  sync/retry. A Gmail address alone must never be used as calendar write
  authorization. Calendar sync is optional and separate from routine
  acceptance.
- Recommendation response lacks affiliate-link details and detailed product
  data for a mobile product detail/purchase handoff; define whether Flutter
  should use public catalog read routes or receive a richer recommendation
  response. By the current product boundary, admin catalog routes remain
  website-only.
- Analysis deletion/retry/reporting and account export/deletion APIs are not
  available; define ownership and retention policy before adding them.
- Notification preference/history APIs are not available. Current mobile
  device registration supports payment-success FCM delivery only.
- Payment and subscription APIs are intentionally assigned to the website by
  the current product boundary. If Flutter must buy/renew Premium, that is a
  product-contract change and requires reassigning the payment endpoints, not
  duplicating payment behavior.
