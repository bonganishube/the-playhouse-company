# Going live

Run `pnpm preflight` at any point. It checks the actual configuration and
database rather than this document, and exits non-zero while anything blocking
remains. A green run is the definition of ready.

The application refuses to start in production while any blocker is present.
That is deliberate: a warning in a log is how a platform ends up live taking
simulated payments. Set `ALLOW_UNSAFE_PRODUCTION=true` only for a staging
deployment that takes no real bookings.

---

## 1. Scheduled maintenance

`vercel.json` runs `/api/maintenance/sweep` every five minutes. That job:

- releases expired cart holds, so an abandoned cart stops blocking a venue
- retries failed email, up to five attempts before a message is abandoned
- reconciles payments whose webhook never arrived
- purges spent password reset tokens
- pushes confirmed bookings to Outlook, once that is configured

**Vercel plan matters.** Minute-level schedules need Pro. On Hobby, cron runs
once a day, which is too slow for cart holds: change the schedule to
`0 * * * *` at minimum, or run the sweep from an external scheduler instead.
Any scheduler works, it is one authenticated HTTP request:

```bash
curl -X POST https://<your-domain>/api/maintenance/sweep \
  -H "Authorization: Bearer $CRON_SECRET"
```

Vercel Cron sends that header automatically when `CRON_SECRET` is set as a
project environment variable. The endpoint refuses every request without it.

The sweep took 166 seconds against a database in `us-east-1`, so
`maxDuration` is set to 300. Hobby caps functions at 60 seconds, which is
another reason that plan does not suit this job.

---

## 2. Secrets

`AUTH_SECRET` and `CRON_SECRET` have been rotated to random 48 and 32 byte
values. Two remain, and both need doing in the provider's own console:

### Neon database password

The current password appeared in a chat transcript, so treat it as public.

1. Neon console, your project, **Roles**
2. Reset the password for `neondb_owner`
3. Update **both** `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL`
   (unpooled) here and in the Vercel project settings

### Brevo SMTP key

1. Brevo, **SMTP & API → SMTP**
2. Generate a new key, update `SMTP_PASSWORD`, delete the old one

### Seeded accounts

The seed prints its passwords to the console, so every one of them is public.
Change all five before go-live, or delete the demonstration accounts. Preflight
checks these by actually attempting the seed password, so it will tell you
which are still open.

---

## 3. Email

### Stop diverting

`MAIL_REDIRECT_TO` sends every message to one address instead of the customer.
Correct while testing, fatal at launch. Clearing it is what turns delivery on;
until then messages are recorded as `PREVIEW`, never `SENT`, so the console
never claims a customer received something they did not.

### Verify the domain, not the address

Brevo's authorised-IP feature blocked sending when the office IP changed, and
home and office addresses move. Verifying the sending **domain** removes that
dependency and materially improves deliverability, because messages are then
signed rather than merely accepted.

In Brevo, **Senders, Domains & Dedicated IPs → Domains**, add the domain and
publish the DNS records it gives you. There are three, and all three matter:

| Record | Purpose |
| --- | --- |
| DKIM (`TXT`) | signs each message, so recipients can prove it is genuinely from you |
| DMARC (`TXT`) | tells recipients what to do with mail that fails those checks |
| Brevo verification (`TXT`) | proves you control the domain |

Add SPF as well if the domain does not already publish one. Propagation is
usually minutes but can take a day.

Sending from `bookings@playhousecompany.com` rather than a personal address is
the eventual goal: it is the address customers already write to, and a
confirmation arriving from somewhere else invites suspicion.

---

## 4. Payments

`PAYMENT_GATEWAY="MOCK"` confirms bookings without taking money. Preflight
treats that as a blocker, as it does Stripe, which is the demonstration route
rather than part of the tender's integration path.

The four providers named in the tender are implemented but **have never
exchanged a request with a live service**. Signature formats are where these
integrations usually fail, so each needs a sandbox account and a real
transaction before it is trusted. For each provider:

1. Obtain sandbox credentials and set them in `.env`
2. Set `PAYMENT_GATEWAY` to that provider
3. Take a test booking end to end and confirm the webhook arrives and verifies
4. Confirm a refund works, since a rejected booking now issues one
   automatically

Only PayFast requires a signed form POST; the rest return a hosted checkout
URL. Webhook endpoints are already routed at
`/api/payments/webhook/<gateway>`.

---

## 5. Vercel environment variables

Set these in the project, not in `.env`, which is git-ignored and never
deployed:

| Variable | Note |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** endpoint |
| `DIRECT_DATABASE_URL` | Neon **unpooled**, for migrations |
| `AUTH_SECRET` | the rotated value |
| `CRON_SECRET` | the rotated value; Vercel Cron uses it automatically |
| `APP_URL` | the real domain, since payment returns are built from it |
| `SMTP_*`, `MAIL_FROM` | Brevo credentials |
| `VAT_REGISTRATION_NUMBER` | required on a valid tax invoice |
| gateway credentials | for whichever provider goes live |

Do **not** set `MAIL_REDIRECT_TO` in production.

Migrations are not run by the build. After deploying a schema change:

```bash
pnpm exec prisma migrate deploy
```

---

## 6. Still outstanding elsewhere

Not configuration, but blocking in their own right:

- **Conditions of hire** are a draft with 10 points awaiting The Playhouse
  Company's confirmation, yet customers are asked to accept them at checkout
- **10 of 14 venue descriptions** are placeholders, and capacities are missing
  for Rooms 506, 507, 508 and Studio 3
- **Operating hours were inferred, not supplied.** Bookings are being validated
  against hours nobody has confirmed
