"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ReconcileResponse = {
  /** The booking's status after reconciliation. */
  status: string;
  /** The attempt the customer has just come back from. */
  payment: { status: string; failureReason: string | null } | null;
  changed: boolean;
};

/** Statuses the provider will not move away from, so polling can stop. */
const DECIDED = ["SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED"];

/**
 * Establishes what actually became of the payment the customer has just made.
 *
 * A webhook is the authoritative confirmation, but it can be delayed or lost.
 * Rather than leaving the customer looking at "awaiting confirmation" after
 * they have genuinely paid, this asks the server to query the gateway
 * directly, retrying briefly while the webhook may still be in flight.
 *
 * Polling stops as soon as the answer is known either way. A declined card
 * leaves the booking at PENDING_PAYMENT exactly as a missing webhook does, so
 * the attempt's own status is what distinguishes "not yet confirmed" from
 * "did not go through". Once it is decided the page is refreshed and the
 * server-rendered result takes over from this notice.
 *
 * Safe to run alongside the webhook: settlement is idempotent, so whichever
 * arrives first confirms the booking and the other is acknowledged.
 */
export function PaymentReconciler({
  reference,
  token,
}: {
  reference: string;
  /**
   * Proof of the payment, for a customer with no session. Without it the
   * endpoint would refuse the poll and the page would never resolve for the
   * very people who most need an answer.
   */
  token?: string;
}) {
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
        const query = token ? `?t=${encodeURIComponent(token)}` : "";
        const response = await fetch(
          `/api/payments/reconcile/${reference}${query}`,
          { method: "POST" },
        );
        if (response.ok) {
          const data = (await response.json()) as ReconcileResponse;
          const decided =
            data.status !== "PENDING_PAYMENT" ||
            (data.payment !== null && DECIDED.includes(data.payment.status));

          if (decided) {
            setSettled(true);
            router.refresh();
            return;
          }
        }
      } catch {
        // Network hiccup, the next attempt will try again.
      } finally {
        running.current = false;
        setAttempts((n) => n + 1);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [attempts, settled, reference, token, router]);

  if (settled) return null;

  return (
    <p className="mt-2 text-xs text-ink-500" role="status" aria-live="polite">
      {attempts >= 5
        ? "Still awaiting confirmation from the payment provider. Your card may not have been charged. Refresh in a moment, or contact us quoting your reference before paying again."
        : "Checking with the payment provider…"}
    </p>
  );
}
