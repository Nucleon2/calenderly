import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBookingByUid } from "@/server/bookings/service";

type ReschedulePageProps = {
  params: Promise<{ uid: string }>;
};

export async function generateMetadata({ params }: ReschedulePageProps): Promise<Metadata> {
  const { uid } = await params;
  const booking = await getBookingByUid(uid);
  return {
    title: booking ? `Reschedule — ${booking.eventType.title} with ${booking.host.name}` : "Reschedule booking",
    robots: { index: false, follow: false },
  };
}

/**
 * Reschedule mode reuses the regular booking picker at
 * `/{username}/{eventSlug}?reschedule={uid}` — that page already handles
 * validating the old booking's state (must be `confirmed`) and rendering a
 * message otherwise, so this route just resolves the event and redirects.
 */
export default async function ReschedulePage({ params }: ReschedulePageProps) {
  const { uid } = await params;
  const booking = await getBookingByUid(uid);
  if (!booking) notFound();

  redirect(`/${booking.host.username}/${booking.eventType.slug}?reschedule=${uid}`);
}
