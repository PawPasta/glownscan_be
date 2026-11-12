# Recommendations and skincare routines

## Current product recommendations

`GET /recommendations/me` requires an access token and derives the owner from
that token. The backend loads the caller's current self-reported skin
assessment and latest successful, accepted skin-analysis result, maps concerns
to catalog concern codes, and returns active matching products. The response
includes matched concerns and a cosmetic-information disclaimer. This is a
deterministic catalog match, not an AI-generated care plan. If there is no
skin context, the current implementation may return generally active catalog
products; clients should explain that the match is not personalized.

## Routine recommendation product flow

The desired routine flow is:

1. Require a completed assessment and a recent successful analysis; disclose
   that the analysis and assessment are sent to the configured AI provider.
2. Build a minimal prompt context from questionnaire answers, validated
   analysis observations/metrics, and eligible catalog product/ingredient
   metadata. Do not send the original image, name, email, or unrelated profile
   fields to the provider.
3. Generate a proposed routine (draft), validate its schema, product IDs,
   step order, frequency, and safety constraints, then persist it with source
   assessment/analysis IDs, model/version, and creation time. Do not silently
   treat generated text as medical advice.
4. Show the draft to its owner. Acceptance is an explicit user action; edits or
   rejection must not be represented as acceptance. Keep a snapshot of the
   accepted steps so later catalog edits do not rewrite the user's routine.
5. On acceptance, create an active routine schedule with user-selected start
   date, local timezone, and preferred morning/evening times. Support pause,
   replacement, completion/check-ins, and deletion as explicit state changes.
6. Calendar sync is optional and requires the routine owner to connect and
   authorize their own Google account. Store provider tokens encrypted, offer
   disconnect/revoke and resync, and avoid duplicate events on retries. A Gmail
   address alone does not authorize writing to that person's calendar.

## State and authorization rules for implementation

Proposed lifecycle: `GENERATING -> READY -> ACCEPTED -> ACTIVE`, with terminal
`REJECTED`, `FAILED`, `PAUSED`, and `COMPLETED` outcomes as appropriate. Reject
invalid transitions. Draft creation and acceptance must be idempotent; a
replayed callback or request must not create duplicate routine schedules or
calendar events. All draft, routine, check-in, and calendar-connection reads
and writes are scoped to the authenticated owner. Calendar sync failures must
not roll back an already accepted routine; retain a retryable sync state and
report it separately.

Routine guidance is cosmetic education, not diagnosis or treatment. The
generator must avoid unsupported claims, flag ingredient conflicts or
uncertainty, avoid recommending a product when required ingredient/usage data
is missing, and return a safe fallback or request human review when the output
fails validation. Users must be able to review and edit before accepting.

## Current implementation gap

The current endpoint returns matched catalog products only. It does not call
an AI provider, persist recommendation drafts, collect acceptance, create a
routine schedule, track completion, connect Google Calendar, or create
calendar events. These are product requirements to implement; they are not
currently delivered by `GET /recommendations/me`.

## Open business decisions

- Define routine duration and review cadence (for example, a short initial
  plan followed by reassessment) and how a new analysis affects an active plan.
- Define allowed step categories, frequency limits, and contraindication
  policy with a qualified skincare reviewer.
- Define local-time recurrence behavior, daylight-saving handling, reminders,
  and whether calendar entries are per step or per morning/evening session.
- Define Google OAuth consent, token retention/encryption key rotation, and
  disconnect/delete behavior before enabling calendar sync in production.
- Define whether generated drafts consume a Premium entitlement/quota and
  how repeated regeneration is rate-limited.
