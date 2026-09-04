import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/dashboard/copy-button";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar-links";
import { formatInTz, tzOffsetLabel } from "@/lib/time";
import { describeLocation } from "@/server/bookings/view-model";
import type { BookingDetail } from "@/server/bookings/service";

export interface BookingConfirmationProps {
  booking: BookingDetail;
  /** True when this booking was just created via a reschedule. */
  rescheduled?: boolean;
}

export function BookingConfirmation({ booking, rescheduled = false }: BookingConfirmationProps) {
  const start = new Date(booking.startUtc);
  const end = new Date(booking.endUtc);
  const tz = booking.inviteeTimezone;
  const hostTz = booking.host.timezone;

  const dayLabel = formatInTz(start, tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const timeLabel = `${formatInTz(start, tz, { hour: "numeric", minute: "2-digit" })} – ${formatInTz(end, tz, { hour: "numeric", minute: "2-digit" })}`;
  const offsetLabel = tzOffsetLabel(start, tz);

  const locationText = describeLocation(booking.locationType, booking.locationValue, booking.meetingUrl);

  const calendarDetails = [booking.eventType.description || undefined, `Manage this booking: ${booking.urls.manage}`]
    .filter((line): line is string => !!line)
    .join("\n\n");

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400">
        <CheckCircle2 className="size-7" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-1">
        <h1 data-testid="booking-confirmation-heading" className="text-xl font-semibold tracking-tight text-foreground">
          {rescheduled ? "You're rescheduled" : "You are scheduled"}
        </h1>
        <p className="text-sm text-muted-foreground">
          A confirmation email is on its way to {booking.inviteeEmail}.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-border p-4 text-left">
        <div>
          <p className="text-sm font-medium text-foreground">{booking.eventType.title}</p>
          <p className="text-sm text-muted-foreground">with {booking.host.name}</p>
        </div>
        <div className="text-sm text-foreground">
          <p>{dayLabel}</p>
          <p>
            {timeLabel}{" "}
            <span className="text-muted-foreground">
              ({tz.replace(/_/g, " ")}, {offsetLabel})
            </span>
          </p>
          {hostTz !== tz && (
            <p className="text-xs text-muted-foreground">
              Host&apos;s time: {formatInTz(start, hostTz, { hour: "numeric", minute: "2-digit" })} (
              {hostTz.replace(/_/g, " ")})
            </p>
          )}
        </div>
        {locationText && <p className="text-sm text-muted-foreground">{locationText}</p>}
        {booking.meetingUrl && (
          <a
            href={booking.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Join meeting
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={googleCalendarUrl({
                title: booking.eventType.title,
                startUtc: start,
                endUtc: end,
                details: calendarDetails,
                location: locationText,
              })}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Google Calendar
        </Button>
        <Button
          variant="outline"
          size="sm"
          render={
            <a
              href={outlookCalendarUrl({
                title: booking.eventType.title,
                startUtc: start,
                endUtc: end,
                details: calendarDetails,
                location: locationText,
              })}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Outlook
        </Button>
        <Button nativeButton={false} variant="outline" size="sm" render={<a href={`/booking/${booking.uid}/invite.ics`} />}>
          Download .ics
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <CopyButton value={booking.urls.manage} label="Copy link" />
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href={booking.urls.reschedule} />}>
          Reschedule
        </Button>
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href={booking.urls.cancel} />}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
