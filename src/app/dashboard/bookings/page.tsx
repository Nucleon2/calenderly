import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CopyButton } from "@/components/dashboard/copy-button";
import { BookingList } from "@/components/bookings/booking-list";
import { BookingTabs, type BookingRange } from "@/components/bookings/booking-tabs";
import { ExportButton } from "@/components/bookings/export-button";
import { Pagination } from "@/components/bookings/pagination";
import { requireOnboardedUser } from "@/server/auth/session";
import { listBookings } from "@/server/bookings/service";
import { env } from "@/lib/env";
import { addDays, localMinutesToUtc, todayInTz } from "@/lib/time";
import type { BookingListRowData } from "@/components/bookings/booking-list";

export const metadata: Metadata = {
  title: "Bookings",
};

const LIMIT = 50;

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const searchParamsSchema = z.object({
  range: z.enum(["upcoming", "past", "cancelled", "custom"]).catch("upcoming"),
  from: z.string().regex(LOCAL_DATE_RE).optional().catch(undefined),
  to: z.string().regex(LOCAL_DATE_RE).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

const EMPTY_STATE_TITLE: Record<BookingRange, string> = {
  upcoming: "No upcoming bookings",
  past: "No past bookings",
  cancelled: "No cancelled bookings",
  custom: "No bookings in this date range",
};

type BookingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  const user = await requireOnboardedUser();
  const raw = await searchParams;

  const parsed = searchParamsSchema.parse({
    range: firstValue(raw.range),
    from: firstValue(raw.from),
    to: firstValue(raw.to),
    page: firstValue(raw.page),
  });

  const range: BookingRange = parsed.range;
  const hostTimezone = user.timezone ?? "UTC";
  const today = todayInTz(new Date(), hostTimezone);

  const serviceRange =
    range === "custom"
      ? {
          from: localMinutesToUtc(parsed.from ?? today, 0, hostTimezone),
          to: localMinutesToUtc(addDays(parsed.to ?? today, 1), 0, hostTimezone),
        }
      : range;

  const { items, total } = await listBookings(user.id, {
    range: serviceRange,
    limit: LIMIT,
    offset: (parsed.page - 1) * LIMIT,
  });

  const serializedItems: BookingListRowData[] = items.map((item) => ({
    id: item.id,
    uid: item.uid,
    status: item.status,
    startUtc: item.startUtc.toISOString(),
    endUtc: item.endUtc.toISOString(),
    inviteeName: item.inviteeName,
    inviteeEmail: item.inviteeEmail,
    inviteeTimezone: item.inviteeTimezone,
    noShow: item.noShow,
    eventType: item.eventType,
    meetingUrl: item.meetingUrl,
    locationValue: item.locationValue,
    answers: item.answers,
    cancelReason: item.cancelReason,
    cancelledBy: item.cancelledBy,
    createdAt: item.createdAt.toISOString(),
  }));

  const bookingPageUrl = user.username ? `${env.APP_URL}/${user.username}` : env.APP_URL;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="See and manage the meetings people have booked with you."
        actions={<ExportButton range={range} from={parsed.from} to={parsed.to} />}
      />

      <BookingTabs range={range} from={parsed.from} to={parsed.to} />

      {serializedItems.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={EMPTY_STATE_TITLE[range]}
          description="Share your booking page to start filling up your calendar."
          action={<CopyButton value={bookingPageUrl} label="Copy booking link" />}
        />
      ) : (
        <>
          <BookingList items={serializedItems} hostTimezone={hostTimezone} />
          <Pagination page={parsed.page} limit={LIMIT} total={total} range={range} from={parsed.from} to={parsed.to} />
        </>
      )}
    </>
  );
}
