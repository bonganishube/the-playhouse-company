import { simulatePaymentAction } from "@/app/actions/devPay";

/**
 * Outcome selector for the simulated gateway. Each button posts a signed
 * callback of the corresponding status.
 */
export function MockPaymentForm({
  reference,
  amountCents,
  returnUrl,
}: {
  reference: string;
  amountCents: number;
  returnUrl: string;
}) {
  return (
    <form action={simulatePaymentAction} className="mt-5 space-y-2">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="amountCents" value={amountCents} />
      <input type="hidden" name="returnUrl" value={returnUrl} />

      <button
        type="submit"
        name="status"
        value="SUCCEEDED"
        className="w-full bg-brand-600 px-4 py-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        Approve payment
      </button>
      <button
        type="submit"
        name="status"
        value="FAILED"
        className="w-full border border-parchment-300 bg-white px-4 py-2 text-sm hover:bg-parchment-100"
      >
        Decline payment
      </button>
      <button
        type="submit"
        name="status"
        value="CANCELLED"
        className="w-full border border-parchment-300 bg-white px-4 py-2 text-sm hover:bg-parchment-100"
      >
        Cancel and return
      </button>
    </form>
  );
}
