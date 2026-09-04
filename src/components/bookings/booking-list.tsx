"use client";

import { useState } from "react";
import { CalendarClock, MapPin, PhoneCall, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatInTz, utcToLocalDate } from "@/lib/time";
import { BookingDetailSheet } from "@/components/bookings/booking-detail-sheet";

/** Location types mirror `locationTypeEnum` in `src/db/schema/event-types.ts`. */
export type BookingLocationType = "google_meet" | "phone" | "in_person" | "custom";
/** Mirrors `bookingStatusEnum` in `src/db/schema/bookings.ts`. */
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "rescheduled";
/** Mirrors `cancelledByEnum` in `src/db/schema/bookings.ts`. */
export type BookingCancelledBy = "host" | "invitee" | "system";

export type BookingAnswer = {
  questionId: string;
  label: string;
  value: string;
};

export type BookingEventTypeSummary = {
  id: string;
  title: string;
  color: string;
  durationMinutes: number;
  locationType: BookingLocationType;
};

/**
 * Client-safe, JSON-serializable shape of `BookingListItem` from
 * `@/server/bookings/service` — dates are ISO strings, serialized at the
 * page boundary.
 */
export type BookingListRowData = {
  id: string;
  uid: string;
  status: BookingStatus;
  startUtc: string;
  endUtc: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  noShow: boolean;
  eventType: BookingEventTypeSummary;
  meetingUrl: string | null;
  locationValue: string | null;
  answers: BookingAnswer[];
  cancelReason: string | null;
  cancelledBy: BookingCancelledBy | null;
  createdAt: string;
};

const LOCATION_ICON = {
  google_meet: Video,
  phone: PhoneCall,
  in_person: MapPin,
  custom: CalendarClock,
} as const;

type BookingListProps = {
  items: BookingListRowData[];
  hostTimezone: string;
};

function formatDateHeading(instant: Date, tz: string): string {
  const weekdayMonthDay = formatInTz(instant, tz, { weekday: "short", month: "short", day: "numeric" });
  const year = formatInTz(instant, tz, { year: "numeric" });
  return `${weekdayMonthDay} ${year}`;
}

function formatTime(instant: Date, tz: string): string {
  return formatInTz(instant, tz, { hour: "numeric", minute: "2-digit" });
}

type BookingGroup = { date: string; items: BookingListRowData[] };

/** Groups consecutive rows sharing the same host-local calendar date.
 * Assumes the service already returns rows ordered appropriately for the
 * active range (ascending for upcoming, descending for past/cancelled). */
function groupByLocalDate(rows: BookingListRowData[], tz: string): BookingGroup[] {
  const groups: BookingGroup[] = [];
  for (const row of rows) {
    const date = utcToLocalDate(new Date(row.startUtc), tz);
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.items.push(row);
    } else {
      groups.push({ date, items: [row] });
    }
  }
  return groups;
}

export function BookingList({ items, hostTimezone }: BookingListProps) {
  const [rows, setRows] = useState(items);
  const [selected, setSelected] = useState<BookingListRowData | null>(null);

  // The page fetches fresh data on every range/page/date change (a new
  // `items` array each time); sync it in during render rather than via an
  // effect, per https://react.dev/learn/you-might-not-need-an-effect.
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setRows(items);
  }

  const groups = groupByLocalDate(rows, hostTimezone);

  function handleCancelled(bookingId: string, cancelReason: string | null) {
    setRows((prev) =>
      prev.map((row) => (row.id === bookingId ? { ...row, status: "cancelled", cancelReason } : row)),
    );
    setSelected(null);
  }

  function handleNoShowChange(bookingId: string, noShow: boolean) {
    setRows((prev) => prev.map((row) => (row.id === bookingId ? { ...row, noShow } : row)));
    setSelected((prev) => (prev && prev.id === bookingId ? { ...prev, noShow } : prev));
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.date} className="flex flex-col gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {formatDateHeading(new Date(group.items[0].startUtc), hostTimezone)}
            </h3>
            <div className="overflow-hidden rounded-xl border border-border">
              {group.items.map((row, index) => {
                const Icon = LOCATION_ICON[row.eventType.locationType];
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelected(row)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                      index > 0 && "border-t border-border",
                    )}
                  >
                    <span
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: row.eventType.color }}
                      aria-hidden="true"
                    />
                    <span className="w-32 shrink-0 text-sm text-muted-foreground sm:w-40">
                      {formatTime(new Date(row.startUtc), hostTimezone)} –{" "}
                      {formatTime(new Date(row.endUtc), hostTimezone)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {row.eventType.title}
                        </span>
                        {row.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
                        {row.status === "rescheduled" && <Badge variant="outline">Rescheduled</Badge>}
                        {row.noShow && <Badge variant="outline">No-show</Badge>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.inviteeName} · {row.inviteeEmail}
                      </span>
                    </span>
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <BookingDetailSheet
        booking={selected}
        hostTimezone={hostTimezone}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onCancelled={handleCancelled}
        onNoShowChange={handleNoShowChange}
      />
    </>
  );
}
