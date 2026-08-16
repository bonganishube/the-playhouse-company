import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { PageHero } from "@/components/PageHero";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const session = await getSession();
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : "/";

  if (session) redirect(next);

  return (
    <>
      <PageHero
        title="Create an account"
        lead="An account lets you track your bookings and reuse your details at checkout."
      />
      <div className="mx-auto max-w-md px-4 py-14">
      <AuthForm mode="register" next={next} />
      <p className="mt-4 text-sm text-ink-500">
        Already registered?{" "}
        <Link
          href={`/signin?next=${encodeURIComponent(next)}`}
          className="text-brand-600 underline"
        >
          Sign in
        </Link>
        .
      </p>
      </div>
    </>
  );
}
