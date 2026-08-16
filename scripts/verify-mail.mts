/**
 * Verifies the confirmation delivery workflow.
 *
 * Each phase runs in its own process because the environment is parsed once at
 * start-up, exactly as in production: changing mail settings takes a restart.
 * State is carried between phases through the email log itself.
 *
 *   none         no mail server: recorded, honestly marked NOT_CONFIGURED
 *   unreachable  server down: queued, retried, finally abandoned to FAILED
 *   live         server available: delivered, and the earlier backlog goes out
 *
 * Run:  pnpm verify:mail
 */
import path from "node:path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* environment may be injected directly */
}

const phase = process.argv[2] as "none" | "live" | "unreachable";
const TO = "mailtest@example.co.za";
const results: string[] = [];
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  results.push(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) fail++;
};

const { prisma } = await import("../src/lib/prisma");
const { sendMail, retryQueuedEmails, MAX_DELIVERY_ATTEMPTS } = await import(
  "../src/lib/email/mailer"
);

const base = {
  to: TO,
  html: "<p>delivery workflow test</p>",
  text: "delivery workflow test",
  template: "booking-confirmed",
};

if (phase === "none") {
  // The retry sweep is global by design, so the log must start empty or
  // unrelated queued messages would be swept up with the test's own.
  await prisma.emailLog.deleteMany({});
  console.log("1. No mail server configured");
  const r = await sendMail({ ...base, subject: "Backlog message" });
  check("recorded, not reported as sent", r.status === "NOT_CONFIGURED", r.status);
  const stored = await prisma.emailLog.findUniqueOrThrow({ where: { id: r.logId } });
  check("rendered message retained as evidence", stored.html.includes("delivery workflow test"));
}

if (phase === "unreachable") {
  console.log("3. Mail server unreachable");
  const r = await sendMail({ ...base, subject: "Unreachable message" });
  check("queued for retry rather than lost", r.status === "QUEUED", r.status);
  for (let i = 0; i <= MAX_DELIVERY_ATTEMPTS; i++) await retryQueuedEmails();
  const done = await prisma.emailLog.findUniqueOrThrow({ where: { id: r.logId } });
  check("abandoned to FAILED once retries are spent", done.status === "FAILED", done.status);
  check("failure reason recorded", Boolean(done.error));
  await prisma.emailLog.deleteMany({ where: { to: TO } });
}

if (phase === "live") {
  const { SMTPServer } = await import("smtp-server");
  const received: string[] = [];
  const server = new SMTPServer({
    authOptional: true,
    hideSTARTTLS: true,
    onData(stream, _s, cb) {
      let raw = "";
      stream.on("data", (c) => (raw += c));
      stream.on("end", () => { received.push(raw); cb(); });
    },
  });
  await new Promise<void>((r) => server.listen(2525, "127.0.0.1", r));

  console.log("2. Mail server available");
  const r = await sendMail({ ...base, subject: "Live message" });
  check("delivered when the server accepts", r.status === "SENT", r.status);

  const backlog = await retryQueuedEmails();
  check(
    `backlog re-attempted by the sweep (${backlog.sent}/${backlog.attempted} sent)`,
    backlog.sent >= 1,
  );
  const revived = await prisma.emailLog.findFirst({ where: { to: TO, subject: "Backlog message" } });
  check("message recorded while SMTP was absent is now SENT", revived?.status === "SENT", revived?.status);
  check(`mail server actually received ${received.length} message(s)`, received.length >= 2);

  await new Promise<void>((r) => server.close(() => r()));
}

console.log(results.join("\n"));
await prisma.$disconnect();
if (fail) process.exitCode = 1;
