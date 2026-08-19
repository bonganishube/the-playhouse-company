import { notFound, redirect } from "next/navigation";
import { PageHero } from "@/components/PageHero";
import { getSession, isStaffRole } from "@/lib/auth";
import { rebuildCheckout } from "@/lib/booking";
import { OUTCOME_TOKEN_PARAM, tokenMatchesAnyPayment } from "@/lib/paymentAccess";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = { title: "Redirecting to payment" };

/**
 * Hand-off page for gateways that require a signed form POST (PayFast).
 *
 * The form is submitted automatically; a visible button is retained so the
 * flow still completes without JavaScript and so the customer is never left
 * on a blank screen if the redirect is slow.
 */
export default async function CheckoutRedirectPage({
  params,
  searchParams,
}: PageProps<"/checkout/redirect/[reference]">) {
  const { reference } = await params;
  const query = await searchParams;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: {
      id: true,
      userId: true,
      payments: { select: { reference: true } },
    },
  });
  if (!booking) notFound();

  // This page starts a payment where none is in flight, so it cannot be left
  // open to anyone who guesses a booking reference. The customer's own session
  // authorises it, and so does the proof carried back from the payment
  // provider, which is what a guest retrying a declined card will be holding.
  const session = await getSession();
  const presented =
    typeof query[OUTCOME_TOKEN_PARAM] === "string"
      ? query[OUTCOME_TOKEN_PARAM]
      : undefined;
  const permitted =
    (session && (session.id === booking.userId || isStaffRole(session.role))) ||
    tokenMatchesAnyPayment(
      presented,
      booking.payments.map((p) => p.reference),
    );
  if (!permitted) {
    redirect(`/signin?next=${encodeURIComponent(`/booking/${reference}`)}`);
  }

  const { checkout } = await rebuildCheckout(booking.id);

  if (checkout.kind === "redirect") {
    // Nothing to sign, send the customer straight on.
    return (
      <>
        <PageHero title="Redirecting to payment" />
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-ink-700">Redirecting you to the payment page…</p>
        <a href={checkout.url} className="mt-4 inline-block text-brand-600 underline">
          Continue to payment
        </a>
        <meta httpEquiv="refresh" content={`0;url=${checkout.url}`} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHero title="Redirecting to payment" />
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl">Redirecting you to payment</h1>
      <p className="mt-2 text-sm text-ink-500">
        You are being taken to our payment provider to complete your booking
        securely. If nothing happens, use the button below.
      </p>

      <form
        id="gateway-form"
        method="POST"
        action={checkout.url}
        className="mt-6"
      >
        {Object.entries(checkout.fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          type="submit"
          className="bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
        >
          Continue to payment
        </button>
      </form>

      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("gateway-form").submit();`,
        }}
      />
      </div>
    </>
  );
}
