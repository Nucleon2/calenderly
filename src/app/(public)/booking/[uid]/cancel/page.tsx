import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelForm } from "@/components/booking/cancel-form";
import { formatInTz } from "@/lib/time";
import { getBookingByUid } from "@/server/bookings/service";
import { cancelBookingAction } from "./actions";

type CancelBookingPageProps = {
  params: Promise<{ uid: string }>;
};

export async function generateMetadata({ params }: CancelBookingPageProps): Promise<Metadata> {
  const { uid } = await params;
  const booking = await getBookingByUid(uid);
  return {
    title: booking ? `Cancel — ${booking.eventType.title} with ${booking.host.name}` : "Cancel booking",
    robots: { index: false, follow: false },
  };
}

export default async function CancelBookingPage({ params }: CancelBookingPageProps) {
  const { uid } = await params;
  const booking = await getBookingByUid(uid);
  if (!booking) notFound();

  if (booking.status !== "confirmed") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-lg font-semibold text-foreground">This booking can&apos;t be cancelled</h1>
        <p className="text-sm text-muted-foreground">
          {booking.status === "cancelled"
            ? "It was already cancelled."
            : "It has already been rescheduled."}
        </p>
        <Link href={`/booking/${uid}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          View booking status
        </Link>
      </div>
    );
  }

  const boundCancel = cancelBookingAction.bind(null, uid);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-lg font-semibold text-foreground">Cancel this event?</h1>
        <p className="text-sm text-muted-foreground">{booking.eventType.title} with {booking.host.name}</p>
        <p className="text-sm text-muted-foreground">
          {formatInTz(new Date(booking.startUtc), booking.inviteeTimezone, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          {" · "}
          {formatInTz(new Date(booking.startUtc), booking.inviteeTimezone, { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
      <CancelForm onCancel={boundCancel} />
    </div>
  );
}
