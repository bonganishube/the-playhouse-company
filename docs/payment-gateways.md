# Payment gateways

## Position

| Gateway | Purpose | Status |
|---|---|---|
| PayFast | Production candidate (named in RFP) | Implemented, **untested**, no merchant credentials |
| Yoco | Production candidate (named in RFP) | Implemented, **untested**, no merchant credentials |
| Paystack | Production candidate (named in RFP) | Implemented, **untested**, no merchant credentials |
| iKhokha | Production candidate (named in RFP) | Implemented, **untested**, no merchant credentials |
| **Stripe** | **Demonstration and development only** | Implemented, runnable today |
| EFT | Manual capture by the finance team | Working |
| Mock | Local development, no external service | Working, verified |

Switching gateway is a single environment variable (`PAYMENT_GATEWAY`). No code
changes are required.

> **Stripe is not proposed as the production gateway.** The RFP requires
> assistance establishing *state-registered* merchant accounts, with transaction
> fees settled through The Playhouse Company's merchant bank arrangements. That
> points to a local acquirer. Stripe exists here solely so the complete payment
> lifecycle can be demonstrated before those accounts are provisioned. Confirm
> Stripe's current ZAR settlement position for South African entities
> independently before considering it for anything beyond demonstration.

---

## Enabling Stripe for a demonstration

### 1. Get test keys

1. Create a Stripe account and **stay in Test mode** (toggle, top right).
2. Developers → API keys → copy the **secret key** (`sk_test_…`).

No business verification, bank account or onboarding is required for test mode.

### 2. Configure

```bash
PAYMENT_GATEWAY="STRIPE"
STRIPE_SECRET_KEY="sk_test_…"
```

### 3. Webhooks (recommended, not required)

A webhook is the authoritative confirmation. To receive them locally:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/payments/webhook/stripe
```

The command prints a signing secret, put it in `.env`:

```bash
STRIPE_WEBHOOK_SECRET="whsec_…"
```

**If you skip this, bookings still confirm.** When the customer returns from
the payment page the platform queries Stripe directly and applies the result
(`src/lib/payments/stripe.ts` → `reconcile`). The maintenance sweep does the
same for customers who close the tab. This is not a demo shortcut, it is the
production defence against a lost or delayed webhook, and applies to any
gateway that supports transaction lookup.

### 4. Test cards

| Card | Behaviour |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0002` | Declined |
| `4000 0025 0000 3155` | Requires 3-D Secure authentication |

Any future expiry, any CVC, any postcode.

### 5. Suggested demonstration script

1. **Room 503** (R390/hour), hourly booking, instant confirmation, pay in full.
   Shows: timeslot grid → cart hold with countdown → checkout → payment →
   immediate confirmation, tax invoice and calendar invitation.
2. **Opera Theatre** (R27 000/day), whole-day booking, approval workflow,
   50% deposit.
   Shows: date picker rather than timeslots; payment taken but booking held at
   *awaiting approval*; venue manager approves in the admin console; customer
   notified; balance tracked as outstanding.
3. **Attempt a clashing booking** on a slot already taken, including one
   inside the turnaround buffer, to show double-booking prevention.
4. **Admin → Reports**, all six RFP reports, with CSV export.

Note the receipt is a tax invoice: rates are VAT-inclusive, so it states the
amount excluding VAT, the VAT at 15%, and the total.

---

## Production gateway path

Before go-live, for whichever gateway is selected:

1. Obtain sandbox credentials from the provider.
2. Set the credentials and `PAYMENT_GATEWAY`, with `PAYFAST_SANDBOX=true` if
   applicable.
3. Register the webhook endpoint with the provider:
   `https://<host>/api/payments/webhook/<gateway>`
   (`payfast`, `yoco`, `paystack`, `ikhokha`)
4. Run a full transaction and confirm in Admin → Payments that the callback was
   received **and verified**, an unverified callback never confirms a booking.
5. Test the failure paths: declined card, abandoned payment, and a replayed
   callback (must be idempotent).
6. Switch to live credentials only once all of the above pass.

### What still needs verification per gateway

Each adapter is written to the provider's documented contract, but no signature
has been checked against a live service. Specifically:

- **PayFast**. MD5 signature field ordering and encoding; ITN source-IP
  validation; the server-side validation post-back.
- **Yoco**. Standard Webhooks signature (`whsec_` secret, base64-decoded).
- **Paystack**. HMAC-SHA512 of the raw body under the secret key.
- **iKhokha**. `IK-SIGN` HMAC-SHA256 over request path concatenated with the
  exact JSON body.

Signature verification is where payment integrations fail. Budget sandbox time
for each.

---

## Notes

- Gateway transaction fees are for The Playhouse Company's account and settle
  through its merchant bank arrangements, the platform records gross amounts
  and does not deduct fees.
- Every gateway interaction, verified or not, is written to `payment_events`
  with the raw payload retained, forming the secure audit trail.
- Refunds are **not yet implemented**, cancellations and rejections currently
  require a manual refund through the merchant portal.
