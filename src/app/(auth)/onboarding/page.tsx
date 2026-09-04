import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { OnboardingForm } from "@/components/settings/onboarding-form";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Set up your account",
};

const COMBINING_MARKS_RE = /[̀-ͯ]/g;

/** A best-effort username suggestion derived from the account's name or email. */
function suggestUsername(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "user";
  const slug = source
    .normalize("NFKD")
    .replace(COMBINING_MARKS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 30) || "user";
}

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingCompletedAt && user.username) {
    redirect("/dashboard");
  }

  const urlPrefix = `${env.APP_URL.replace(/^https?:\/\//, "")}/`;

  return (
    <OnboardingForm
      defaultName={user.name}
      defaultUsername={user.username ?? suggestUsername(user.name, user.email)}
      defaultTimezone={user.timezone ?? "UTC"}
      urlPrefix={urlPrefix}
    />
  );
}
