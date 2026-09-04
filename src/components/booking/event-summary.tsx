import { CalendarClock, Clock, MapPin, Phone, Video } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatInTz, tzOffsetLabel } from "@/lib/time";

export type PublicLocationType = "google_meet" | "phone" | "in_person" | "custom";

export interface PublicLocationDetails {
  text?: string;
  phone?: string;
  address?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Describes the location before a booking exists yet, i.e. no concrete
 * meeting link/phone number has been generated. (`describeLocation` from
 * the bookings service view-model is for an actual booking, used on the
 * confirmation/cancel/reschedule pages instead.)
 */
function describeLocation(locationType: PublicLocationType, details: PublicLocationDetails): string {
  switch (locationType) {
    case "google_meet":
      return "Google Meet (link provided after booking)";
    case "phone":
      return details.phone ? `Phone call — ${details.phone}` : "Phone call";
    case "in_person":
      return details.address || "In person";
    case "custom":
      return details.text || "Custom location";
    default:
      return "";
  }
}

function LocationIcon({ locationType }: { locationType: PublicLocationType }) {
  const className = "size-4 shrink-0 text-muted-foreground";
  switch (locationType) {
    case "google_meet":
      return <Video className={className} aria-hidden="true" />;
    case "phone":
      return <Phone className={className} aria-hidden="true" />;
    case "in_person":
      return <MapPin className={className} aria-hidden="true" />;
    default:
      return <MapPin className={className} aria-hidden="true" />;
  }
}

export interface EventSummaryProps {
  title: string;
  durationMinutes: number;
  description?: string | null;
  locationType: PublicLocationType;
  locationDetails: PublicLocationDetails;
  hostName: string;
  hostImage?: string | null;
  /** Invitee's currently-selected time zone, used to format `selectedSlot`/`formerTime`. */
  timezone: string;
  /** The slot the invitee has picked so far (shown once chosen, Calendly-style). */
  selectedSlot?: { start: string; end: string } | null;
  /** In reschedule mode, the booking's current time — shown as "Formerly: …". */
  formerTime?: { start: string; end: string } | null;
}

export function EventSummary({
  title,
  durationMinutes,
  description,
  locationType,
  locationDetails,
  hostName,
  hostImage,
  timezone,
  selectedSlot,
  formerTime,
}: EventSummaryProps) {
  const formatSlot = (slot: { start: string; end: string }) => {
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    const day = formatInTz(start, timezone, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const time = `${formatInTz(start, timezone, { hour: "numeric", minute: "2-digit" })} – ${formatInTz(end, timezone, { hour: "numeric", minute: "2-digit" })}`;
    return `${day}, ${time} (${tzOffsetLabel(start, timezone)})`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Avatar size="sm">
          <AvatarImage src={hostImage ?? undefined} alt="" />
          <AvatarFallback>{initials(hostName)}</AvatarFallback>
        </Avatar>
        <span className="text-sm text-muted-foreground">{hostName}</span>
      </div>

      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {durationMinutes} min
        </div>
        <div className="flex items-center gap-2">
          <LocationIcon locationType={locationType} />
          {describeLocation(locationType, locationDetails)}
        </div>
      </div>

      {description && <p className="text-sm text-muted-foreground">{description}</p>}

      {formerTime && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="line-through">Formerly: {formatSlot(formerTime)}</span>
          </span>
        </div>
      )}

      {selectedSlot && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm font-medium text-foreground">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{formatSlot(selectedSlot)}</span>
        </div>
      )}
    </div>
  );
}
