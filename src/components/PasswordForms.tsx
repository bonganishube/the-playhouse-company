"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestResetAction,
  resetPasswordAction,
  type PasswordState,
} from "@/app/actions/password";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const initial: PasswordState = { ok: true };

/** Ask for a link. */
export function RequestResetForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [state, action, pending] = useActionState(requestResetAction, initial);

  // Once a request has gone through the form is replaced rather than left on
  // screen, so nobody sits resubmitting and generating a pile of live tokens.
  if (state.done) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Check your email">
          {state.message}
        </Alert>
        <p className="text-sm text-ink-500">
          Nothing arrived? Look in your spam folder, then{" "}
          <Link href="/forgot-password" className="text-brand-600 underline">
            try again
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Email address" required>
        <input
          type="email"
          name="email"
          defaultValue={defaultEmail}
          required
          autoComplete="email"
          autoFocus
          className={inputClass}
        />
      </Field>

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a link"}
      </Button>
    </form>
  );
}

/** Choose the new password. */
export function ResetPasswordForm({
  token,
  next,
  firstTime,
}: {
  token: string;
  next?: string;
  firstTime: boolean;
}) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {next && <input type="hidden" name="next" value={next} />}

      <Field
        label={firstTime ? "Choose a password" : "New password"}
        required
        hint="At least 10 characters. Length matters more than symbols."
      >
        <input
          type="password"
          name="password"
          required
          minLength={10}
          autoComplete="new-password"
          autoFocus
          className={inputClass}
        />
      </Field>

      <Field label="Confirm password" required>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={10}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : firstTime ? "Set password and sign in" : "Save and sign in"}
      </Button>
    </form>
  );
}
