import { CalendarSync } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = {
  title: "Calendar connections",
};

export default function CalendarConnectionsPage() {
  return (
    <>
      <PageHeader
        title="Calendar connections"
        description="Connect calendars to keep your availability in sync and avoid double bookings."
      />
      <EmptyState
        icon={CalendarSync}
        title="Calendar connections — coming soon"
        description="You'll be able to connect Google Calendar and other providers from here."
      />
    </>
  );
}
