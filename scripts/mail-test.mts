/**
 * Checks the mail configuration and sends a test message.
 *
 * Run this after setting SMTP credentials, before trusting that customers are
 * receiving confirmations. It reports the connection and authentication result
 * separately from the send, because they fail for different reasons and the
 * distinction tells you which setting is wrong.
 *
 * Run:  pnpm mail:test someone@example.com
 */
import path from "node:path";
import nodemailer from "nodemailer";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* environment may be injected directly */
}

const to = process.argv[2];
if (!to) {
  console.error("Usage: pnpm mail:test <recipient@example.com>");
  process.exit(1);
}

const host = process.env.SMTP_HOST ?? "";
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER ?? "";
const pass = process.env.SMTP_PASSWORD ?? "";
const from = process.env.MAIL_FROM ?? "";

console.log("\nMail configuration");
console.log(`  host      ${host || "(not set)"}`);
console.log(`  port      ${port}${port === 465 ? "  implicit TLS" : "  STARTTLS"}`);
console.log(`  username  ${user || "(none, unauthenticated)"}`);
console.log(`  password  ${pass ? "set" : "(not set)"}`);
console.log(`  from      ${from}`);

if (!host) {
  console.error(
    "\nSMTP_HOST is empty. Confirmations are being recorded but not delivered.\n" +
      "Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD in .env, then run this again.\n",
  );
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: user ? { user, pass } : undefined,
});

// Connection and credentials, checked before attempting a send.
console.log("\nChecking connection and credentials…");
try {
  await transport.verify();
  console.log("  ✓ the mail server accepted the connection and credentials");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`  ✗ ${message}\n`);
  console.error(hint(message));
  process.exit(1);
}

console.log(`\nSending a test message to ${to}…`);
try {
  const info = await transport.sendMail({
    from,
    to,
    subject: "Test message from the Playhouse booking platform",
    text:
      "This is a test message.\n\n" +
      "If you are reading it, booking confirmations and tax invoices will reach customers.",
    html:
      "<p>This is a test message.</p>" +
      "<p>If you are reading it, booking confirmations and tax invoices will reach customers.</p>",
  });
  console.log(`  ✓ accepted for delivery (id ${info.messageId})`);
  console.log(
    "\nMail is working. Any confirmations recorded while SMTP was unset will be\n" +
      "delivered on the next run of /api/maintenance/sweep.\n",
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`  ✗ ${message}\n`);
  console.error(hint(message));
  process.exit(1);
}

/**
 * Map a failure to the setting that actually causes it.
 *
 * Ordered most specific first. Generic SMTP codes such as 5.7.x appear in many
 * different failures, so matching on them early would mask the real cause.
 */
function hint(message: string): string {
  const m = message.toLowerCase();
  const brevo = host.includes("brevo");
  const senderAddress = from.replace(/.*<|>.*/g, "").trim();

  // Nothing to authenticate with, whatever the server said.
  if (!user || !pass) {
    return (
      "  SMTP_USER and SMTP_PASSWORD are empty, so the server refused the message.\n" +
      (brevo
        ? "  In Brevo, open SMTP & API -> SMTP. Copy the Login it shows (often\n" +
          "  xxxxxx001@smtp-brevo.com) into SMTP_USER, and generate an SMTP key for\n" +
          "  SMTP_PASSWORD. The SMTP key is not your Brevo account password."
        : "  Set both in .env, then run this again.")
    );
  }

  if (m.includes("not verified") || m.includes("sender you used") || m.includes("unrecognized sender")) {
    return (
      "  The provider does not recognise the sender address.\n" +
      `  Verify ${senderAddress} with the provider first` +
      (brevo ? " (Brevo -> Senders, Domains & Dedicated IPs -> Senders)." : ".") +
      "\n  Until a domain is verified, use an address you control as MAIL_FROM."
    );
  }

  if (m.includes("535") || m.includes("invalid login") || m.includes("unrecognized authentication")) {
    return brevo
      ? "  Brevo rejected the credentials.\n" +
        "  SMTP_USER is the Login under SMTP & API, and SMTP_PASSWORD is an SMTP key,\n" +
        "  not your account password. Keys can be regenerated on that page."
      : "  Credentials were rejected.\n" +
        "  On Microsoft 365 this usually means SMTP AUTH is disabled on the mailbox,\n" +
        "  or the account has MFA and needs an app password. See docs/email-setup.md.";
  }

  if (m.includes("econnrefused") || m.includes("enotfound") || m.includes("timeout")) {
    return (
      "  Host or port is wrong, or outbound SMTP is blocked by a firewall.\n" +
      "  Port 587 is STARTTLS, 465 is implicit TLS. Many networks block 25."
    );
  }

  if (m.includes("self signed") || m.includes("certificate")) {
    return (
      "  TLS certificate could not be verified. Check the host name matches the\n" +
      "  certificate; do not disable verification on a production system."
    );
  }

  if (m.includes("authenticate") || m.includes("5.7.")) {
    return (
      "  The server wants authentication it did not receive or accept.\n" +
      "  Check SMTP_USER and SMTP_PASSWORD, and that the account is permitted to\n" +
      `  send as ${senderAddress}.`
    );
  }

  return "  See docs/email-setup.md for the common causes.";
}
