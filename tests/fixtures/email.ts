import type { BookingEmailView } from "@/server/email/types";

/**
 * A representative booking view: a 30-minute event starting at 13:00 UTC on
 * 2026-03-10, hosted from Europe/Berlin (14:00 local, CET/CEST) and booked by an
 * invitee in America/New_York (9:00 local, EDT).
 */
export function makeBookingEmailView(overrides: Partial<BookingEmailView> = {}): BookingEmailView {
  return {
    bookingId: "booking_1",
    uid: "abc123",
    eventTitle: "30 Minute Meeting",
    eventDescription: "A quick sync to discuss the roadmap.",
    hostName: "Hedy Host",
    hostEmail: "hedy@example.com",
    hostTimezone: "Europe/Berlin",
    inviteeName: "Ivy Invitee",
    inviteeEmail: "ivy@example.com",
    inviteeTimezone: "America/New_York",
    startUtc: new Date("2026-03-10T13:00:00.000Z"),
    endUtc: new Date("2026-03-10T13:30:00.000Z"),
    locationText: null,
    meetingUrl: "https://meet.example.com/abc-123",
    answers: [
      { label: "What would you like to discuss?", value: "Q3 roadmap" },
      { label: "Company", value: "Acme Inc" },
    ],
    manageUrl: "http://localhost:3000/booking/abc123",
    cancelUrl: "http://localhost:3000/booking/abc123/cancel",
    rescheduleUrl: "http://localhost:3000/booking/abc123/reschedule",
    icsUid: "booking_1@example.com",
    icsSequence: 0,
    ...overrides,
  };
}
