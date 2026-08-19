"use client";

import { useActionState } from "react";
import {
  registerAction,
  signInAction,
  type AuthState,
} from "@/app/actions/auth";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const initialState: AuthState = { ok: true };

export function AuthForm({
  mode,
  next,
  email,
}: {
  mode: "signin" | "register";
  next: string;
  /** Prefilled when we already know it, e.g. sent here from checkout. */
  email?: string;
}) {
  const action = mode === "signin" ? signInAction : registerAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4 border border-parchment-300 bg-white p-5">
      <input type="hidden" name="next" value={next} />

      {mode === "register" && (
        <>
          <Field label="Full name" required>
            <input name="fullName" required autoComplete="name" className={inputClass} />
          </Field>
          <Field label="Telephone">
            <input name="phone" autoComplete="tel" className={inputClass} />
          </Field>
          <Field label="Organisation" hint="Optional">
            <input name="organisation" autoComplete="organization" className={inputClass} />
          </Field>
        </>
      )}

      <Field label="Email address" required>
        <input
          type="email"
          name="email"
          defaultValue={email}
          required
          autoComplete="email"
          className={inputClass}
        />
      </Field>

      <Field
        label="Password"
        required
        hint={mode === "register" ? "At least 10 characters." : undefined}
      >
        <input
          type="password"
          name="password"
          required
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          className={inputClass}
        />
      </Field>

      {mode === "register" && (
        <Field label="Confirm password" required>
          <input
            type="password"
            name="confirmPassword"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      )}

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Please wait…"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </Button>
    </form>
  );
}
