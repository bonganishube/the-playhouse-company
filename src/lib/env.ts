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

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();

/** Origins permitted to embed the booking portal in an iframe. */
export function embedAllowedOrigins(): string[] {
  return env.EMBED_ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when real Outlook synchronisation can be attempted. */
export function outlookConfigured(): boolean {
  return (
    env.OUTLOOK_SYNC_ENABLED &&
    Boolean(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET)
  );
}
