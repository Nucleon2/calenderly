import type { Metadata } from "next";
import { requireOnboardedUser } from "@/server/auth/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { ScheduleList } from "@/components/availability/schedule-list";
import { listSchedules } from "@/server/availability/service";

export const metadata: Metadata = {
  title: "Availability",
};

export default async function AvailabilityPage() {
  const user = await requireOnboardedUser();
  const schedules = await listSchedules(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Availability" description="Set the hours you're available to be booked, per schedule." />
      <ScheduleList schedules={schedules} />
    </div>
  );
}
