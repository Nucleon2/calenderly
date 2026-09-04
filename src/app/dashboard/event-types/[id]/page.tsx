import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { EventTypeForm } from "@/components/event-types/event-type-form";
import { env } from "@/lib/env";
import { requireOnboardedUser } from "@/server/auth/session";
import { EventTypeNotFoundError } from "@/server/event-types/errors";
import type { EventTypeInputData } from "@/server/event-types/schema";
import { getEventType, listSchedulesForPicker } from "@/server/event-types/service";

export const metadata: Metadata = {
  title: "Edit event type",
};

type EditEventTypePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditEventTypePage({ params }: EditEventTypePageProps) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const schedules = await listSchedulesForPicker(user.id);

  let eventType;
  try {
    eventType = await getEventType(user.id, id);
  } catch (error) {
    if (error instanceof EventTypeNotFoundError) {
      notFound();
    }
    throw error;
  }

  const urlPrefix = `${env.APP_URL.replace(/^https?:\/\//, "")}/${user.username}/`;

  const defaultValues: EventTypeInputData = {
    title: eventType.title,
    slug: eventType.slug,
    description: eventType.description ?? "",
    durationMinutes: eventType.durationMinutes,
    color: eventType.color,
    locationType: eventType.locationType,
    locationDetails: eventType.locationDetails ?? {},
    scheduleId: eventType.scheduleId,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes,
    bufferAfterMinutes: eventType.bufferAfterMinutes,
    minNoticeMinutes: eventType.minNoticeMinutes,
    slotIntervalMinutes: eventType.slotIntervalMinutes,
    maxBookingsPerDay: eventType.maxBookingsPerDay,
    dateRangeType: eventType.dateRangeType,
    dateRangeDays: eventType.dateRangeDays,
    dateRangeFrom: eventType.dateRangeFrom,
    dateRangeTo: eventType.dateRangeTo,
    isSecret: eventType.isSecret,
    requiresConfirmation: eventType.requiresConfirmation,
    reminderOffsetsMinutes: eventType.reminderOffsetsMinutes,
    questions: eventType.questions.map((q) => ({
      id: q.id,
      type: q.type,
      label: q.label,
      required: q.required,
      options: q.options ?? undefined,
      position: q.position,
    })),
  };

  return (
    <>
      <PageHeader title="Edit event type" description={`Editing "${eventType.title}"`} />
      <EventTypeForm
        mode="edit"
        eventTypeId={eventType.id}
        defaultValues={defaultValues}
        schedules={schedules}
        urlPrefix={urlPrefix}
      />
    </>
  );
}
