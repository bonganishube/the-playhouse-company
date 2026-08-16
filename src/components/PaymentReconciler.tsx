"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Confirms a booking on the customer's return from the payment provider.
 *
 * A webhook is the authoritative confirmation, but it can be delayed or lost.
 * Rather than leaving the customer looking at "awaiting confirmation" after
 * they have genuinely paid, this asks the server to query the gateway
 * directly, retrying briefly while the webhook may still be in flight.
 *
 * Safe to run alongside the webhook: settlement is idempotent, so whichever
 * arrives first confirms the booking and the other is acknowledged.
 */
export function PaymentReconciler({ reference }: { reference: string }) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const [settled, setSettled] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    if (settled || attempts >= 5) return;

    // Back off between attempts, giving the webhook time to land first.
    const delay = attempts === 0 ? 800 : attempts * 2500;

    const timer = setTimeout(async () => {
      if (running.current) return;
      running.current = true;

      try {
        const response = await fetch(`/api/payments/reconcile/${reference}`, {
          method: "POST",
        });
        if (response.ok) {
          const data = (await response.json()) as {
            status: string;
            changed: boolean;
          };
          if (data.status !== "PENDING_PAYMENT") {
            setSettled(true);
            router.refresh();
            return;
          }
        }
      } catch {
        // Network hiccup — the next attempt will try again.
      } finally {
        running.current = false;
        setAttempts((n) => n + 1);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [attempts, settled, reference, router]);

  if (settled) return null;

  return (
    <p className="mt-2 text-xs text-ink-500" role="status" aria-live="polite">
      {attempts >= 5
        ? "Still awaiting confirmation from the payment provider. Refresh in a moment, or contact us quoting your reference."
        : "Checking with the payment provider…"}
    </p>
  );
}
