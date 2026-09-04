import { z } from "zod";
import { getSession } from "@/server/auth/session";
import { listBookingsForExport } from "@/server/bookings/service";
import { describeLocation } from "@/server/bookings/view-model";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { addDays, localMinutesToUtc, todayInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  range: z.enum(["upcoming", "past", "cancelled", "custom"]).catch("upcoming"),
  from: z.string().regex(LOCAL_DATE_RE).optional().catch(undefined),
  to: z.string().regex(LOCAL_DATE_RE).optional().catch(undefined),
});

const BASE_COLUMNS: CsvColumn[] = [
  { key: "event", label: "Event" },
  { key: "inviteeName", label: "Invitee name" },
  { key: "inviteeEmail", label: "Invitee email" },
  { key: "start", label: "Start" },
  { key: "end", label: "End" },
  { key: "timezone", label: "Timezone (host)" },
  { key: "status", label: "Status" },
  { key: "noShow", label: "No-show" },
  { key: "location", label: "Location" },
  { key: "meetingLink", label: "Meeting link" },
  { key: "created", label: "Created" },
  { key: "cancelReason", label: "Cancel reason" },
];

/** `yyyy-MM-dd HH:mm` in `tz`, 24-hour, using explicit `hourCycle: "h23"` to
 * avoid the "24:00 at local midnight" quirk some engines produce with plain
 * `hour12: false`. */
function formatIsoLikeInTz(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const hostUserId = session.user.id;
  const hostTimezone = session.user.timezone ?? "UTC";
  const { range } = parsed.data;
  const today = todayInTz(new Date(), hostTimezone);

  const serviceRange =
    range === "custom"
      ? {
          from: localMinutesToUtc(parsed.data.from ?? today, 0, hostTimezone),
          to: localMinutesToUtc(addDays(parsed.data.to ?? today, 1), 0, hostTimezone),
        }
      : range;

  const items = await listBookingsForExport(hostUserId, serviceRange);

  // One column per distinct answer label, in first-seen order.
  const answerLabels: string[] = [];
  const seenLabels = new Set<string>();
  for (const item of items) {
    for (const answer of item.answers) {
      if (!seenLabels.has(answer.label)) {
        seenLabels.add(answer.label);
        answerLabels.push(answer.label);
      }
    }
  }
  const answerColumns: CsvColumn[] = answerLabels.map((label, index) => ({
    key: `answer_${index}`,
    label,
  }));
  const columns = [...BASE_COLUMNS, ...answerColumns];

  const rows = items.map((item) => {
    const row: Record<string, string | number | boolean | null> = {
      event: item.eventType.title,
      inviteeName: item.inviteeName,
      inviteeEmail: item.inviteeEmail,
      start: formatIsoLikeInTz(item.startUtc, hostTimezone),
      end: formatIsoLikeInTz(item.endUtc, hostTimezone),
      timezone: hostTimezone,
      status: item.status,
      noShow: item.noShow,
      location: describeLocation(item.eventType.locationType, item.locationValue, item.meetingUrl),
      meetingLink: item.meetingUrl,
      created: formatIsoLikeInTz(item.createdAt, hostTimezone),
      cancelReason: item.cancelReason,
    };
    answerLabels.forEach((label, index) => {
      const answer = item.answers.find((a) => a.label === label);
      row[`answer_${index}`] = answer ? answer.value : null;
    });
    return row;
  });

  const csv = toCsv(rows, columns);
  const filename = `bookings-${range}-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
