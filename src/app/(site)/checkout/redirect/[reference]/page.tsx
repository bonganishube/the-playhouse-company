import { notFound } from "next/navigation";
import { rebuildCheckout } from "@/lib/booking";
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
}: PageProps<"/checkout/redirect/[reference]">) {
  const { reference } = await params;

  const booking = await prisma.booking.findUnique({
    where: { reference },
    select: { id: true },
  });
  if (!booking) notFound();

  const { checkout } = await rebuildCheckout(booking.id);

  if (checkout.kind === "redirect") {
    // Nothing to sign — send the customer straight on.
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-ink-700">Redirecting you to the payment page…</p>
        <a href={checkout.url} className="mt-4 inline-block text-brand-600 underline">
          Continue to payment
        </a>
        <meta httpEquiv="refresh" content={`0;url=${checkout.url}`} />
      </div>
    );
  }

  return (
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
  );
}
