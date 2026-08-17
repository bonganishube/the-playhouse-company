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
 *   SENT            accepted by the mail server, on its way to the recipient
 *   PREVIEW         delivered to a preview inbox, NOT to the recipient
 *   QUEUED          delivery failed, awaiting another attempt
 *   FAILED          retries exhausted, needs a human
 *   NOT_CONFIGURED  no transport set; rendered and recorded but NOT delivered
 *
 * The last of those matters. Reporting success when nothing was sent would
 * make a silent misconfiguration look like a working system, and nobody would
 * discover it until a customer complained about a missing confirmation.
 */

/** Attempts before a message is abandoned to FAILED. */
export const MAX_DELIVERY_ATTEMPTS = 5;

let transporter: Transporter | null = null;
/** Set when the active transport delivers to a preview inbox, not a customer. */
let isPreviewTransport = false;

/**
 * Resolve the mail transport.
 *
 * The `ethereal` option provisions a throwaway inbox with no account, no
 * credentials and no cost. Messages are readable at a link but never reach the
 * real recipient, which is precisely what makes it safe to run against live
 * booking data before a production provider exists. Pin ETHEREAL_USER and
 * ETHEREAL_PASSWORD to keep one inbox across restarts.
 */
async function getTransport(): Promise<Transporter | null> {
  if (transporter) return transporter;

  if (env.MAIL_TRANSPORT === "none") return null;

  if (env.MAIL_TRANSPORT === "ethereal") {
    const account =
      env.ETHEREAL_USER && env.ETHEREAL_PASSWORD
        ? { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASSWORD }
        : await nodemailer.createTestAccount().then((a) => ({
            user: a.user,
            pass: a.pass,
          }));

    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: account,
    });
    isPreviewTransport = true;

    if (!env.ETHEREAL_USER) {
      console.info(
        `[mail] preview inbox provisioned. Pin it across restarts with:\n` +
          `       ETHEREAL_USER="${account.user}"\n` +
          `       ETHEREAL_PASSWORD="${account.pass}"`,
      );
    }
    return transporter;
  }

  if (!env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
  isPreviewTransport = false;
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

export type MailResult = {
  status: EmailStatus;
  logId: string;
  error?: string;
  /** Where a preview-inbox message can be read. */
  previewUrl?: string;
};

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
  const transport = await getTransport();

  if (!transport) {
    console.info(
      `[mail] No transport configured. "${log.subject}" to ${log.to} recorded but not delivered.`,
    );
    await prisma.emailLog.update({
      where: { id: logId },
      data: {
        status: EmailStatus.NOT_CONFIGURED,
        lastAttemptAt: new Date(),
        error:
          "No mail transport is configured; the message was recorded but not sent.",
      },
    });
    return { status: EmailStatus.NOT_CONFIGURED, logId };
  }

  // While testing against real credentials, every message is diverted to one
  // address so a live confirmation cannot reach an actual customer by mistake.
  // The log keeps the true intended recipient, and the diverted copy says who
  // it was meant for, so the record stays honest either way.
  const redirected = Boolean(env.MAIL_REDIRECT_TO);
  const recipient = redirected ? env.MAIL_REDIRECT_TO : log.to;
  const notice = redirected
    ? `Intended for ${log.to}. Diverted here because MAIL_REDIRECT_TO is set.`
    : "";

  try {
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: recipient,
      subject: redirected ? `[to: ${log.to}] ${log.subject}` : log.subject,
      text: redirected ? `${notice}\n\n---\n\n${log.text}` : log.text,
      html: redirected
        ? `<p style="background:#fff4d6;border-left:4px solid #d6a95f;padding:10px 14px;font:14px system-ui;margin:0 0 16px">${notice}</p>${log.html}`
        : log.html,
      attachments: (log.attachments as Attachment[] | null) ?? undefined,
    });

    // A preview inbox is recorded as PREVIEW, never SENT. The message left the
    // application but the customer did not receive it, and reporting otherwise
    // would hide exactly the thing someone checking needs to know.
    // Diverted mail reached a mailbox, but not the customer's, so it is
    // recorded as PREVIEW rather than SENT for the same reason.
    const status =
      isPreviewTransport || redirected ? EmailStatus.PREVIEW : EmailStatus.SENT;
    const previewUrl = isPreviewTransport
      ? nodemailer.getTestMessageUrl(info) || null
      : null;

    await prisma.emailLog.update({
      where: { id: logId },
      data: { status, previewUrl, lastAttemptAt: new Date(), error: null },
    });
    return { status, logId, previewUrl: previewUrl ?? undefined };
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
export async function retryQueuedEmails(
  limit = 50,
  /**
   * Stop starting new sends after this instant.
   *
   * A serverless function is killed at its time limit with no warning, and on
   * Vercel's Hobby plan that limit is sixty seconds while fifty slow SMTP
   * sends take closer to three minutes. Bounding by count alone cannot solve
   * that, because how long a send takes depends on the provider, not on us.
   * Stopping on the clock instead means each run finishes cleanly and the
   * remainder is simply picked up next time; every message is retried
   * independently, so a partial pass loses nothing.
   */
  deadline?: number,
): Promise<{
  attempted: number;
  sent: number;
  /** True when work was left because the time budget ran out. */
  moreWaiting: boolean;
}> {
  // Nothing to retry against when messages are only being recorded.
  if (env.MAIL_TRANSPORT === "none") return { attempted: 0, sent: 0, moreWaiting: false };
  if (env.MAIL_TRANSPORT !== "ethereal" && !env.SMTP_HOST) {
    return { attempted: 0, sent: 0, moreWaiting: false };
  }

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
  let attempted = 0;
  for (const row of pending) {
    if (deadline && Date.now() >= deadline) {
      console.info(
        `[mail] time budget reached after ${attempted} of ${pending.length}; ` +
          `the rest will be retried on the next run`,
      );
      return { attempted, sent, moreWaiting: true };
    }

    attempted += 1;
    await prisma.emailLog.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    const result = await attemptDelivery(row.id);
    if (result.status === EmailStatus.SENT || result.status === EmailStatus.PREVIEW) {
      sent += 1;
    }
  }

  return { attempted, sent, moreWaiting: pending.length === limit };
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
