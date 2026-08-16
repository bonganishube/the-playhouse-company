"use client";

import { useActionState, useState } from "react";
import {
  createStaffUserAction,
  saveUserAction,
  type AdminState,
} from "@/app/actions/admin";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

const initial: AdminState = { ok: true };

const STAFF_ROLES = [
  { value: "STAFF", label: "Staff — read-only access and schedule export" },
  { value: "VENUE_MANAGER", label: "Venue manager — approves bookings for assigned venues" },
  { value: "FINANCE", label: "Finance — payments, receipts and financial reports" },
  { value: "ADMIN", label: "Administrator — full control" },
];

export function CreateStaffUser() {
  const [state, action, pending] = useActionState(createStaffUserAction, initial);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg">Add a staff member</h2>
      <p className="mb-4 text-sm text-ink-500">
        Customers register themselves. Use this to grant internal access.
      </p>

      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" required>
            <input name="fullName" required className={inputClass} />
          </Field>
          <Field label="Email address" required>
            <input type="email" name="email" required className={inputClass} />
          </Field>
        </div>
        <Field label="Role" required>
          <select name="role" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a role
            </option>
            {STAFF_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Initial password"
          required
          hint="At least 10 characters. Share it securely and ask them to change it."
        >
          <input type="password" name="password" required className={inputClass} />
        </Field>

        {state.message && (
          <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
        )}

        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create staff account"}
        </Button>
      </form>
    </Card>
  );
}

export function UserRow({
  user,
  venues,
}: {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isActive: boolean;
    managedVenueIds: string[];
    bookingCount: number;
  };
  venues: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveUserAction, initial);
  const [role, setRole] = useState(user.role);
  const [open, setOpen] = useState(false);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{user.fullName}</p>
          <p className="text-xs text-ink-500">{user.email}</p>
          <p className="text-xs text-ink-500">
            {user.role.replace(/_/g, " ")}
            {!user.isActive && <span className="text-red-700"> · deactivated</span>}
            {user.bookingCount > 0 && ` · ${user.bookingCount} booking${user.bookingCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-brand-600 underline"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <form action={action} className="mt-3 space-y-3 border-t border-parchment-200 pt-3">
          <input type="hidden" name="userId" value={user.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role">
              <select
                name="role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className={inputClass}
              >
                <option value="CUSTOMER">Customer</option>
                {STAFF_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={user.isActive}
                className="h-4 w-4 accent-[#8a1538]"
              />
              Account active
            </label>
          </div>

          {role === "VENUE_MANAGER" && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink-700">
                Venues this manager may approve
              </legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {venues.map((venue) => (
                  <label key={venue.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="venueIds"
                      value={venue.id}
                      defaultChecked={user.managedVenueIds.includes(venue.id)}
                      className="h-4 w-4 accent-[#8a1538]"
                    />
                    {venue.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {state.message && (
            <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
          )}

          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}
    </li>
  );
}
