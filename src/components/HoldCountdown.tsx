"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Countdown to the expiry of the cart's slot holds.
 *
 * When the hold lapses the page is refreshed rather than the cart being
 * cleared client-side, so the server remains the authority on what is still
 * reserved.
 */
export function HoldCountdown({
  expiresAt,
  initialRemainingMs,
}: {
  expiresAt: string;
  /**
   * Milliseconds left, measured on the server that rendered the page.
   *
   * Deriving this from Date.now() during render instead put a different number
   * in the server HTML and the first client render, roughly a second apart,
   * which React reports as a hydration mismatch and repairs by throwing the
   * tree away and re-rendering. Taking the opening figure as a prop makes both
   * first renders identical; the interval below owns every value after that.
   */
  initialRemainingMs: number;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(initialRemainingMs);

  useEffect(() => {
    const target = new Date(expiresAt).getTime();
    const timer = setInterval(() => {
      const left = Math.max(0, target - Date.now());
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, router]);

  if (remaining === 0) {
    return (
      <div className="border-l-4 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        Your reservation has expired. Please select your times again.
      </div>
    );
  }

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const urgent = remaining < 5 * 60_000;

  return (
    <div
      className={`border-l-4 px-4 py-3 text-sm ${
        urgent
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-blue-300 bg-blue-50 text-blue-900"
      }`}
      role="status"
      aria-live="polite"
    >
      Your selected times are held for{" "}
      <strong className="tabular">
        {minutes}:{String(seconds).padStart(2, "0")}
      </strong>
      . Complete your booking before the hold expires.
    </div>
  );
}
