"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { UsernameTakenError } from "@/server/users/errors";
import { onboardingSchema, usernameSchema } from "@/server/users/schema";
import { completeOnboarding, isUsernameAvailable } from "@/server/users/service";

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

/**
 * Validates and applies the onboarding form, then redirects to the
 * dashboard. `redirect()` throws internally, so it's called after the
 * try/catch rather than inside it.
 */
export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const sessionUser = await requireUser();

  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Please check the form and try again.",
      field: issue?.path[0]?.toString(),
    };
  }

  try {
    await completeOnboarding(sessionUser.id, parsed.data);
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return { ok: false, error: "That username is already taken.", field: "username" };
    }
    throw error;
  }

  redirect("/dashboard/event-types");
}

export interface UsernameCheckResult {
  available: boolean;
  error?: string;
}

/** Debounced live availability check used by `UsernameField`. */
export async function checkUsernameAction(username: string): Promise<UsernameCheckResult> {
  const sessionUser = await requireUser();

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return { available: false, error: parsed.error.issues[0]?.message };
  }

  const available = await isUsernameAvailable(parsed.data, sessionUser.id);
  return { available };
}
