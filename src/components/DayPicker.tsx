"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { addDaysToCartAction, type ActionState } from "@/app/actions/cart";
import { Alert, Button } from "@/components/ui";

/**
 * Date selection for venues sold at a fixed daily rate.
 *
 * Theatres and function venues are hired by the day, so the customer chooses
 * dates rather than times — a timeslot grid would invite someone to select two
 * hours and be charged for a full day.
 */

type DayOption = {
  date: string;
  available: boolean;
  reason?: "BOOKED" | "CLOSED" | "PAST";
  startsAt: string;
  endsAt: string;
};

const initialState: ActionState = { ok: true };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DayPicker({
  venueId,
  venueSlug,
  dailyRateCents,
  returnTo,
}: {
  venueId: string;
  venueSlug: string;
  dailyRateCents: number;
  returnTo?: string;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [days, setDays] = useState<DayOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [state, formAction, pending] = useActionState(
    addDaysToCartAction,
    initialState,
  );

  const { from, to, label } = useMemo(() => monthRange(monthOffset), [monthOffset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    fetch(`/api/venues/${venueSlug}/days?from=${from}&to=${to}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load availability.");
        return (await response.json()) as { days: DayOption[] };
      })
      .then((data) => {
        if (!cancelled) setDays(data.days);
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
  }, [from, to, venueSlug]);

  const byDate = useMemo(
    () => new Map(days.map((d) => [d.date, d])),
    [days],
  );

  // Selection persists across months, so a booking can span a month boundary.
  const chosen = useMemo(
    () =>
      [...selected]
        .sort()
        .map((date) => byDate.get(date))
        .filter((d): d is DayOption => Boolean(d)),
    [selected, byDate],
  );

  function toggle(date: string) {
    const option = byDate.get(date);
    if (!option?.available) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  // Pad the grid so dates line up under the correct weekday column.
  const leadingBlanks = useMemo(() => {
    if (days.length === 0) return 0;
    const first = new Date(`${days[0]!.date}T00:00:00Z`);
    return (first.getUTCDay() + 6) % 7; // Monday-first
  }, [days]);

  const totalCents = chosen.length * dailyRateCents;

  return (
    <div className="border border-parchment-300 bg-white">
      <div className="border-b border-parchment-300 px-4 py-3">
        <h2 className="text-lg">Check availability</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          This venue is hired by the day at a fixed rate. Select one or more dates.
        </p>
      </div>

      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m - 1)}
            disabled={monthOffset <= 0}
            className="border border-parchment-300 px-2 py-1 text-sm disabled:opacity-40"
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="text-sm font-medium">{label}</span>
          <button
            type="button"
            onClick={() => setMonthOffset((m) => m + 1)}
            className="border border-parchment-300 px-2 py-1 text-sm"
            aria-label="Next month"
          >
            →
          </button>
        </div>

        {loading && (
          <p className="py-8 text-center text-sm text-ink-500">
            Loading availability…
          </p>
        )}
        {loadError && <Alert tone="error">{loadError}</Alert>}

        {!loading && !loadError && (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-ink-500">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Available dates">
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <div key={`blank-${i}`} />
              ))}

              {days.map((day) => {
                const isSelected = selected.has(day.date);
                const dayNumber = Number(day.date.slice(8, 10));
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={!day.available}
                    onClick={() => toggle(day.date)}
                    aria-pressed={isSelected}
                    title={dayTitle(day)}
                    className={[
                      "border py-2 text-sm tabular transition-colors",
                      isSelected
                        ? "border-brand-600 bg-brand-600 text-white"
                        : day.available
                          ? "border-parchment-300 bg-white hover:border-brand-400 hover:bg-brand-50"
                          : "cursor-not-allowed border-parchment-200 bg-parchment-200 text-ink-500/50 line-through",
                    ].join(" ")}
                  >
                    {dayNumber}
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

        {chosen.length > 0 && (
          <form action={formAction} className="mt-5 border-t border-parchment-200 pt-4">
            <input type="hidden" name="venueId" value={venueId} />
            {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
            {chosen.map((day) => (
              <input
                key={day.date}
                type="hidden"
                name="days"
                value={`${day.startsAt}|${day.endsAt}`}
              />
            ))}

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-ink-500">
                  {chosen.length} day{chosen.length === 1 ? "" : "s"} selected
                </p>
                <p className="text-sm text-ink-900">
                  {chosen.map((d) => formatDay(d.date)).join(", ")}
                </p>
                <p className="mt-1 text-sm text-ink-700">
                  Total{" "}
                  <span className="font-semibold tabular">{formatZar(totalCents)}</span>
                  <span className="text-ink-500"> incl. VAT</span>
                </p>
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? "Reserving…" : "Add to cart"}
              </Button>
            </div>
          </form>
        )}

        {state.message && !state.ok && (
          <div className="mt-4">
            <Alert tone="warning">{state.message}</Alert>
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

function dayTitle(day: DayOption): string {
  if (day.available) return "Available";
  switch (day.reason) {
    case "BOOKED":
      return "Already booked";
    case "CLOSED":
      return "Venue closed";
    case "PAST":
      return "Outside the bookable window";
    default:
      return "Unavailable";
  }
}

function monthRange(offset: number): { from: string; to: string; label: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  );
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
    label: first.toLocaleDateString("en-ZA", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatZar(cents: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(cents / 100);
}
