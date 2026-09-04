import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingConfirmation } from "@/components/booking/booking-confirmation";
import { formatInTz } from "@/lib/time";
import { getBookingByUid } from "@/server/bookings/service";

type BookingStatusPageProps = {
  params: Promise<{ uid: string }>;
  searchParams: Promise<{ rescheduled?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: BookingStatusPageProps): Promise<Metadata> {
  const { uid } = await params;
  const booking = await getBookingByUid(uid);
  return {
    title: booking ? `${booking.eventType.title} with ${booking.host.name}` : "Booking",
    robots: { index: false, follow: false },
  };
}

export default async function BookingStatusPage({ params, searchParams }: BookingStatusPageProps) {
  const { uid } = await params;
  const { rescheduled } = await searchParams;

  const booking = await getBookingByUid(uid);
  if (!booking) notFound();

  if (booking.status === "confirmed" || booking.status === "pending") {
    return <BookingConfirmation booking={booking} rescheduled={rescheduled === "1"} />;
  }

  if (booking.status === "cancelled") {
    const bookAgainHref = `/${booking.host.username}/${booking.eventType.slug}`;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 data-testid="booking-cancelled-heading" className="text-lg font-semibold text-foreground">
          This booking was cancelled
        </h1>
        <p className="text-sm text-muted-foreground">
          {booking.eventType.title} with {booking.host.name} on{" "}
          {formatInTz(new Date(booking.startUtc), booking.inviteeTimezone, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        {booking.cancelReason && (
          <p className="max-w-sm text-sm text-muted-foreground">Reason: {booking.cancelReason}</p>
        )}
        <Link href={bookAgainHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Book another time
        </Link>
      </div>
    );
  }

  // status === "rescheduled"
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-semibold text-foreground">This booking was rescheduled</h1>
      <p className="text-sm text-muted-foreground">
        {booking.eventType.title} with {booking.host.name} has been moved to a new time.
      </p>
      {booking.rescheduledToUid && (
        <Link
          href={`/booking/${booking.rescheduledToUid}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          View the new booking
        </Link>
      )}
    </div>
  );
}
