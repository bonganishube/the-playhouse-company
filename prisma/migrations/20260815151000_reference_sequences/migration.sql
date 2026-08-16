-- Gapless, race-free human-readable identifiers.
--
-- Booking references and receipt numbers are quoted by customers and appear on
-- financial records, so they must be sequential and unique under concurrency.
-- A Postgres sequence gives both without any application-side locking.

CREATE SEQUENCE IF NOT EXISTS booking_reference_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1 INCREMENT BY 1;
