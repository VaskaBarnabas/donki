# Payments API

The Payments service creates Stripe Checkout payment links for **pro-forma invoices** and processes Stripe webhooks.
Stripe runs in **test mode**; all amounts are in **HUF**.

After a successful payment the **final invoice** is issued by [SzámlaBridge](https://www.szamlabridge.com) in the
connected **Számlázz.hu test account** (Stripe → SzámlaBridge → Számlázz.hu). In Számlázz.hu test mode no data is
reported to the Hungarian tax authority (NAV). The service refuses to run outside test mode.

## Authentication

```
Authorization: Bearer <LEGACY_PAYMENTS_KEY>
```

## Conventions

- JSON in and out, `camelCase` fields, ISO 8601 timestamps.
- Amounts are in the currency's **minor unit** (`amountMinor`, fillér for HUF): `5347116.46 HUF` → `534711646`.
- Errors use proper HTTP status codes and a consistent body:

```json
{"error":{"type":"invoice_already_paid","message":"Invoice SZ-2026-000180 is already paid"}}
```

## Endpoints

### Create a payment link

```
POST http://localhost:4104/api/legacy/payments        (service network: http://payments:4104)
{"invoiceRef":"DB-2026-000031"}
```

`201 Created`:

```json
{
  "id": "6f0c1d2e-…",
  "invoiceRef": "DB-2026-000031",
  "status": "CREATED",
  "url": "https://checkout.stripe.com/c/pay/cs_test_…",
  "amountMinor": 78767686,
  "currency": "huf",
  "stripeSessionId": "cs_test_…",
  "stripePaymentIntent": null,
  "createdAt": "2026-10-05T10:12:03.511Z",
  "updatedAt": "2026-10-05T10:12:04.020Z"
}
```

- The amount is looked up from the **billing system** (`SZAMLA|LEKER`), not passed by the caller.
- Only **pro-forma invoices** (`DB-…`) can be paid online; an already issued invoice (`SZ-…`) returns `422 invalid_invoice_type` (paying it would produce a second invoice).
- A **Stripe Customer** is created with the buyer's billing data (name, address, Hungarian tax number as `hu_tin`) from the billing system (`PARTNER|ADAT`). The same data is also written to the PaymentIntent metadata in the SzámlaBridge format (`buyer_name`, `zip`, `city`, `address`, `country`, `tax_number`, `identifier` = the pro-forma number, `vat: "27"`, `is_unit_price_gross: "true"`, `label`, `quantity`, `unit`, `unit_price`, `comment`). The invoice has a single summary line with the gross total.
- After payment, the customer is redirected to the application's home page (`/?fizetes=sikeres` or `/?fizetes=megszakitva`).

### Retrieve payments

```
GET /api/legacy/payments?id=<uuid>                     → a single payment
GET /api/legacy/payments?invoiceRef=DB-2026-000031     → {"data":[…]} all payments for a document
GET /api/legacy/payments?status=SUCCEEDED&limit=50     → {"data":[…]} list mode, newest first (limit 1–200, default 50)
```

Each payment has a `source`: `STRIPE` (created through Stripe Checkout) or `LEGACY_IMPORT` (migrated from the old system, no Stripe object).

### Reconcile with Stripe

```
GET /api/legacy/payments/reconcile
→ {"systemInstance":"f03a0d14","checked":17,"matched":13,"legacyImport":4,"mismatches":[{"paymentId":"…","invoiceRef":"DB-2026-000049","kind":"status","local":"CREATED","stripe":"EXPIRED"}],"checkedAt":"…"}
```

Compares our records with the Checkout Sessions in Stripe (Stripe is the source of truth for card payments). `kind`: `status`, `amount`, `missing_in_stripe`, `only_in_stripe` (a session tagged with our `systemInstance` metadata that we have no record of). `LEGACY_IMPORT` payments are counted, not compared.

### Payment statuses

| Status | Meaning |
|---|---|
| `CREATED` | link created, not paid yet |
| `SUCCEEDED` | paid (set by the webhook) |
| `FAILED` | the last attempt was declined. The customer may still retry in the same Checkout and succeed. |
| `EXPIRED` | the Checkout Session expired (by default after 24 h) |

## Errors

| HTTP | `type` | When |
|---|---|---|
| 400 | `invalid_request_error` | invalid JSON, missing or malformed `invoiceRef`, missing `id`/`invoiceRef` on GET, `id` is not a UUID |
| 401 | `authentication_error` | missing or invalid bearer token |
| 404 | `not_found` | unknown invoice or payment |
| 409 | `invoice_already_paid` | the invoice is already paid |
| 422 | `invalid_invoice_type` | the document is not a pro-forma invoice (`DB-…`) |
| 422 | `invalid_amount` | amount below Stripe's HUF minimum (175,00 HUF) |
| 503 | `live_mode_disabled` | not in test mode (Stripe key is not `sk_test_…` or `SZAMLABRIDGE_MODE` is not `test`) |
| 502 | `billing_unavailable` / `billing_error` | the billing system could not be reached or returned an error |
| 502 | `stripe_error` | Stripe API error |
| 500 | `api_error` | internal error |

## Webhook

```
POST /api/legacy/payments/webhook
```

- **Signature:** the Stripe signature (`Stripe-Signature` header) is verified against the raw request body with `STRIPE_WEBHOOK_SECRET`. An invalid signature returns `400`.
- **Handled events:**

| Stripe event | Effect |
|---|---|
| `checkout.session.completed` (paid) | payment → `SUCCEEDED`; pro-forma marked paid in billing (`SZAMLA\|FIZETVE`) and linked to the PaymentIntent (`SZAMLA\|KULSO`) so the SzámlaBridge invoice can be fetched later; the order system is notified through its own facade (`POST /api/legacy/orders/payment-received`) → order `LEZART`; event `payment.succeeded` |
| `payment_intent.payment_failed` | payment → `FAILED`; event `payment.failed` |
| `checkout.session.expired` | payment → `EXPIRED`; event `payment.expired` |

- **Other event types** are acknowledged with `200` and ignored.
- **Idempotency:** processing is idempotent; Stripe may redeliver events safely. On a processing error the endpoint returns `500`, and Stripe retries.
- **Matching:** payments are matched through the metadata (`paymentId`, `invoiceRef`) set on both the Checkout Session and the PaymentIntent.

Local development:

```bash
stripe listen --all-snapshot --forward-to localhost:4104/api/legacy/payments/webhook
# or the containerized forwarder: docker compose --profile stripe up -d stripe-cli
```

## Events (`payment_events` queue)

Published to the service's **own** `payment_events` queue (pgmq, in its own database; readable via the `pgmq_public` schema):

```json
{"type":"payment.succeeded","paymentId":"6f0c…","invoiceRef":"DB-2026-000032","amountMinor":2909315,"currency":"huf",
 "stripeEventId":"evt_…","orderNo":100055,"orderNotified":true,"occurredAt":"2026-10-05T10:14:41.002Z"}
{"type":"payment.failed","paymentId":"…","invoiceRef":"SZ-2026-000186","amountMinor":95937324,"currency":"huf",
 "stripeEventId":"evt_…","failureMessage":"Your card was declined.","occurredAt":"…"}
{"type":"payment.expired","paymentId":"…","invoiceRef":"SZ-2026-000187","amountMinor":367695480,"currency":"huf","stripeEventId":"evt_…","occurredAt":"…"}
```

`orderNotified` is `false` if there is no order for the invoice, or if the order's process was not waiting for a payment.
`payment.succeeded` also carries `externalInvoice: {"provider":"szamlabridge","paymentIntent":"pi_…","status":"pending"}` –
SzámlaBridge issues the invoice asynchronously, shortly after the payment; its state and PDF are available through the
billing system (`SZAMLA|KULSO`, `SZAMLA|PDF`).
