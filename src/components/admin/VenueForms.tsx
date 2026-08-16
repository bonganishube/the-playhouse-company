"use client";

import { useActionState, useState } from "react";
import {
  addClosureAction,
  removeClosureAction,
  saveOperatingHoursAction,
  saveVenueAction,
  type AdminState,
} from "@/app/actions/admin";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";

const initial: AdminState = { ok: true };

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type VenueFormValues = {
  id: string;
  name: string;
  shortInfo: string;
  description: string;
  capacity: number | null;
  location: string;
  isActive: boolean;
  category: string;
  rateBasis: string;
  workflow: string;
  paymentPolicy: string;
  depositPercent: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minBookingMinutes: number;
  slotIncrementMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  /** VAT-inclusive, per day or per hour according to rateBasis. */
  rate: string;
  outlookMailbox: string;
};

export function VenueForm({ venue }: { venue: VenueFormValues }) {
  const [state, action, pending] = useActionState(saveVenueAction, initial);
  // Drives which rate label and guidance are shown, without a round trip.
  const [rateBasis, setRateBasis] = useState(venue.rateBasis);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="venueId" value={venue.id} />

      <Card className="p-5">
        <h2 className="mb-4 text-lg">Presentation</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <input name="name" defaultValue={venue.name} required className={inputClass} />
          </Field>
          <Field label="Capacity">
            <input
              type="number"
              name="capacity"
              defaultValue={venue.capacity ?? ""}
              min={1}
              className={inputClass}
            />
          </Field>
          <Field label="Location" hint="Shown beneath the venue name">
            <input name="location" defaultValue={venue.location} className={inputClass} />
          </Field>
          <Field label="Summary" hint="One line, used on venue listings">
            <input name="shortInfo" defaultValue={venue.shortInfo} className={inputClass} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Description" required>
            <textarea
              name="description"
              defaultValue={venue.description}
              rows={6}
              required
              className={inputClass}
            />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={venue.isActive}
            className="h-4 w-4 accent-[#8a1538]"
          />
          Visible on the public site and open for booking
        </label>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg">Category and tariff</h2>
        <p className="mb-4 text-sm text-ink-500">
          Rates are <strong>VAT-inclusive</strong>, enter the figure the customer
          pays. A venue is sold either by the day or by the hour, never both;
          the basis determines which booking interface customers are shown.
          Existing bookings keep the rate captured when they were made, so a
          tariff change never alters historical records.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <select name="category" defaultValue={venue.category} className={inputClass}>
              <option value="THEATRE">Theatre</option>
              <option value="FUNCTION_VENUE">Function venue</option>
              <option value="REHEARSAL_VENUE">Rehearsal venue</option>
              <option value="RECORDING_STUDIO">Recording studio</option>
            </select>
          </Field>
          <Field label="Sold by">
            <select
              name="rateBasis"
              value={rateBasis}
              onChange={(event) => setRateBasis(event.target.value)}
              className={inputClass}
            >
              <option value="DAILY">The day, fixed daily rate</option>
              <option value="HOURLY">The hour</option>
            </select>
          </Field>
          <Field
            label={rateBasis === "DAILY" ? "Daily rate (ZAR, incl. VAT)" : "Hourly rate (ZAR, incl. VAT)"}
            required
          >
            <input
              type="number"
              name="rate"
              step="0.01"
              min="0"
              defaultValue={venue.rate}
              required
              className={inputClass}
            />
          </Field>
        </div>
        {rateBasis === "DAILY" && (
          <p className="mt-3 text-xs text-amber-800">
            Customers select whole dates for this venue. A day is charged in full
            regardless of the hours used.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg">Booking rules</h2>
        <p className="mb-4 text-sm text-ink-500">
          The turnaround held between two consecutive bookings is the first
          booking&apos;s &ldquo;after&rdquo; buffer plus the second&apos;s
          &ldquo;before&rdquo; buffer. Set one side only unless preparation and
          cleaning are genuinely separate windows.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Confirmation workflow">
            <select
              name="workflow"
              defaultValue={venue.workflow}
              className={inputClass}
            >
              <option value="INSTANT">Instant on successful payment</option>
              <option value="APPROVAL_REQUIRED">Administrative approval required</option>
            </select>
          </Field>
          <Field label="Payment policy">
            <select
              name="paymentPolicy"
              defaultValue={venue.paymentPolicy}
              className={inputClass}
            >
              <option value="FULL_UPFRONT">Full payment at checkout</option>
              <option value="DEPOSIT_ALLOWED">Deposit permitted</option>
            </select>
          </Field>
          <Field label="Deposit (%)" hint="Applies when deposits are permitted">
            <input
              type="number"
              name="depositPercent"
              min={1}
              max={100}
              defaultValue={venue.depositPercent}
              className={inputClass}
            />
          </Field>

          <Field label="Buffer before (minutes)" hint="Venue preparation">
            <input
              type="number"
              name="bufferBeforeMinutes"
              min={0}
              step={15}
              defaultValue={venue.bufferBeforeMinutes}
              className={inputClass}
            />
          </Field>
          <Field label="Buffer after (minutes)" hint="Cleaning and turnaround">
            <input
              type="number"
              name="bufferAfterMinutes"
              min={0}
              step={15}
              defaultValue={venue.bufferAfterMinutes}
              className={inputClass}
            />
          </Field>
          <Field label="Booking increment (minutes)">
            <input
              type="number"
              name="slotIncrementMinutes"
              min={5}
              step={5}
              defaultValue={venue.slotIncrementMinutes}
              className={inputClass}
            />
          </Field>

          <Field
            label="Minimum booking (minutes)"
            hint="Must be a multiple of the increment"
          >
            <input
              type="number"
              name="minBookingMinutes"
              min={15}
              step={15}
              defaultValue={venue.minBookingMinutes}
              className={inputClass}
            />
          </Field>
          <Field label="Notice required (hours)">
            <input
              type="number"
              name="minNoticeHours"
              min={0}
              defaultValue={venue.minNoticeHours}
              className={inputClass}
            />
          </Field>
          <Field label="Booking horizon (days)">
            <input
              type="number"
              name="maxAdvanceDays"
              min={1}
              defaultValue={venue.maxAdvanceDays}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg">Outlook calendar</h2>
        <p className="mb-4 text-sm text-ink-500">
          The resource mailbox confirmed bookings are written to. Leave blank to
          disable synchronisation for this venue.
        </p>
        <Field
          label="Resource mailbox"
          hint="e.g. opera-theatre@playhousecompany.com"
        >
          <input
            type="email"
            name="outlookMailbox"
            defaultValue={venue.outlookMailbox}
            className={inputClass}
          />
        </Field>
      </Card>

      {state.message && (
        <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save venue configuration"}
      </Button>
    </form>
  );
}

export function OperatingHoursForm({
  venueId,
  hours,
}: {
  venueId: string;
  hours: { dayOfWeek: number; opensAt: number; closesAt: number }[];
}) {
  const [state, action, pending] = useActionState(saveOperatingHoursAction, initial);
  const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg">Operating hours</h2>
      <p className="mb-4 text-sm text-ink-500">
        Times a customer may book. Operational buffers may extend beyond these hours,
        since turnaround is handled by staff after closing.
      </p>

      <form action={action} className="space-y-2">
        <input type="hidden" name="venueId" value={venueId} />

        {DAYS.map((label, day) => {
          const existing = byDay.get(day);
          return (
            <div key={day} className="flex flex-wrap items-center gap-3 border-b border-parchment-200 py-2 last:border-0">
              <label className="flex w-32 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`open_${day}`}
                  defaultChecked={Boolean(existing)}
                  className="h-4 w-4 accent-[#8a1538]"
                />
                {label}
              </label>
              <input
                type="time"
                name={`opensAt_${day}`}
                defaultValue={minutesToClock(existing?.opensAt ?? 540)}
                className="border border-parchment-300 px-2 py-1 text-sm"
              />
              <span className="text-ink-500">to</span>
              <input
                type="time"
                name={`closesAt_${day}`}
                defaultValue={minutesToClock(existing?.closesAt ?? 1020)}
                className="border border-parchment-300 px-2 py-1 text-sm"
              />
            </div>
          );
        })}

        {state.message && (
          <div className="pt-2">
            <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
          </div>
        )}

        <div className="pt-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save operating hours"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ClosuresPanel({
  venueId,
  closures,
}: {
  venueId: string;
  closures: { id: string; startsAt: string; endsAt: string; reason: string }[];
}) {
  const [state, action, pending] = useActionState(addClosureAction, initial);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg">Closures</h2>
      <p className="mb-4 text-sm text-ink-500">
        Public holidays, maintenance windows and periods committed to a production.
        Closures block booking without affecting the published tariff.
      </p>

      {closures.length > 0 && (
        <ul className="mb-4 divide-y divide-parchment-200 border-y border-parchment-200">
          {closures.map((closure) => (
            <li key={closure.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div>
                <p className="tabular">
                  {closure.startsAt} → {closure.endsAt}
                </p>
                <p className="text-ink-500">{closure.reason}</p>
              </div>
              <form action={removeClosureAction}>
                <input type="hidden" name="closureId" value={closure.id} />
                <button
                  type="submit"
                  className="text-xs text-ink-500 underline hover:text-red-700"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-3">
        <input type="hidden" name="venueId" value={venueId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" required>
            <input
              type="datetime-local"
              name="startsAt"
              required
              className={inputClass}
            />
          </Field>
          <Field label="To" required>
            <input type="datetime-local" name="endsAt" required className={inputClass} />
          </Field>
        </div>
        <Field label="Reason" required>
          <input
            name="reason"
            required
            placeholder="Heritage Day, venue closed"
            className={inputClass}
          />
        </Field>

        {state.message && (
          <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
        )}

        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add closure"}
        </Button>
      </form>
    </Card>
  );
}

function minutesToClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
