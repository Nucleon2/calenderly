import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { EventTypeForm } from "@/components/event-types/event-type-form";
import { env } from "@/lib/env";
import { requireOnboardedUser } from "@/server/auth/session";
import type { EventTypeInputData } from "@/server/event-types/schema";
import { listSchedulesForPicker } from "@/server/event-types/service";

export const metadata: Metadata = {
  title: "New event type",
};

export default async function NewEventTypePage() {
  const user = await requireOnboardedUser();
  const schedules = await listSchedulesForPicker(user.id);
  const defaultSchedule = schedules.find((s) => s.isDefault) ?? null;
  const urlPrefix = `${env.APP_URL.replace(/^https?:\/\//, "")}/${user.username}/`;

  const defaultValues: EventTypeInputData = {
    title: "",
    slug: "",
    description: "",
    durationMinutes: 30,
    color: "#0069ff",
    locationType: "google_meet",
    locationDetails: {},
    scheduleId: defaultSchedule?.id ?? null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 120,
    slotIntervalMinutes: null,
    maxBookingsPerDay: null,
    dateRangeType: "rolling",
    dateRangeDays: 60,
    dateRangeFrom: null,
    dateRangeTo: null,
    isSecret: false,
    requiresConfirmation: false,
    reminderOffsetsMinutes: [1440, 60],
    questions: [],
  };

  return (
    <>
      <PageHeader title="New event type" description="Set up a new kind of meeting people can book with you." />
      <EventTypeForm mode="create" defaultValues={defaultValues} schedules={schedules} urlPrefix={urlPrefix} />
    </>
  );
}
