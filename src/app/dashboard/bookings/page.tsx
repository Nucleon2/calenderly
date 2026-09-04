import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = {
  title: "Bookings",
};

export default function BookingsPage() {
  return (
    <>
      <PageHeader
        title="Bookings"
        description="See and manage the meetings people have booked with you."
      />
      <EmptyState
        icon={CalendarClock}
        title="Bookings — coming in the next milestone"
        description="Upcoming, past, and canceled bookings will show up here once scheduling goes live."
      />
    </>
  );
}
