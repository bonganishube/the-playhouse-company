# Sending email

Booking confirmations, tax invoices and approval notices are generated
automatically. Until a mail server is configured they are **recorded but not
delivered** — visible in the admin console under a booking's *Correspondence*
panel, marked "Not delivered".

Nothing is lost in the meantime. Once credentials are set, the backlog is
delivered on the next run of `/api/maintenance/sweep`.

---

## First, a clarification

The `smtp-server` package in `devDependencies` is a **test tool**. It receives
mail locally so the retry logic can be proven without a real provider. It is
never deployed and plays no part in sending. You need an account with a mail
provider, not a server of your own.

---

## Right now: a free preview inbox, no account needed

The platform is currently set to `MAIL_TRANSPORT="ethereal"`. Messages are
actually sent, to a throwaway inbox that costs nothing and requires no signup.
Each one is readable at a link, but **it never reaches the real recipient** —
which is what makes it safe to run against live booking data before go-live.

These are recorded as `PREVIEW`, never `SENT`, so nobody reviewing the console
can mistake them for messages a customer received.

Two ways to read a message, both in Admin → Bookings → *Correspondence*:

- **View message** renders the stored copy inside the console. Works with any
  transport, including none, and is the way to get the copy approved.
- **Open in preview inbox** opens it on Ethereal, complete with attachments,
  which is the closest thing to seeing it as a customer would.

The inbox is pinned via `ETHEREAL_USER` / `ETHEREAL_PASSWORD` so everything
lands in one place across restarts. Leave them blank and a fresh inbox is
provisioned on first send, with the credentials printed to the console.

When it is time to go live, set `MAIL_TRANSPORT="auto"` and the SMTP values
below. Anything still undelivered is sent on the next maintenance sweep.

---

## Getting a confirmation into your own inbox

Ethereal proves the mail works, but it never leaves a test inbox. To receive
one for real you need SMTP credentials, and only you can create those. Two
routes, quickest first.

### Quickest: a Gmail app password

Free, works in minutes, and uses an account you already have. It needs
two-factor authentication switched on, because Google only issues app
passwords to protected accounts.

1. Turn on 2-Step Verification at
   [myaccount.google.com/security](https://myaccount.google.com/security)
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   and create one named "Playhouse bookings"
3. Copy the 16-character password and set:

```bash
MAIL_TRANSPORT="auto"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="you@gmail.com"
SMTP_PASSWORD="<the 16-character app password>"
MAIL_FROM="The Playhouse Company <you@gmail.com>"

# Divert everything to you while testing.
MAIL_REDIRECT_TO="you@gmail.com"
```

`MAIL_FROM` must be the same address as `SMTP_USER`; Gmail rewrites or rejects
anything else. Limit is around 500 messages a day, far beyond testing needs.

### If bongani@tankit.co.za is Google Workspace or Microsoft 365

Use that mailbox instead, so messages come from your own domain. Google
Workspace follows the steps above. Microsoft 365 needs SMTP AUTH enabled on
the mailbox first — see Option A below, and note it is an administrator
setting, not something you can switch on from the mailbox itself.

### Brevo (currently pre-configured)

300 messages a day free, and `.env` is already filled in apart from the two
credentials.

1. Sign up at [brevo.com](https://www.brevo.com) and confirm the address
2. **Senders, Domains & Dedicated IPs → Senders** — add and verify the address
   you want mail to come from. Brevo will not send from an unverified sender,
   and this is the step people skip
3. **SMTP & API → SMTP** — note the **Login** (often
   `xxxxxx001@smtp-brevo.com`) and generate an **SMTP key**

Then in `.env`:

```bash
MAIL_TRANSPORT="auto"                      # switch from "ethereal"
SMTP_USER="xxxxxx001@smtp-brevo.com"       # the Login, not your email
SMTP_PASSWORD="<the SMTP key>"             # not your account password
MAIL_FROM="The Playhouse Company <the.verified@address>"
MAIL_REDIRECT_TO="bongani@tankit.co.za"    # divert everything to you
```

`SMTP_HOST` and `SMTP_PORT` are already set to `smtp-relay.brevo.com` and
`587`, and that route is confirmed reachable.

Two things Brevo trips people on:

- The **SMTP key is not the account password**. They are different credentials
  on different pages.
- `MAIL_FROM` must be a **verified sender**. Until `playhousecompany.com` is
  verified as a domain, use an address you control.

New accounts are sometimes held for review before transactional sending is
enabled. If the login is accepted but messages are refused, that is usually
why, and Brevo support clears it quickly.

Then:

```bash
pnpm mail:test bongani@tankit.co.za
```

### Then check it

```bash
pnpm mail:test bongani@tankit.co.za
```

If that lands, make a booking and the confirmation follows.

### Why MAIL_REDIRECT_TO matters

With real credentials the platform can genuinely email people. Every booking in
the database has a contact address, and a stray sweep would mail all of them.
Setting `MAIL_REDIRECT_TO` diverts every message to you instead, keeping the
true recipient in the log and stating it at the top of what you receive:

> Intended for customer@example.co.za. Diverted here because MAIL_REDIRECT_TO
> is set.

These stay recorded as `PREVIEW`, not `SENT`, because the customer still did
not receive them. **Clear this setting before go-live.**

---

## What to set for production

Four values in the environment:

```bash
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="bookings@playhousecompany.com"
SMTP_PASSWORD="…"
MAIL_FROM="The Playhouse Company <bookings@playhousecompany.com>"
```

Port **587** is STARTTLS and is what almost every provider wants. Port **465**
is implicit TLS and is also supported. Port 25 is blocked on most networks and
should not be used.

Then check it before trusting it:

```bash
pnpm mail:test someone@yourdomain.com
```

That verifies the connection and credentials separately from the send, because
they fail for different reasons, and tells you which setting is at fault.

---

## Choosing a provider

### Option A — Microsoft 365 (most likely, given the Outlook requirement)

The RFP already requires Microsoft Outlook integration, so The Playhouse
Company has Microsoft 365 and `bookings@playhousecompany.com` most likely lives
there. Sending from that mailbox keeps confirmations aligned with the address
customers already write to.

```bash
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="bookings@playhousecompany.com"
SMTP_PASSWORD="<app password>"
```

**The complication, stated plainly:** Microsoft disables SMTP AUTH by default
and is progressively retiring basic authentication. To use this route the IT
department has to:

1. Enable **SMTP AUTH** on that specific mailbox
   (Microsoft 365 admin centre → Users → Mail → Manage email apps →
   *Authenticated SMTP*), and
2. Provide an **app password**, because a mailbox with MFA will otherwise
   reject the login, or exclude the account from the Conditional Access policy
   that enforces MFA.

Neither is difficult, but both are decisions their security team should make
rather than have imposed. If they decline, use Option B or C.

Sending limits are around 30 messages per minute and 10 000 recipients per day
— far beyond venue-booking volumes.

### Option B — A transactional email service

Purpose-built for this, and the usual choice when a mailbox route is awkward.
Better deliverability reporting, bounce handling and no interaction with the
organisation's mail security posture.

| Provider | Host | Notes |
|---|---|---|
| Brevo | `smtp-relay.brevo.com` | Free tier covers booking volumes |
| Mailgun | `smtp.mailgun.org` | EU region available |
| SendGrid | `smtp.sendgrid.net` | Username is literally `apikey` |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | Cheapest at volume; `af-south-1` is Cape Town |

For a South African public entity, SES in `af-south-1` keeps mail data in
region, which may matter for POPIA data-residency questions. Worth raising
with their information officer rather than assuming.

### Option C — The Playhouse Company's own relay

If IT already runs an internal relay, point at it. These often accept
unauthenticated mail from known internal hosts:

```bash
SMTP_HOST="mail.playhousecompany.local"
SMTP_PORT="25"
SMTP_USER=""          # leave blank for an unauthenticated relay
SMTP_PASSWORD=""
```

The application server's IP must be permitted to relay.

---

## DNS: the part that decides whether mail arrives

Credentials get mail *sent*. These records decide whether it lands in the inbox
rather than the spam folder. The RFP already anticipates this, naming SPF and
DKIM as work for The Playhouse Company's IT department.

**SPF** — one record for the domain, listing everything allowed to send as it:

```
playhousecompany.com.  TXT  "v=spf1 include:spf.protection.outlook.com ~all"
```

Add the provider's include if using Option B, for example
`include:sendgrid.net`. There must be exactly **one** SPF record; a second one
invalidates both.

**DKIM** — the provider issues the keys and the CNAME records to publish. With
Microsoft 365 these are `selector1._domainkey` and `selector2._domainkey`.

**DMARC** — tells receivers what to do when SPF or DKIM fails, and where to
send reports. Start permissive and tighten once the reports are clean:

```
_dmarc.playhousecompany.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@playhousecompany.com"
```

Moving to `p=quarantine` and then `p=reject` should wait until the reports show
no legitimate mail failing.

---

## A better route worth considering

The platform already needs a Microsoft Entra ID app registration for Outlook
calendar synchronisation. Adding the **`Mail.Send`** application permission to
that same registration would let confirmations go out through the Microsoft
Graph API instead of SMTP.

That avoids the SMTP AUTH problem in Option A entirely: no basic
authentication, no app password, no mailbox-level setting, and it uses the
certificate or secret already being provisioned for calendars.

It is a contained change — a second transport alongside the SMTP one, selected
by configuration. Say the word if you want it built.

---

## Checklist

- [ ] Provider chosen and mailbox or API credentials issued
- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` set
- [ ] `pnpm mail:test <address>` reports both checks passing
- [ ] SPF record published, and only one exists
- [ ] DKIM CNAMEs published and the provider reports them valid
- [ ] DMARC record published at `p=none`
- [ ] A real booking made and the confirmation received in an ordinary inbox
- [ ] `/api/maintenance/sweep` scheduled, so the backlog and any future
      failures are retried

## If something goes wrong

`pnpm mail:test` names the likely cause. The recurring ones:

| Symptom | Usual cause |
|---|---|
| `ECONNREFUSED` / timeout | Wrong port, or outbound SMTP blocked by firewall |
| `Invalid login` / `5.7.x` | SMTP AUTH disabled on the mailbox, or MFA needs an app password |
| Sender rejected | `MAIL_FROM` does not match the authenticated mailbox |
| Sends, but lands in spam | SPF, DKIM or DMARC missing or misconfigured |

Delivery state for every message is in the admin console under each booking's
*Correspondence* panel, with a Resend button. Failures are retried five times
before being marked `FAILED`.
