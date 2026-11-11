# ADR 0002: Analysis reliability, idempotency, and privacy

Analysis requests use a user-scoped idempotency key plus payload fingerprint.
Quota reservation is atomic in PostgreSQL. The source image is confirmed against
the upload intent before it can be sent to Gemini; logs contain identifiers and
error codes, never image bytes, signed URLs, API keys, or raw provider output.

Gemini retries only transient failures with bounded exponential backoff and a
request timeout. A future worker/outbox deployment must retain the database as
the source of truth and use the analysis ID as a deduplication key; queue delivery
is at-least-once, not exactly-once.

Images are product data, not telemetry. Deletion and retention jobs must remove
Cloudinary assets by verified public ID and leave only minimal audit metadata.
