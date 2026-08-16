-- Double-booking prevention, enforced by the database rather than the
-- application. Two concurrent checkouts that both pass an application-level
-- "is this slot free?" test will still collide here, and the second one fails.
--
-- btree_gist is required so a plain equality operator ("venueId" WITH =) can
-- participate in a GiST index alongside the range overlap operator.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A reservation must cover a positive span of time.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_time_order"
  CHECK ("endsAt" > "startsAt" AND "blockEndsAt" > "blockStartsAt");

-- The buffered block must fully contain the customer-facing window, which is
-- what guarantees turnaround/cleaning time is genuinely held against the venue.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_block_contains_window"
  CHECK ("blockStartsAt" <= "startsAt" AND "blockEndsAt" >= "endsAt");

-- The core guarantee: for any one venue, no two *live* reservations may have
-- overlapping buffered time ranges. '[)' makes ranges half-open, so a booking
-- ending at 12:00 and another starting at 12:00 do not conflict.
--
-- Cancelled, rejected and expired rows are excluded from the constraint so
-- released slots become bookable again while the history is retained.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "venueId" WITH =,
    tstzrange("blockStartsAt", "blockEndsAt", '[)') WITH &&
  )
  WHERE (
    "status" IN (
      'HELD'::"ReservationStatus",
      'PENDING_PAYMENT'::"ReservationStatus",
      'PENDING_APPROVAL'::"ReservationStatus",
      'CONFIRMED'::"ReservationStatus"
    )
  );

-- Venue closures must also be well-formed.
ALTER TABLE "venue_closures"
  ADD CONSTRAINT "venue_closures_time_order"
  CHECK ("endsAt" > "startsAt");

-- Operating hours sanity: within a single day, and opening before closing.
ALTER TABLE "operating_hours"
  ADD CONSTRAINT "operating_hours_valid"
  CHECK (
    "dayOfWeek" BETWEEN 0 AND 6
    AND "opensAt" >= 0
    AND "closesAt" <= 1440
    AND "closesAt" > "opensAt"
  );

-- Deposit percentage must be a sensible proportion.
ALTER TABLE "venues"
  ADD CONSTRAINT "venues_deposit_percent_range"
  CHECK ("depositPercent" BETWEEN 1 AND 100);
