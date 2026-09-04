"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/server/auth/session";
import { UsernameTakenError } from "@/server/users/errors";
import { profileSchema } from "@/server/users/schema";
import { updateProfile } from "@/server/users/service";

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  const sessionUser = await requireOnboardedUser();

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Please check the form and try again.",
      field: issue?.path[0]?.toString(),
    };
  }

  try {
    await updateProfile(sessionUser.id, parsed.data);
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      return { ok: false, error: "That username is already taken.", field: "username" };
    }
    throw error;
  }

  revalidatePath("/dashboard/settings/profile");
  return { ok: true };
}
