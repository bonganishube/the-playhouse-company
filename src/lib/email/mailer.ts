import nodemailer, { type Transporter } from "nodemailer";
import { EmailStatus } from "@/generated/prisma/enums";
import { env } from "../env";
import { prisma } from "../prisma";

/**
 * Outbound mail.
 *
 * Every message is rendered and recorded before any delivery is attempted, so
 * the log is proof of what the customer was sent regardless of what the mail
 * server does next. The stored copy is also what a retry re-sends, meaning a
 * message delivered late is byte-for-byte the one originally generated, even
 * if a tariff or template has changed in between.
 *
 * Delivery outcomes are recorded honestly:
 *
 *   SENT            accepted by the mail server
 *   QUEUED          delivery failed, awaiting another attempt
 *   FAILED          retries exhausted, needs a human
 *   NOT_CONFIGURED  no SMTP set; rendered and recorded but NOT delivered
 *
 * The last of those matters. Reporting success when nothing was sent would
 * make a silent misconfiguration look like a working system, and nobody would
 * discover it until a customer complained about a missing confirmation.
 */

/** Attempts before a message is abandoned to FAILED. */
export const MAX_DELIVERY_ATTEMPTS = 5;

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
  /** Identifies the template, and how a retry knows what it is re-sending. */
  template: string;
  bookingId?: string;
  paymentId?: string;
  attachments?: Attachment[];
};

export type MailResult = { status: EmailStatus; logId: string; error?: string };

/** Hand a rendered message to the mail server, recording the outcome. */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const log = await prisma.emailLog.create({
    data: {
      to: input.to,
      subject: input.subject,
      template: input.template,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      html: input.html,
      text: input.text,
      attachments: (input.attachments ?? []) as never,
      // Provisional; overwritten by the delivery attempt below.
      status: EmailStatus.QUEUED,
    },
  });

  return attemptDelivery(log.id);
}

/**
 * Attempt delivery of an already-recorded message.
 *
 * Shared by first despatch, the scheduled retry sweep and the manual resend in
 * the admin console, so all three follow identical rules.
 */
export async function attemptDelivery(logId: string): Promise<MailResult> {
  const log = await prisma.emailLog.findUniqueOrThrow({ where: { id: logId } });
  const transport = getTransport();

  if (!transport) {
    console.info(
      `[mail] SMTP not configured. "${log.subject}" to ${log.to} recorded but not delivered.`,
    );
    await prisma.emailLog.update({
      where: { id: logId },
      data: {
        status: EmailStatus.NOT_CONFIGURED,
        lastAttemptAt: new Date(),
        error: "SMTP is not configured; the message was recorded but not sent.",
      },
    });
    return { status: EmailStatus.NOT_CONFIGURED, logId };
  }

  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: log.to,
      subject: log.subject,
      text: log.text,
      html: log.html,
      attachments: (log.attachments as Attachment[] | null) ?? undefined,
    });
    await prisma.emailLog.update({
      where: { id: logId },
      data: { status: EmailStatus.SENT, lastAttemptAt: new Date(), error: null },
    });
    return { status: EmailStatus.SENT, logId };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : String(cause);
    const attempts = log.attempts;
    // Give up only after the allowance is spent, so a brief outage does not
    // permanently lose a confirmation.
    const status =
      attempts >= MAX_DELIVERY_ATTEMPTS ? EmailStatus.FAILED : EmailStatus.QUEUED;

    console.error(
      `[mail] delivery failed (attempt ${attempts}/${MAX_DELIVERY_ATTEMPTS}): ${error}`,
    );
    await prisma.emailLog.update({
      where: { id: logId },
      data: { status, lastAttemptAt: new Date(), error },
    });
    return { status, logId, error };
  }
}

/**
 * Re-attempt messages that failed to send. Driven by the maintenance sweep.
 *
 * Messages recorded while SMTP was absent are picked up too, so configuring
 * the mail server delivers the backlog rather than losing it.
 */
export async function retryQueuedEmails(limit = 50): Promise<{
  attempted: number;
  sent: number;
}> {
  if (!env.SMTP_HOST) return { attempted: 0, sent: 0 };

  const pending = await prisma.emailLog.findMany({
    where: {
      status: { in: [EmailStatus.QUEUED, EmailStatus.NOT_CONFIGURED] },
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let sent = 0;
  for (const row of pending) {
    await prisma.emailLog.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    const result = await attemptDelivery(row.id);
    if (result.status === EmailStatus.SENT) sent += 1;
  }

  return { attempted: pending.length, sent };
}

/** Send an existing message again, resetting its attempt allowance. */
export async function resendEmail(logId: string): Promise<MailResult> {
  await prisma.emailLog.update({
    where: { id: logId },
    data: { attempts: 1, error: null },
  });
  return attemptDelivery(logId);
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
