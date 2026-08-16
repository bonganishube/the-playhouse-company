import { notFound } from "next/navigation";
import { MockPaymentForm } from "@/components/MockPaymentForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Simulated payment" };

/**
 * Stand-in for a hosted payment page, used only while PAYMENT_GATEWAY=MOCK.
 *
 * It lets the full booking lifecycle — checkout, callback, confirmation,
 * receipt and calendar sync — be demonstrated and tested before The Playhouse
 * Company's merchant accounts are live. Unreachable in production.
 */
export default async function DevPayPage({ searchParams }: PageProps<"/dev/pay">) {
  if (process.env.NODE_ENV === "production") notFound();

  const query = await searchParams;
  const reference = String(query.reference ?? "");
  const amount = Number(query.amount ?? 0);
  const bookingReference = String(query.booking ?? "");
  const returnUrl = String(query.return ?? "/");

  if (!reference || !amount) notFound();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="border border-parchment-300 bg-white">
        <div className="border-b border-parchment-300 bg-parchment-100 px-5 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
            Simulated payment gateway
          </p>
          <p className="text-sm text-ink-700">Development environment only</p>
        </div>

        <div className="px-5 py-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Booking</dt>
              <dd className="font-mono">{bookingReference}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Reference</dt>
              <dd className="font-mono text-xs">{reference}</dd>
            </div>
            <div className="flex justify-between border-t border-parchment-200 pt-2">
              <dt className="font-medium">Amount due</dt>
              <dd className="tabular text-lg font-semibold">
                {new Intl.NumberFormat("en-ZA", {
                  style: "currency",
                  currency: "ZAR",
                }).format(amount / 100)}
              </dd>
            </div>
          </dl>

          <MockPaymentForm
            reference={reference}
            amountCents={amount}
            returnUrl={returnUrl}
          />
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-ink-500">
        No real payment is taken. Choosing an outcome delivers a signed callback to
        the webhook endpoint, exactly as a live gateway would.
      </p>
    </div>
  );
}
