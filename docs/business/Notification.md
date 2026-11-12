# Notifications

## Current behavior

After a payment succeeds, the backend sends an email confirmation and an FCM
push notification to the user's registered mobile devices. Device tokens are
registered by authenticated users and can be disabled at logout. Notification
delivery is a side effect after payment persistence and does not change the
payment outcome.

## Business gaps

- Define delivery retry, dead-letter/manual recovery, delivery-status history,
  and duplicate-notification behavior. Payment idempotency should prevent
  duplicate success notifications on repeated webhooks.
- Define notification preferences, consent, token-expiry cleanup, and account
  deletion behavior.
- Avoid sensitive payment, skin, or account data in push previews; use generic
  copy with authenticated detail retrieval.
- Current documented business event coverage is payment success only; define
  any analysis/routine reminders separately with opt-in and frequency limits.
