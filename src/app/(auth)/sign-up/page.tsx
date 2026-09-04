import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { isGoogleConfigured } from "@/lib/env";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create account — Scheduler",
};

export default async function SignUpPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return <SignUpForm googleEnabled={isGoogleConfigured()} />;
}
