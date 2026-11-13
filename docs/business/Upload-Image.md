# Image Upload

## Purpose

GlowScan uploads profile avatars and facial images directly from the client to
Cloudinary. The backend issues a short-lived, user-bound upload intent and
verifies Cloudinary's response before accepting the upload for its intended
purpose.

## Shared upload workflow

1. The authenticated client requests an upload intent. Avatar uploads use
   `POST /auth/profile/avatar/upload-intent`; skin-analysis images use
   `POST /skin-analysis/upload-intent` with `{ "consentAccepted": true }` after
   showing the versioned Cloudinary/Gemini processing notice.
2. The backend creates a unique `publicId` under the authenticated user's
   `glownscan/avatars/` or `glownscan/skin-analysis/` path, signs the upload
   parameters, and saves an intent with its purpose and expiration. For
   analysis uploads it also records the consent version before issuing a
   signature.
3. The client uploads the image directly to Cloudinary using the returned
   `cloudName`, `apiKey`, `timestamp`, `publicId`, and `signature`. The image
   bytes do not pass through the backend during this upload.
4. The client submits Cloudinary's `public_id`, `version`, `signature`, and
   `secure_url` to the backend confirmation operation (or to the skin-analysis
   operation, which confirms the upload before analysis).
5. The backend checks that the response signature, Cloudinary URL, user path,
   purpose, and still-valid intent match. An upload intent can be consumed
   only once.

## Avatar upload

After a valid avatar confirmation, the backend atomically consumes the intent
and updates `app_auth.users.avatar_url` to the verified Cloudinary URL. The
confirmation endpoint then returns the user's refreshed profile.

## Skin-analysis image upload

A skin-analysis upload intent is consumed when the client calls
`POST /skin-analysis/analyze`. The backend then downloads and validates the
image, and sends it for analysis. See [Skin Analysis](./Skin-Analysis.md) for
the complete processing flow.

## Business rules and data handling

- Intents expire after 10 minutes.
- Creating another intent revokes the previous pending intent for the same
  user and purpose. An avatar intent does not revoke a skin-analysis intent,
  or vice versa.
- The public ID is scoped to the authenticated user and includes a unique image
  identifier.
- The intent record stores upload metadata, not image bytes or the returned
  URL. A related consent record stores only the notice version and acceptance
  time. Cloudinary stores the uploaded image.
- For analysis images, the backend accepts JPEG, PNG, or WebP and limits the
  downloaded image to 10 MB. These content checks are applied during
  analysis, not by the Cloudinary upload itself.
- After three failed Gemini processing attempts, cleanup jobs try up to three
  times to delete the Cloudinary asset and analysis payload. The failure notice
  asks the user to obtain a fresh intent and upload again.
- Retention and user-requested/account-deletion workflows for successful
  analyses still need a product policy and enforceable lifecycle job.

## Business data

Upload intents are stored in `app_cloudinary.upload_intents` and distinguish
the `AVATAR` and `SKIN_ANALYSIS` purposes. Avatar URLs are stored on the
authenticated user's record after confirmation. The current skin-analysis
flow does not create an image-history record in the database.
