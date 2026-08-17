import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { ResetPasswordForm } from "@/components/PasswordForms";
import { Alert, ButtonLink } from "@/components/ui";
import { checkResetToken } from "@/lib/passwordReset";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Choose a password" };

export default async function ResetPasswordPage({
  params,
  searchParams,
}: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : undefined;

  // Checked before the form is shown, so an expired link says so plainly
  // rather than rejecting a password the customer has already chosen.
  const check = await checkResetToken(token);

  if (!check.ok) {
    const message =
      check.reason === "expired"
        ? "This link has expired. Reset links are short-lived for security."
        : check.reason === "used"
          ? "This link has already been used. If you still need access, request a new one."
          : "This link is not valid. It may have been mistyped or already replaced.";

    return (
      <>
        <PageHero title="Link no longer valid" />
        <div className="mx-auto max-w-md px-4 py-14">
          <Alert tone="warning">{message}</Alert>
          <div className="mt-6">
            <ButtonLink href="/forgot-password">Request a new link</ButtonLink>
          </div>
        </div>
      </>
    );
  }

  // A customer whose account came from guest checkout is choosing a password
  // for the first time; the copy should not call that a reset.
  const bookings = await prisma.booking.count({ where: { userId: check.userId } });
  const firstTime = bookings > 0;

  return (
    <>
      <PageHero
        title={firstTime ? "Choose a password" : "Set a new password"}
        lead={check.email}
      />
      <div className="mx-auto max-w-md px-4 py-14">
        <ResetPasswordForm token={token} next={next} firstTime={firstTime} />
        <p className="mt-6 text-sm text-ink-500">
          Changed your mind?{" "}
          <Link href="/" className="text-brand-600 underline">
            Return to the site
          </Link>
          .
        </p>
      </div>
    </>
  );
}
