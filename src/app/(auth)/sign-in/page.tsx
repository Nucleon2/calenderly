import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { isGoogleConfigured } from "@/lib/env";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in — Scheduler",
};

type SignInPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const { next } = await searchParams;
  const callbackURL = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  return <SignInForm googleEnabled={isGoogleConfigured()} callbackURL={callbackURL} />;
}
