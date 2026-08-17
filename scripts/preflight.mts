/**
 * Go-live checklist.
 *
 * One command that answers "can this take real bookings yet?". Everything it
 * reports is checked against the actual configuration and database rather than
 * a document that drifts, so a green run means something.
 *
 * Exits non-zero when anything blocking is outstanding, which makes it usable
 * as a deployment gate.
 *
 * Run:  pnpm preflight
 */
import path from "node:path";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* platform-injected environment */
}

const { env, productionReadinessProblems, mailDeliversToRecipients } = await import(
  "../src/lib/env"
);
const { prisma } = await import("../src/lib/prisma");
const { PRODUCTION_GATEWAYS, gatewayCatalogue } = await import("../src/lib/payments");
const { TERMS_ARE_DRAFT, CURRENT_TERMS_VERSION, outstandingDecisions } = await import(
  "../src/lib/terms"
);

type Severity = "blocker" | "warning" | "ok";
const findings: { severity: Severity; area: string; message: string }[] = [];

const add = (severity: Severity, area: string, message: string) =>
  findings.push({ severity, area, message });

console.log("\nThe Playhouse Company, go-live preflight");
console.log("═".repeat(56));

// ---------------------------------------------------------------- environment
for (const problem of productionReadinessProblems()) {
  add("blocker", problem.setting, problem.detail);
}

// --------------------------------------------------------------------- secrets
// Length is the honest measure here. A long random secret and a long
// memorable phrase are both fine; a short one is not, whatever it contains.
if (env.AUTH_SECRET.length < 48 && !env.AUTH_SECRET.includes("dev-only")) {
  add(
    "warning",
    "AUTH_SECRET",
    `${env.AUTH_SECRET.length} characters. 64 or more is the sensible floor for a signing key.`,
  );
}

// ------------------------------------------------------------------ scheduling
// The sweep releases expired holds, retries failed email and reconciles lost
// webhooks. Without a scheduler none of that happens.
const fs = await import("node:fs/promises");
let cronConfigured = false;
try {
  const vercel = JSON.parse(await fs.readFile("vercel.json", "utf8"));
  cronConfigured = Array.isArray(vercel.crons) && vercel.crons.length > 0;
  if (cronConfigured) {
    const paths = vercel.crons.map((c: { path: string; schedule: string }) =>
      `${c.path} (${c.schedule})`,
    );
    add("ok", "Scheduler", `vercel.json defines ${paths.join(", ")}`);
  }
} catch {
  /* no vercel.json */
}
if (!cronConfigured) {
  add(
    "blocker",
    "Scheduler",
    "nothing runs /api/maintenance/sweep. Expired holds are never released, " +
      "failed email is never retried and lost webhooks are never reconciled.",
  );
}

// ----------------------------------------------------------------------- email
if (!mailDeliversToRecipients()) {
  add(
    "blocker",
    "Email",
    "messages do not reach real recipients with the current transport settings.",
  );
}

const undelivered = await prisma.emailLog.count({
  where: { status: { in: ["NOT_CONFIGURED", "QUEUED"] } },
});
if (undelivered > 0) {
  add(
    "warning",
    "Email backlog",
    `${undelivered} message${undelivered === 1 ? "" : "s"} undelivered. The next sweep ` +
      `will attempt all of them, which is worth reviewing before it happens.`,
  );
}

const failed = await prisma.emailLog.count({ where: { status: "FAILED" } });
if (failed > 0) {
  add("warning", "Email", `${failed} message(s) exhausted their retries and need a human.`);
}

// -------------------------------------------------------------------- payments
const live = gatewayCatalogue().filter((g) => g.available && PRODUCTION_GATEWAYS.includes(g.id));
if (live.length === 0) {
  add(
    "blocker",
    "Payments",
    "none of PayFast, Yoco, Paystack or iKhokha is configured and active, so no " +
      "real payment can be taken.",
  );
} else {
  add("ok", "Payments", `${live.map((g) => g.name).join(", ")} configured and active.`);
}

// ----------------------------------------------------------------------- terms
if (TERMS_ARE_DRAFT) {
  const decisions = outstandingDecisions().length;
  add(
    "blocker",
    "Conditions of hire",
    `version ${CURRENT_TERMS_VERSION} is still a draft with ${decisions} point(s) ` +
      `awaiting The Playhouse Company's confirmation, yet customers are asked to accept it.`,
  );
}

// ------------------------------------------------------------------- catalogue
const venues = await prisma.venue.findMany({
  where: { isActive: true },
  select: { name: true, description: true, capacity: true },
});
const pending = venues.filter((v) => /to be confirmed/i.test(v.description));
if (pending.length > 0) {
  add(
    "warning",
    "Venue copy",
    `${pending.length} of ${venues.length} descriptions are placeholders: ${pending
      .map((v) => v.name)
      .join(", ")}.`,
  );
}
const noCapacity = venues.filter((v) => v.capacity == null);
if (noCapacity.length > 0) {
  add(
    "warning",
    "Venue capacity",
    `missing for ${noCapacity.map((v) => v.name).join(", ")}.`,
  );
}

// ------------------------------------------------------------------- accounts
// The seed publishes these passwords in the console and the documentation, so
// any that still work are effectively public.
const SEEDED = [
  "admin@playhousecompany.com",
  "venues@playhousecompany.com",
  "finance@playhousecompany.com",
  "frontdesk@playhousecompany.com",
  "customer@example.co.za",
];
const { verifyPassword } = await import("../src/lib/auth");
const SEED_PASSWORDS: Record<string, string> = {
  "admin@playhousecompany.com": "Playhouse#Admin1",
  "venues@playhousecompany.com": "Playhouse#Venue1",
  "finance@playhousecompany.com": "Playhouse#Finance1",
  "frontdesk@playhousecompany.com": "Playhouse#Staff1",
  "customer@example.co.za": "Customer#1234",
};
const stillSeeded: string[] = [];
for (const email of SEEDED) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) continue;
  if (await verifyPassword(SEED_PASSWORDS[email]!, user.passwordHash)) {
    stillSeeded.push(email);
  }
}
if (stillSeeded.length > 0) {
  add(
    "blocker",
    "Seeded passwords",
    `${stillSeeded.join(", ")} still use the published seed password.`,
  );
}

// ------------------------------------------------------------------ reporting
const order: Severity[] = ["blocker", "warning", "ok"];
const label: Record<Severity, string> = {
  blocker: "BLOCKER",
  warning: "warning",
  ok: "ok",
};

for (const severity of order) {
  const group = findings.filter((f) => f.severity === severity);
  if (group.length === 0) continue;
  console.log(`\n${label[severity]}`);
  console.log("─".repeat(56));
  for (const f of group) {
    console.log(`  ${f.area}`);
    console.log(`    ${f.message}`);
  }
}

const blockers = findings.filter((f) => f.severity === "blocker").length;
const warnings = findings.filter((f) => f.severity === "warning").length;

console.log(`\n${"═".repeat(56)}`);
if (blockers === 0) {
  console.log(`Ready to take real bookings. ${warnings} warning(s) to review.\n`);
} else {
  console.log(
    `NOT ready: ${blockers} blocker(s), ${warnings} warning(s).\n` +
      `Each blocker would cause real harm in production, not merely untidiness.\n`,
  );
}

await prisma.$disconnect();
process.exit(blockers > 0 ? 1 : 0);
