"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/server/auth/session";
import {
  connectGoogleCalendar,
  disconnectCalendar,
  refreshCalendarList,
  setDestinationCalendar,
  updateSelectedCalendars,
  type CalendarConnectionView,
} from "@/server/calendar/service";
import {
  CalendarNotConnectedError,
  CalendarReauthRequiredError,
  GoogleNotConfiguredError,
} from "@/server/calendar/errors";
import { setDestinationCalendarSchema, updateSelectedCalendarsSchema } from "@/server/calendar/schema";

export type CalendarActionResult =
  | { ok: true; connection: CalendarConnectionView }
  | { ok: false; error: string; reauthRequired?: boolean };

export type DisconnectActionResult = { ok: true } | { ok: false; error: string };

const CALENDARS_PATH = "/dashboard/settings/calendars";

/**
 * Maps the service's errors onto a client-safe result instead of leaking a 500. The service
 * throws its typed errors for connection-state problems, but plain `Error`s for expected
 * validation failures (e.g. picking a calendar that isn't writable) — both need to reach the
 * user as a toast, so any `Error` is treated as a safe, displayable message; only a genuinely
 * unexpected (non-`Error`) throw is left to propagate.
 */
function toActionError(error: unknown): CalendarActionResult {
  if (error instanceof CalendarReauthRequiredError) {
    return {
      ok: false,
      error: "Google needs you to reconnect to grant calendar access again.",
      reauthRequired: true,
    };
  }
  if (error instanceof CalendarNotConnectedError) {
    return { ok: false, error: "Connect a Google Calendar first." };
  }
  if (error instanceof GoogleNotConfiguredError) {
    return { ok: false, error: "Google Calendar isn't configured on this server." };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  throw error;
}

/**
 * Finishes linking Google Calendar. The page calls `connectGoogleCalendar` directly on the
 * `?connected=1` redirect landing; this action exists for a client-triggered retry (e.g. a "Try
 * again" button) after a non-reauth failure, without sending the user through OAuth again.
 */
export async function finishGoogleConnectionAction(): Promise<CalendarActionResult> {
  const user = await requireOnboardedUser();
  try {
    const connection = await connectGoogleCalendar(user.id);
    revalidatePath(CALENDARS_PATH);
    return { ok: true, connection };
  } catch (error) {
    return toActionError(error);
  }
}

export async function refreshCalendarsAction(): Promise<CalendarActionResult> {
  const user = await requireOnboardedUser();
  try {
    const connection = await refreshCalendarList(user.id);
    revalidatePath(CALENDARS_PATH);
    return { ok: true, connection };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSelectedCalendarsAction(input: unknown): Promise<CalendarActionResult> {
  const user = await requireOnboardedUser();

  const parsed = updateSelectedCalendarsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your selection and try again." };
  }

  try {
    const connection = await updateSelectedCalendars(user.id, parsed.data);
    revalidatePath(CALENDARS_PATH);
    return { ok: true, connection };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setDestinationCalendarAction(input: unknown): Promise<CalendarActionResult> {
  const user = await requireOnboardedUser();

  const parsed = setDestinationCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Choose a valid calendar." };
  }

  try {
    const connection = await setDestinationCalendar(user.id, parsed.data);
    revalidatePath(CALENDARS_PATH);
    return { ok: true, connection };
  } catch (error) {
    return toActionError(error);
  }
}

export async function disconnectCalendarAction(): Promise<DisconnectActionResult> {
  const user = await requireOnboardedUser();
  try {
    await disconnectCalendar(user.id);
    revalidatePath(CALENDARS_PATH);
    return { ok: true };
  } catch (error) {
    if (error instanceof CalendarNotConnectedError) {
      return { ok: true };
    }
    throw error;
  }
}
