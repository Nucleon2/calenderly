import { NextResponse } from "next/server";
import { buildIcs } from "@/server/email/ics";
import { getBookingByUid } from "@/server/bookings/service";
import { toEmailView } from "@/server/bookings/view-model";

export async function GET(_request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const booking = await getBookingByUid(uid);
  if (!booking) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ics = buildIcs(toEmailView(booking), "REQUEST");

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=REQUEST",
      "Content-Disposition": 'attachment; filename="invite.ics"',
      "Cache-Control": "no-store",
    },
  });
}
