import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { PageHero } from "@/components/PageHero";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const session = await getSession();
  const query = await searchParams;
  const next = typeof query.next === "string" ? query.next : "/";

  if (session) redirect(next);

  return (
    <>
      <PageHero title="Sign in" />
      <div className="mx-auto max-w-md px-4 py-14">
      <AuthForm mode="signin" next={next} />
      <p className="mt-4 text-sm text-ink-500">
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
