"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { addToCartAction, type ActionState } from "@/app/actions/cart";
import { Alert, Button } from "@/components/ui";

/**
 * Date and timeslot selection.
 *
 * The customer picks a day, then a contiguous run of free cells. The price
 * shown is a preview computed from the venue's published rates; the
 * authoritative price is recalculated server-side when the slot is held, so a
 * tampered client cannot alter what is charged.
 */

type Slot = {
  startMinutes: number;
  endMinutes: number;
  startsAt: string;
  endsAt: string;
  available: boolean;
  reason?: "BOOKED" | "CLOSED" | "PAST";
};

type DayAvailability = {
  date: string;
  timezone: string;
  isOpen: boolean;
  opensAt: number | null;
  closesAt: number | null;
  slotIncrementMinutes: number;
  minBookingMinutes: number;
  slots: Slot[];
};

/**
 * Only hourly venues use this picker, daily-rate venues are booked by date
 * through DayPicker, so no daily rate is needed here.
 */
export type VenuePricing = {
  hourlyCents: number | null;
  minBookingMinutes: number;
  maxAdvanceDays: number;
  currency: string;
};

const initialState: ActionState = { ok: true };

export function AvailabilityPicker({
  venueId,
  venueSlug,
  pricing,
  returnTo,
}: {
  venueId: string;
  venueSlug: string;
  pricing: VenuePricing;
  /** Where to send the customer once a slot is held. Same-origin paths only. */
  returnTo?: string;
}) {
  const [date, setDate] = useState(() => defaultDate(pricing.minBookingMinutes));
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

  const [state, formAction, pending] = useActionState(addToCartAction, initialState);

  // Reload the grid whenever the chosen day changes, discarding any selection.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setAnchor(null);
    setEnd(null);

    fetch(`/api/venues/${venueSlug}/availability?date=${date}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load availability.");
        return (await response.json()) as DayAvailability;
      })
      .then((data) => {
        if (!cancelled) setDay(data);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, venueSlug]);

  const selection = useMemo(() => {
    if (!day || anchor === null) return null;
    const last = end ?? anchor;
    const from = Math.min(anchor, last);
    const to = Math.max(anchor, last);

    const range = day.slots.slice(from, to + 1);
    // A selection is only valid if every cell within it is free.
    if (range.some((s) => !s.available)) return null;

    const startsAt = range[0]!.startsAt;
    const endsAt = range.at(-1)!.endsAt;
    const durationMinutes = range.length * day.slotIncrementMinutes;

    return {
      startsAt,
      endsAt,
      durationMinutes,
      startLabel: clock(range[0]!.startMinutes),
      endLabel: clock(range.at(-1)!.endMinutes),
      priceCents: previewPrice(durationMinutes, pricing),
      meetsMinimum: durationMinutes >= day.minBookingMinutes,
    };
  }, [day, anchor, end, pricing]);

  function handleSlotClick(index: number) {
    if (!day?.slots[index]?.available) return;

    // First click sets the start; second extends to the end; a third restarts.
    if (anchor === null || end !== null) {
      setAnchor(index);
      setEnd(null);
      return;
    }
    // Reject a range that would span an unavailable cell.
    const [from, to] = index < anchor ? [index, anchor] : [anchor, index];
    if (day.slots.slice(from, to + 1).some((s) => !s.available)) {
      setAnchor(index);
      setEnd(null);
      return;
    }
    setAnchor(from);
    setEnd(to);
  }

  const maxDate = new Date(Date.now() + pricing.maxAdvanceDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="border border-parchment-300 bg-white">
      <div className="border-b border-parchment-300 px-4 py-3">
        <h2 className="text-lg">Check availability</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Select a date, then click a start time and an end time.
        </p>
      </div>

      <div className="px-4 py-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-700">Date</span>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            max={maxDate}
            onChange={(event) => setDate(event.target.value)}
            className="w-full border border-parchment-300 bg-white px-3 py-2 text-sm sm:w-56"
          />
        </label>

        <div className="mt-4">
          {loading && <p className="py-8 text-center text-sm text-ink-500">Loading availability…</p>}

          {loadError && (
            <Alert tone="error">{loadError}</Alert>
          )}

          {!loading && !loadError && day && !day.isOpen && (
            <Alert tone="warning">
              This venue is not open for hire on the selected date.
            </Alert>
          )}

          {!loading && !loadError && day?.isOpen && (
            <>
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}
                role="group"
                aria-label="Available timeslots"
              >
                {day.slots.map((slot, index) => {
                  const from = anchor === null ? null : Math.min(anchor, end ?? anchor);
                  const to = anchor === null ? null : Math.max(anchor, end ?? anchor);
                  const selected =
                    from !== null && to !== null && index >= from && index <= to;

                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => handleSlotClick(index)}
                      aria-pressed={selected}
                      title={slotTitle(slot)}
                      className={[
                        "border px-1 py-2 text-xs tabular transition-colors",
                        selected
                          ? "border-brand-600 bg-brand-600 text-white"
                          : slot.available
                            ? "border-parchment-300 bg-white hover:border-brand-400 hover:bg-brand-50"
                            : "cursor-not-allowed border-parchment-200 bg-parchment-200 text-ink-500/50 line-through",
                      ].join(" ")}
                    >
                      {clock(slot.startMinutes)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
                <Legend className="border-parchment-300 bg-white" label="Available" />
                <Legend className="border-brand-600 bg-brand-600" label="Selected" />
                <Legend className="border-parchment-200 bg-parchment-200" label="Unavailable" />
              </div>
            </>
          )}
        </div>

        {selection && (
          <div className="mt-5 border-t border-parchment-200 pt-4">
            {!selection.meetsMinimum ? (
              <Alert tone="warning">
                The minimum booking for this venue is{" "}
                {formatDuration(day!.minBookingMinutes)}. Extend your selection to
                continue.
              </Alert>
            ) : (
              <form action={formAction}>
                <input type="hidden" name="venueId" value={venueId} />
                <input type="hidden" name="startsAt" value={selection.startsAt} />
                <input type="hidden" name="endsAt" value={selection.endsAt} />
                {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-ink-500">You have selected</p>
                    <p className="text-lg text-ink-900">
                      {selection.startLabel} – {selection.endLabel}
                      <span className="ml-2 text-sm text-ink-500">
                        ({formatDuration(selection.durationMinutes)})
                      </span>
                    </p>
                    {selection.priceCents !== null && (
                      <p className="mt-1 text-sm text-ink-700">
                        Estimated charge{" "}
                        <span className="font-semibold tabular">
                          {formatZar(selection.priceCents)}
                        </span>
                      </p>
                    )}
                  </div>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Reserving…" : "Add to cart"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {state.message && !state.ok && (
          <div className="mt-4">
            <Alert tone="error">{state.message}</Alert>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 border ${className}`} />
      {label}
    </span>
  );
}

function slotTitle(slot: Slot): string {
  if (slot.available) return "Available";
  switch (slot.reason) {
    case "BOOKED":
      return "Already booked, or reserved for turnaround";
    case "CLOSED":
      return "Venue closed";
    case "PAST":
      return "Too late to book this slot";
    default:
      return "Unavailable";
  }
}

/**
 * Mirrors the server's pricing rule so the customer sees the same figure
 * before committing. The server remains the authority.
 */
function previewPrice(
  durationMinutes: number,
  pricing: VenuePricing,
): number | null {
  if (!pricing.hourlyCents) return null;
  return Math.round(pricing.hourlyCents * (durationMinutes / 60));
}

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${m} minutes`;
}

function formatZar(cents: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(cents / 100);
}

/** Default to tomorrow, which clears the common 24-hour notice requirement. */
function defaultDate(_minBookingMinutes: number): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}
