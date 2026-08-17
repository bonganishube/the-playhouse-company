import { z } from "zod";

/**
 * Environment configuration.
 *
 * Only DATABASE_URL and AUTH_SECRET are strictly required, every integration
 * (payment gateways, Microsoft Graph, SMTP) degrades to a safe local mode when
 * its credentials are absent, so the platform is runnable before The Playhouse
 * Company's merchant and tenant accounts are provisioned.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  CART_HOLD_MINUTES: z.coerce.number().int().positive().default(20),

  /**
   * Statutory VAT rate. The published tariff is VAT-INCLUSIVE, so this is used
   * to extract the VAT portion for the tax invoice, never to add to a price.
   */
  VAT_RATE: z.coerce.number().min(0).max(100).default(15),
  /** Shown on tax invoices. Required by SARS for a valid tax invoice. */
  VAT_REGISTRATION_NUMBER: z.string().default(""),

  PAYMENT_GATEWAY: z
    .enum(["PAYFAST", "YOCO", "PAYSTACK", "IKHOKHA", "STRIPE", "MOCK"])
    .default("MOCK"),

  PAYFAST_MERCHANT_ID: z.string().default(""),
  PAYFAST_MERCHANT_KEY: z.string().default(""),
  PAYFAST_PASSPHRASE: z.string().default(""),
  PAYFAST_SANDBOX: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),

  YOCO_SECRET_KEY: z.string().default(""),
  YOCO_WEBHOOK_SECRET: z.string().default(""),

  PAYSTACK_SECRET_KEY: z.string().default(""),

  IKHOKHA_APP_ID: z.string().default(""),
  IKHOKHA_APP_SECRET: z.string().default(""),

  // Demonstration gateway, see src/lib/payments/stripe.ts.
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),

  MS_TENANT_ID: z.string().default(""),
  MS_CLIENT_ID: z.string().default(""),
  MS_CLIENT_SECRET: z.string().default(""),
  OUTLOOK_SYNC_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  /**
   * How outbound mail is delivered.
   *
   *   auto      SMTP when SMTP_HOST is set, otherwise recorded only
   *   ethereal  a throwaway preview inbox, requiring no account. Messages are
   *             readable at a link but never reach the real recipient, which
   *             is what makes it safe before go-live
   *   none      recorded only, never delivered
   */
  MAIL_TRANSPORT: z.enum(["auto", "ethereal", "none"]).default("auto"),
  /** Pin a preview inbox so messages persist across restarts. Optional. */
  ETHEREAL_USER: z.string().default(""),
  ETHEREAL_PASSWORD: z.string().default(""),

  /**
   * Divert every outbound message to this address instead of the real
   * recipient. Set it while testing against real credentials so a live
   * confirmation cannot reach an actual customer by accident. Leave empty in
   * production.
   */
  MAIL_REDIRECT_TO: z.string().default(""),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  MAIL_FROM: z
    .string()
    .default("The Playhouse Company <bookings@playhousecompany.com>"),

  EMBED_ALLOWED_ORIGINS: z.string().default(""),
  CRON_SECRET: z.string().default(""),
});

/**
 * Placeholders used only while compiling.
 *
 * Long enough and shaped correctly to satisfy the schema, and obviously not
 * real, so if one ever reached a running server it would be recognisable in a
 * log rather than mistaken for a configured value.
 */
const BUILD_PLACEHOLDERS: Record<string, string> = {
  AUTH_SECRET: "build-time-placeholder-not-a-real-secret-do-not-use-at-runtime",
  DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/build",
};

/**
 * Read and validate the environment.
 *
 * Strict at runtime, deliberately tolerant while building. Next evaluates
 * every route module when it collects page data, and does so on a build
 * machine where the runtime secrets are absent by design: they belong to the
 * deployment, not the artefact. Throwing there failed the build over settings
 * that were perfectly well configured on the platform, and would have pushed
 * anyone towards the genuinely dangerous fix of committing secrets so the
 * build could see them.
 *
 * Nothing is signed, sent or queried during a build, so a placeholder is safe.
 * A missing value still fails loudly the moment the server actually starts,
 * and assertProductionReady() checks the rest.
 */
function load() {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const building = process.env.NEXT_PHASE === "phase-production-build";
  if (building) {
    const missing = parsed.error.issues.map((i) => String(i.path[0]));
    const filled = { ...process.env } as Record<string, string | undefined>;
    for (const key of missing) {
      if (BUILD_PLACEHOLDERS[key]) filled[key] = BUILD_PLACEHOLDERS[key];
    }

    const retry = schema.safeParse(filled);
    if (retry.success) {
      // Next compiles with several workers, each its own process, and each
      // would otherwise repeat this. Once per process is enough to notice.
      const flag = "__phcBuildEnvWarned";
      const g = globalThis as unknown as Record<string, boolean>;
      if (!g[flag]) g[flag] = true;
      else return retry.data;

      console.warn(
        `[env] building without ${missing.join(", ")}. Placeholders are in use for ` +
          `compilation only. Set these on the deployment platform, or the server ` +
          `will refuse to start.`,
      );
      return retry.data;
    }
  }

  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\n` +
      `Set these in the environment. On Vercel that is Project Settings -> ` +
      `Environment Variables; see docs/going-live.md for the full list.`,
  );
}

export const env = load();

/** True when a build-time placeholder is standing in for a real value. */
export function usingBuildPlaceholders(): boolean {
  return Object.values(BUILD_PLACEHOLDERS).includes(env.AUTH_SECRET);
}

/**
 * Settings that are correct in development and dangerous in production.
 *
 * Each of these is a way of appearing to work while doing nothing real: taking
 * simulated payments, diverting every customer's mail to one inbox, signing
 * sessions with a secret published in the repository. None announces itself,
 * and every one of them has to be noticed before go-live rather than after.
 *
 * Returned rather than thrown so the same list can drive a hard failure at
 * runtime and a readable report from the preflight script.
 */
export type ReadinessProblem = { setting: string; detail: string };

const DEV_AUTH_SECRET_MARKER = "dev-only-secret-change-me";

export function productionReadinessProblems(): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];

  if (usingBuildPlaceholders()) {
    problems.push({
      setting: "AUTH_SECRET",
      detail:
        "is the build-time placeholder, which means the variable was never set on " +
        "the deployment platform. Sessions would be signed with a value published " +
        "in the source.",
    });
  } else if (env.AUTH_SECRET.includes(DEV_AUTH_SECRET_MARKER)) {
    problems.push({
      setting: "AUTH_SECRET",
      detail:
        "still the placeholder committed to the repository. Anyone with the source " +
        "could mint a valid session for any account, including an administrator.",
    });
  }

  if (env.MAIL_REDIRECT_TO) {
    problems.push({
      setting: "MAIL_REDIRECT_TO",
      detail:
        `every message is diverted to ${env.MAIL_REDIRECT_TO} instead of the customer. ` +
        "Confirmations, invoices and approval notices would reach nobody.",
    });
  }

  if (env.PAYMENT_GATEWAY === "MOCK") {
    problems.push({
      setting: "PAYMENT_GATEWAY",
      detail:
        "set to the simulated gateway, which confirms bookings without taking any " +
        "money. Venues would be given away.",
    });
  }

  if (env.PAYMENT_GATEWAY === "STRIPE") {
    problems.push({
      setting: "PAYMENT_GATEWAY",
      detail:
        "Stripe is the demonstration route, not part of the tender's integration " +
        "path. Switch to PayFast, Yoco, Paystack or iKhokha before trading.",
    });
  }

  if (env.MAIL_TRANSPORT === "ethereal") {
    problems.push({
      setting: "MAIL_TRANSPORT",
      detail:
        "set to the preview inbox. Messages are readable at a link but never reach " +
        "the recipient.",
    });
  }

  if (!env.CRON_SECRET || env.CRON_SECRET === "dev-cron-secret") {
    problems.push({
      setting: "CRON_SECRET",
      detail: env.CRON_SECRET
        ? "still the development placeholder, so anyone can drive the maintenance endpoint."
        : "not set, so the maintenance endpoint refuses every request and holds are never released.",
    });
  }

  if (!env.VAT_REGISTRATION_NUMBER) {
    problems.push({
      setting: "VAT_REGISTRATION_NUMBER",
      detail:
        "absent. SARS requires it on a valid tax invoice, and every invoice issued " +
        "without it is defective.",
    });
  }

  if (env.APP_URL.startsWith("http://localhost")) {
    problems.push({
      setting: "APP_URL",
      detail:
        "points at localhost. Payment return links and webhook callbacks are built " +
        "from it, so customers would be redirected nowhere.",
    });
  }

  return problems;
}

/**
 * Refuse to serve production traffic with development settings.
 *
 * Deliberately fatal. A warning in a log nobody reads is how a platform ends
 * up live with a simulated payment gateway, and the cost of that is far higher
 * than the cost of a deployment that will not start.
 */
export function assertProductionReady(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ALLOW_UNSAFE_PRODUCTION === "true") {
    console.warn(
      "[env] ALLOW_UNSAFE_PRODUCTION is set. Development settings are being " +
        "permitted in a production build. This must never be used for real trading.",
    );
    return;
  }

  const problems = productionReadinessProblems();
  if (problems.length === 0) return;

  const detail = problems
    .map((p) => `  - ${p.setting}: ${p.detail}`)
    .join("\n");

  throw new Error(
    `Refusing to start: ${problems.length} setting${problems.length === 1 ? " is" : "s are"} ` +
      `unsafe for production.\n${detail}\n\n` +
      `Fix these, or set ALLOW_UNSAFE_PRODUCTION=true to override for a staging ` +
      `deployment that takes no real bookings.`,
  );
}

/** Origins permitted to embed the booking portal in an iframe. */
export function embedAllowedOrigins(): string[] {
  return env.EMBED_ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when messages leave the application, to a real or preview inbox. */
export function mailConfigured(): boolean {
  return env.MAIL_TRANSPORT === "ethereal" || Boolean(env.SMTP_HOST);
}

/** True when messages reach real recipients rather than a preview inbox. */
export function mailDeliversToRecipients(): boolean {
  if (env.MAIL_REDIRECT_TO) return false;
  return env.MAIL_TRANSPORT !== "ethereal" && Boolean(env.SMTP_HOST);
}

/** True when real Outlook synchronisation can be attempted. */
export function outlookConfigured(): boolean {
  return (
    env.OUTLOOK_SYNC_ENABLED &&
    Boolean(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET)
  );
}
