import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { prisma } from "../prisma";

/**
 * Outbound mail.
 *
 * With SMTP configured, messages are delivered through the transport. Without
 * it. Local development, or before The Playhouse Company's mail relay is
 * provisioned. Messages are recorded to the email log instead of being sent,
 * so the flow remains testable and nothing is silently lost.
 *
 * Every attempt is written to EmailLog either way, giving proof of despatch
 * for booking confirmations and receipts.
 */

let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
  return transporter;
}

export type Attachment = {
  filename: string;
  content: string;
  contentType: string;
};

export type MailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Identifies the template for the log. */
  template: string;
  bookingId?: string;
  attachments?: Attachment[];
};

export async function sendMail(input: MailInput): Promise<boolean> {
  const transport = getTransport();

  let success = false;
  let error: string | null = null;

  try {
    if (transport) {
      await transport.sendMail({
        from: env.MAIL_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
      });
      success = true;
    } else {
      console.info(
        `[mail] SMTP not configured, logging "${input.subject}" to ${input.to}`,
      );
      success = true;
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
    console.error("[mail] delivery failed", error);
  }

  await prisma.emailLog
    .create({
      data: {
        to: input.to,
        subject: input.subject,
        template: input.template,
        bookingId: input.bookingId,
        success,
        error,
      },
    })
    .catch((logError) => console.error("[mail] could not write email log", logError));

  return success;
}

/** Recipients for internal notifications such as approval requests. */
export async function staffRecipients(venueIds: string[]): Promise<string[]> {
  const managers = await prisma.venueManager.findMany({
    where: { venueId: { in: venueIds } },
    select: { user: { select: { email: true, isActive: true } } },
  });
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { email: true },
  });

  const emails = new Set<string>();
  for (const m of managers) if (m.user.isActive) emails.add(m.user.email);
  for (const a of admins) emails.add(a.email);
  return [...emails];
}
