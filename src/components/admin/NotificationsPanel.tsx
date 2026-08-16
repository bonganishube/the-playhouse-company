"use client";

import { useActionState } from "react";
import { resendEmailAction, type AdminState } from "@/app/actions/admin";
import { Alert, Button, Card } from "@/components/ui";

const initial: AdminState = { ok: true };

export type EmailRow = {
  id: string;
  template: string;
  to: string;
  subject: string;
  status: string;
  attempts: number;
  sentAt: string;
  error: string | null;
  previewUrl: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  SENT: "bg-green-100 text-green-900 border-green-300",
  PREVIEW: "bg-blue-100 text-blue-900 border-blue-300",
  QUEUED: "bg-amber-100 text-amber-900 border-amber-300",
  FAILED: "bg-red-100 text-red-900 border-red-300",
  NOT_CONFIGURED: "bg-parchment-200 text-ink-700 border-parchment-400",
};

const STATUS_LABEL: Record<string, string> = {
  SENT: "Sent",
  PREVIEW: "Preview only",
  QUEUED: "Awaiting retry",
  FAILED: "Failed",
  NOT_CONFIGURED: "Not delivered",
};

/**
 * Correspondence sent to the customer for this booking, with its delivery
 * state. Staff answering "did they get their confirmation?" should not have to
 * read a server log to find out.
 */
export function NotificationsPanel({
  bookingId,
  emails,
  deliversToRecipients,
}: {
  bookingId: string;
  emails: EmailRow[];
  deliversToRecipients: boolean;
}) {
  const [state, action, pending] = useActionState(resendEmailAction, initial);

  return (
    <Card>
      <h2 className="border-b border-parchment-300 px-5 py-3 text-lg">
        Correspondence
      </h2>

      {!deliversToRecipients && (
        <div className="px-5 pt-4">
          <Alert tone="warning" title="Messages are not reaching customers">
            No production mail provider is configured. Messages are recorded,
            and where a preview inbox is in use they can be read via the link
            below, but customers do not receive them. Configure SMTP and the
            backlog is delivered on the next maintenance sweep.
          </Alert>
        </div>
      )}

      {emails.length === 0 ? (
        <p className="px-5 py-5 text-sm text-ink-500">
          Nothing has been sent for this booking yet.
        </p>
      ) : (
        <ul className="divide-y divide-parchment-200">
          {emails.map((email) => (
            <li key={email.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{email.subject}</p>
                  <p className="text-xs text-ink-500">
                    {email.to} · {email.sentAt}
                    {email.attempts > 1 && ` · ${email.attempts} attempts`}
                  </p>
                  {email.error && (
                    <p className="mt-0.5 text-xs text-red-700">{email.error}</p>
                  )}
                  <p className="mt-1 flex gap-3 text-xs">
                    <a
                      href={`/admin/emails/${email.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-brand-600 underline"
                    >
                      View message
                    </a>
                    {email.previewUrl && (
                      <a
                        href={email.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 underline"
                      >
                        Open in preview inbox
                      </a>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                      STATUS_STYLE[email.status] ?? STATUS_STYLE.NOT_CONFIGURED
                    }`}
                  >
                    {STATUS_LABEL[email.status] ?? email.status}
                  </span>
                  <form action={action}>
                    <input type="hidden" name="logId" value={email.id} />
                    <input type="hidden" name="bookingId" value={bookingId} />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                    >
                      Resend
                    </Button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {state.message && (
        <div className="px-5 pb-4">
          <Alert tone={state.ok ? "success" : "warning"}>{state.message}</Alert>
        </div>
      )}
    </Card>
  );
}
