"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/server/auth/session";
import { CannotDeleteDefaultScheduleError, ScheduleNotFoundError } from "@/server/availability/errors";
import { createScheduleSchema, updateScheduleSchema } from "@/server/availability/schema";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  setDefaultSchedule,
  updateSchedule,
} from "@/server/availability/service";

export type ActionResult = { ok: true } | { ok: false; error: string; field?: string };

/**
 * Creates a new schedule named "New schedule" that copies the current
 * default schedule's time zone (falling back to the user's own time zone),
 * then redirects to its editor. `redirect()` throws internally, so it's
 * called after the try/catch rather than inside it.
 */
export async function createScheduleAction(): Promise<ActionResult> {
  const sessionUser = await requireOnboardedUser();

  const schedules = await listSchedules(sessionUser.id);
  const defaultSchedule = schedules.find((schedule) => schedule.isDefault);
  const timezone = defaultSchedule?.timezone ?? sessionUser.timezone ?? "UTC";

  const parsed = createScheduleSchema.safeParse({ name: "New schedule", timezone });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Could not create a new schedule." };
  }

  const schedule = await createSchedule(sessionUser.id, parsed.data);

  revalidatePath("/dashboard/availability");
  redirect(`/dashboard/availability/${schedule.id}`);
}

export async function updateScheduleAction(scheduleId: string, input: unknown): Promise<ActionResult> {
  const sessionUser = await requireOnboardedUser();

  const parsed = updateScheduleSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Please check the form and try again.",
      field: issue?.path.join(".").toString(),
    };
  }

  try {
    await updateSchedule(sessionUser.id, scheduleId, parsed.data);
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return { ok: false, error: "This schedule no longer exists." };
    }
    throw error;
  }

  revalidatePath("/dashboard/availability");
  revalidatePath(`/dashboard/availability/${scheduleId}`);
  return { ok: true };
}

/** Deletes the schedule, then redirects back to the list. Refuses to delete
 * the user's default schedule. */
export async function deleteScheduleAction(scheduleId: string): Promise<ActionResult> {
  const sessionUser = await requireOnboardedUser();

  try {
    await deleteSchedule(sessionUser.id, scheduleId);
  } catch (error) {
    if (error instanceof CannotDeleteDefaultScheduleError) {
      return {
        ok: false,
        error: "You can't delete your default schedule. Set another schedule as default first.",
      };
    }
    if (error instanceof ScheduleNotFoundError) {
      return { ok: false, error: "This schedule no longer exists." };
    }
    throw error;
  }

  revalidatePath("/dashboard/availability");
  redirect("/dashboard/availability");
}

export async function setDefaultScheduleAction(scheduleId: string): Promise<ActionResult> {
  const sessionUser = await requireOnboardedUser();

  try {
    await setDefaultSchedule(sessionUser.id, scheduleId);
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return { ok: false, error: "This schedule no longer exists." };
    }
    throw error;
  }

  revalidatePath("/dashboard/availability");
  revalidatePath(`/dashboard/availability/${scheduleId}`);
  return { ok: true };
}
