# Wallet, payment, and Premium

## Supported journeys

- Authenticated users create an internal-wallet top-up or fixed-package
  `PREMIUM` checkout. The API returns a payment code and VietQR image URL.
- SePay calls `POST /payment/webhook`. The backend authenticates the signed
  timestamp/body, matches the transfer to a pending order, and deduplicates the
  provider transaction ID.
- The complete signed SePay JSON body is retained for reconciliation, alongside
  indexed/queryable provider fields. Outgoing and unmatched transfers are
  recorded as ignored events and do not mutate wallet or order balances.
- A verified top-up credits the user's wallet. A verified package checkout
  credits the top-up, debits the package price, credits the administrator's
  wallet ledger, and creates or extends the user's single `PREMIUM` entitlement
  atomically.
- Users can read their wallet/ledger and order status, and cancel their own
  pending order with a reason. An `ADMIN` can issue an internal-wallet refund
  with a reason; no external bank transfer is initiated.
- Successful payment triggers email and FCM notification delivery.

## Business invariants

- Amounts are integral VND; package price and duration come from database
  reference data, not client-supplied amounts.
- The webhook must be idempotent by SePay transaction ID and order state.
- Wallet balance and immutable ledger movements must reconcile in one database
  transaction; refund must not exceed available administrator wallet balance
  or refund the same order twice.
- A failed notification must not undo a committed payment. Notification retry
  and delivery status should be observable separately.

## Business gaps and risks

- Define order expiry/reconciliation, partial payment, overpayment,
  underpayment, duplicate transfer, unmatched transfer handling, and customer
  support processes.
- Refunds are internal wallet credit only, not bank refunds. Make this explicit
  in UI/terms and decide whether PREMIUM time is revoked/prorated on refund.
- Define Premium benefits, renewal/expiry UX, grace periods, cancellation
  effects, and entitlement source of truth. README leaves Premium capabilities
  undefined.
- Define ledger retention, financial reporting/reconciliation, and operator
  audit controls. Monitor unmatched or ignored webhook transfers.
- Review tax, consumer-protection, and payment-provider requirements with
  qualified local counsel before launch.
