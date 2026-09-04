import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "./auth";

export type SessionUser = Session["user"];

/** Current session or null. Safe to call from server components, layouts and actions. */
export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** Redirects to /sign-in when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

/** Redirects to /sign-in when unauthenticated and to /onboarding until onboarding is complete. */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.onboardingCompletedAt || !user.username) redirect("/onboarding");
  return user;
}
