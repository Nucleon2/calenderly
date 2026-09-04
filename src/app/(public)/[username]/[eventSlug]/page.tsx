import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidTimeZone, localMinutesToUtc, todayInTz } from "@/lib/time";
import { BookingPage } from "@/components/booking/booking-page";
import { getEventTypeBySlug } from "@/server/event-types/service";
import { getBookingByUid } from "@/server/bookings/service";
import { getSlotsForEventType } from "@/server/bookings/slots-service";

type EventBookingPageProps = {
  params: Promise<{ username: string; eventSlug: string }>;
  searchParams: Promise<{ month?: string; date?: string; tz?: string; reschedule?: string }>;
};

function firstOfMonth(monthParam: string | undefined, fallbackToday: string): string {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    return `${monthParam}-01`;
  }
  return `${fallbackToday.slice(0, 7)}-01`;
}

function lastOfMonth(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const days = new Date(y!, m!, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
}

async function loadEventType(username: string, eventSlug: string) {
  return getEventTypeBySlug(username, eventSlug);
}

export async function generateMetadata({ params }: EventBookingPageProps): Promise<Metadata> {
  const { username, eventSlug } = await params;
  const eventType = await loadEventType(username, eventSlug);
  if (!eventType) return {};
  return { title: `${eventType.title} with ${eventType.owner.name}` };
}

export default async function EventBookingPage({ params, searchParams }: EventBookingPageProps) {
  const { username, eventSlug } = await params;
  const search = await searchParams;

  const eventType = await loadEventType(username, eventSlug);
  if (!eventType) notFound();

  const hasExplicitTimezone = !!search.tz && isValidTimeZone(search.tz);
  const timezone = hasExplicitTimezone ? search.tz! : eventType.owner.timezone;

  const today = todayInTz(new Date(), timezone);
  const monthStart = firstOfMonth(search.month, today);
  const monthEnd = lastOfMonth(monthStart);

  let rescheduleUid: string | undefined;
  let formerTime: { start: string; end: string } | null = null;
  let rescheduleBlocked: string | null = null;

  if (search.reschedule) {
    const booking = await getBookingByUid(search.reschedule);
    if (!booking) {
      rescheduleBlocked = "That booking could not be found.";
    } else if (booking.status !== "confirmed") {
      rescheduleBlocked =
        booking.status === "cancelled"
          ? "This booking was already cancelled, so it can't be rescheduled."
          : "This booking was already rescheduled.";
    } else {
      rescheduleUid = booking.uid;
      formerTime = {
        start: new Date(booking.startUtc).toISOString(),
        end: new Date(booking.endUtc).toISOString(),
      };
    }
  }

  if (rescheduleBlocked) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-lg font-semibold text-foreground">Can&apos;t reschedule this booking</h1>
        <p className="text-sm text-muted-foreground">{rescheduleBlocked}</p>
      </div>
    );
  }

  const slots = await getSlotsForEventType({
    eventTypeId: eventType.id,
    rangeStart: localMinutesToUtc(monthStart, 0, timezone),
    rangeEnd: localMinutesToUtc(monthEnd, 1440, timezone),
    inviteeTimezone: timezone,
    excludeBookingUid: rescheduleUid,
  });

  return (
    <BookingPage
      eventType={{
        id: eventType.id,
        title: eventType.title,
        description: eventType.description,
        durationMinutes: eventType.durationMinutes,
        locationType: eventType.locationType,
        locationDetails: eventType.locationDetails,
        questions: eventType.questions.map((q) => ({
          id: q.id,
          type: q.type,
          label: q.label,
          required: q.required,
          options: q.options,
        })),
      }}
      host={{
        name: eventType.owner.name,
        username: eventType.owner.username,
        image: eventType.owner.image,
        timezone: eventType.owner.timezone,
        weekStart: 0,
      }}
      initialMonth={monthStart}
      initialTimezone={timezone}
      hasExplicitTimezone={hasExplicitTimezone}
      initialSlotsByDate={slots.slotsByDate}
      rescheduleUid={rescheduleUid}
      formerTime={formerTime}
    />
  );
}
