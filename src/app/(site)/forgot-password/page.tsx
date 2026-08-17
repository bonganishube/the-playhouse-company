import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { RequestResetForm } from "@/components/PasswordForms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const query = await searchParams;
  const email = typeof query.email === "string" ? query.email : "";

  return (
    <>
      <PageHero
        title="Set your password"
        lead="We will email you a link to choose a new one."
      />
      <div className="mx-auto max-w-md px-4 py-14">
        {/* Named for both audiences. Anyone who booked as a guest has an
            account they never chose a password for, and this is how they
            reach it. */}
        <p className="mb-6 text-sm text-ink-500">
          Booked as a guest? You have an account already. Use the address you
          booked with and we will send you a link to set a password, so you can
          view your bookings and settle any balance.
        </p>

        <RequestResetForm defaultEmail={email} />

        <p className="mt-6 text-sm text-ink-500">
          Remembered it?{" "}
          <Link href="/signin" className="text-brand-600 underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    </>
  );
}
