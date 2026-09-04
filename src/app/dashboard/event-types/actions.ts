"use server";

import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/server/auth/session";
import { EventTypeHasBookingsError, EventTypeNotFoundError, SlugTakenError } from "@/server/event-types/errors";
import { eventTypeInputSchema } from "@/server/event-types/schema";
import {
  createEventType,
  deleteEventType,
  duplicateEventType,
  reorderEventTypes,
  setEventTypeActive,
  updateEventType,
} from "@/server/event-types/service";

export type EventTypeActionResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string; field?: string };

export type SimpleActionResult =
  | { ok: true }
  | { ok: false; error: string; hasBookings?: boolean };

const EVENT_TYPES_PATH = "/dashboard/event-types";

function parseOrError(input: unknown): { data: ReturnType<typeof eventTypeInputSchema.parse> } | { error: EventTypeActionResult } {
  const parsed = eventTypeInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: {
        ok: false,
        error: issue?.message ?? "Please check the form and try again.",
        field: issue?.path[0]?.toString(),
      },
    };
  }
  return { data: parsed.data };
}

export async function createEventTypeAction(input: unknown): Promise<EventTypeActionResult> {
  const user = await requireOnboardedUser();

  const result = parseOrError(input);
  if ("error" in result) return result.error;

  try {
    const eventType = await createEventType(user.id, result.data);
    revalidatePath(EVENT_TYPES_PATH);
    return { ok: true, id: eventType.id, slug: eventType.slug };
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return { ok: false, error: "That URL is already taken. Try a different one.", field: "slug" };
    }
    throw error;
  }
}

export async function updateEventTypeAction(id: string, input: unknown): Promise<EventTypeActionResult> {
  const user = await requireOnboardedUser();

  const result = parseOrError(input);
  if ("error" in result) return result.error;

  try {
    const eventType = await updateEventType(user.id, id, result.data);
    revalidatePath(EVENT_TYPES_PATH);
    return { ok: true, id: eventType.id, slug: eventType.slug };
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return { ok: false, error: "That URL is already taken. Try a different one.", field: "slug" };
    }
    if (error instanceof EventTypeNotFoundError) {
      return { ok: false, error: "This event type no longer exists." };
    }
    throw error;
  }
}

export async function deleteEventTypeAction(id: string): Promise<SimpleActionResult> {
  const user = await requireOnboardedUser();

  try {
    await deleteEventType(user.id, id);
    revalidatePath(EVENT_TYPES_PATH);
    return { ok: true };
  } catch (error) {
    if (error instanceof EventTypeHasBookingsError) {
      return {
        ok: false,
        error: "This event type has bookings and can't be deleted. Deactivate it instead.",
        hasBookings: true,
      };
    }
    if (error instanceof EventTypeNotFoundError) {
      return { ok: false, error: "This event type no longer exists." };
    }
    throw error;
  }
}

export async function duplicateEventTypeAction(id: string): Promise<EventTypeActionResult> {
  const user = await requireOnboardedUser();

  try {
    const eventType = await duplicateEventType(user.id, id);
    revalidatePath(EVENT_TYPES_PATH);
    return { ok: true, id: eventType.id, slug: eventType.slug };
  } catch (error) {
    if (error instanceof EventTypeNotFoundError) {
      return { ok: false, error: "This event type no longer exists." };
    }
    throw error;
  }
}

export async function setEventTypeActiveAction(id: string, active: boolean): Promise<SimpleActionResult> {
  const user = await requireOnboardedUser();

  try {
    await setEventTypeActive(user.id, id, active);
    revalidatePath(EVENT_TYPES_PATH);
    return { ok: true };
  } catch (error) {
    if (error instanceof EventTypeNotFoundError) {
      return { ok: false, error: "This event type no longer exists." };
    }
    throw error;
  }
}

export async function reorderEventTypesAction(orderedIds: string[]): Promise<SimpleActionResult> {
  const user = await requireOnboardedUser();

  try {
    await reorderEventTypes(user.id, orderedIds);
    revalidatePath(EVENT_TYPES_PATH);
    return { ok: true };
  } catch (error) {
    if (error instanceof EventTypeNotFoundError) {
      return { ok: false, error: "Couldn't reorder — the list changed. Refresh and try again." };
    }
    throw error;
  }
}
