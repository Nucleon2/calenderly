import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/server/auth/session";
import { ScheduleEditor } from "@/components/availability/schedule-editor";
import { ScheduleNotFoundError } from "@/server/availability/errors";
import { getSchedule } from "@/server/availability/service";

export const metadata: Metadata = {
  title: "Edit schedule",
};

type AvailabilityScheduleEditorPageProps = {
  params: Promise<{ scheduleId: string }>;
};

export default async function AvailabilityScheduleEditorPage({ params }: AvailabilityScheduleEditorPageProps) {
  const { scheduleId } = await params;
  const user = await requireOnboardedUser();

  let schedule;
  try {
    schedule = await getSchedule(user.id, scheduleId);
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <ScheduleEditor schedule={schedule} weekStart={(user.weekStart ?? 0) as 0 | 1 | 6} />
    </div>
  );
}
