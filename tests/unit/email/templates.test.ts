import { render } from "@react-email/render";
import * as React from "react";
import { describe, expect, it } from "vitest";
import BookingCancelledEmail from "../../../emails/booking-cancelled";
import BookingConfirmationEmail from "../../../emails/booking-confirmation";
import BookingHostNotificationEmail from "../../../emails/booking-host-notification";
import BookingReminderEmail from "../../../emails/booking-reminder";
import BookingRescheduledEmail from "../../../emails/booking-rescheduled";
import TestEmail from "../../../emails/test-email";
import { makeBookingEmailView } from "../../fixtures/email";

describe("BookingConfirmationEmail (invitee)", () => {
  it("shows the invitee's local time, event title, links and answers", async () => {
    const view = makeBookingEmailView();
    const html = await render(React.createElement(BookingConfirmationEmail, { view }));

    expect(html).toContain(view.eventTitle);
    expect(html).toContain("9:00 AM");
    expect(html).toContain("EDT");
    expect(html).toContain(view.cancelUrl);
    expect(html).toContain(view.rescheduleUrl);
    expect(html).toContain(view.meetingUrl as string);
    expect(html).toContain("Q3 roadmap");
    expect(html).toContain("Acme Inc");
  });

  it("omits the meeting-link section when there is no meeting URL", async () => {
    const view = makeBookingEmailView({ meetingUrl: null, locationText: "123 Main St" });
    const html = await render(React.createElement(BookingConfirmationEmail, { view }));

    expect(html).not.toContain("Join meeting");
    expect(html).toContain("123 Main St");
  });
});

describe("BookingHostNotificationEmail (host)", () => {
  it("shows the host's local time", async () => {
    const view = makeBookingEmailView();
    const html = await render(React.createElement(BookingHostNotificationEmail, { view }));

    expect(html).toContain("2:00 PM");
    expect(html).toMatch(/GMT\+1|CET|CEST/);
    expect(html).toContain(view.inviteeEmail);
  });
});

describe("BookingCancelledEmail", () => {
  it("shows the reason and who cancelled, per recipient's time zone", async () => {
    const view = makeBookingEmailView();
    const html = await render(
      React.createElement(BookingCancelledEmail, {
        view,
        recipient: "invitee",
        reason: "Host is unavailable",
        cancelledBy: "host",
      }),
    );

    expect(html).toContain("Host is unavailable");
    expect(html).toContain(view.hostName);
    expect(html).toContain("9:00 AM");
  });

  it("defaults to a generic message when no reason is given", async () => {
    const view = makeBookingEmailView();
    const html = await render(
      React.createElement(BookingCancelledEmail, {
        view,
        recipient: "host",
        reason: null,
        cancelledBy: "invitee",
      }),
    );

    expect(html).toContain("No reason given");
    expect(html).toContain("2:00 PM");
  });
});

describe("BookingRescheduledEmail", () => {
  it("shows both the previous and new time in the recipient's time zone", async () => {
    const view = makeBookingEmailView();
    const previousStartUtc = new Date("2026-03-09T13:00:00.000Z");
    const previousEndUtc = new Date("2026-03-09T13:30:00.000Z");
    const html = await render(
      React.createElement(BookingRescheduledEmail, {
        view,
        recipient: "invitee",
        previousStartUtc,
        previousEndUtc,
        rescheduledBy: "host",
      }),
    );

    expect(html).toContain("9:00 AM");
    // Previous day (March 9) must appear alongside the new day (March 10).
    expect(html).toContain("March 9, 2026");
    expect(html).toContain("March 10, 2026");
  });
});

describe("BookingReminderEmail", () => {
  it("renders for the invitee in their time zone", async () => {
    const view = makeBookingEmailView();
    const html = await render(React.createElement(BookingReminderEmail, { view, recipient: "invitee" }));
    expect(html).toContain("9:00 AM");
    expect(html).toContain(view.cancelUrl);
    expect(html).toContain(view.rescheduleUrl);
  });

  it("renders for the host in their time zone", async () => {
    const view = makeBookingEmailView();
    const html = await render(React.createElement(BookingReminderEmail, { view, recipient: "host" }));
    expect(html).toContain("2:00 PM");
  });
});

describe("TestEmail", () => {
  it("renders the recipient address", async () => {
    const html = await render(React.createElement(TestEmail, { to: "someone@example.com" }));
    expect(html).toContain("someone@example.com");
  });
});

describe("plain-text alternative", () => {
  it("renders non-empty plain text containing the event title", async () => {
    const view = makeBookingEmailView();
    const text = await render(React.createElement(BookingConfirmationEmail, { view }), { plainText: true });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain(view.eventTitle);
  });
});
