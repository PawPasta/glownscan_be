# User Profile

## Purpose

The profile represents the authenticated user's personal details and avatar.
The backend exposes the user's own profile; it does not expose a workflow for
reading or editing another user's profile through these routes.

## View and update profile

- `GET /auth/profile` returns the authenticated user's profile.
- `PATCH /auth/profile` updates only the fields supplied in the request:
  full name, date of birth, and gender. Omitted fields remain unchanged.
- Nullable profile fields can be set to `null` to clear their values.
- After an update, the backend returns the refreshed profile.

The avatar is changed through the separate Cloudinary upload and confirmation
workflow documented in [Image Upload](./Upload-Image.md).

## Business rules

- Profile operations require a valid access token for an active account.
- The backend derives the profile owner from the authenticated security
  context; the client does not choose a user ID for these operations.
- Full name, date of birth, and gender are personal profile attributes.
- The skin profile returned by an analysis is not the profile's persisted skin
  data. Skin-analysis results are currently returned by
  `POST /skin-analysis/analyze` and are not saved to the user's profile.

## Data boundary

Profile details and the verified avatar URL are stored on the user's record in
`app_auth.users`. Analysis history, routines, recommendations, and a persisted
skin profile are not part of the current profile workflow.

## Product gaps

- There is no account export/deletion workflow that coordinates auth, payment
  ledger retention, analysis data, Cloudinary assets, device registrations,
  notification tokens, and future routine/calendar data.
- A timezone and preferred routine times are not currently profile fields;
  routine scheduling should collect these explicitly rather than assume the
  server timezone.
- Google Calendar must be connected through explicit OAuth authorization by
  the account owner. A saved Gmail address by itself is not proof of calendar
  access. See [Recommendations](./Recommendation.md).
