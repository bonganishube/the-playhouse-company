import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { PageHero } from "@/components/PageHero";
import { getVerifiedSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  // Verified against the database, not merely decoded. A signed, unexpired
  // token can still name a user who has since been deleted or deactivated, and
  // trusting it here bounces the visitor straight back to the page that sent
  // them, which sends them back here: an endless redirect that leaves them no
  // way to sign in and no way to sign out. Treating a dead token as signed out
  // renders the form instead, and signing in replaces the stale cookie.
  const session = await getVerifiedSession();
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : "/";
  const email = typeof query.email === "string" ? query.email : undefined;

  if (session) redirect(next);

  return (
    <>
      <PageHero title="Sign in" />
      <div className="mx-auto max-w-md px-4 py-14">
      <AuthForm mode="signin" next={next} email={email} />
      <p className="mt-4 text-sm text-ink-500">
        <Link href="/forgot-password" className="text-brand-600 underline">
          Forgot your password?
        </Link>{" "}
        Booked as a guest and never set one? Use the same link.
      </p>
      <p className="mt-2 text-sm text-ink-500">
        No account yet?{" "}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="text-brand-600 underline"
        >
          Create one
        </Link>
        .
      </p>
      </div>
    </>
  );
}
