import { Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { formatDuration, formatRange } from "../src/server/email/format";
import type { BookingEmailView } from "../src/server/email/types";
import { EmailLayout, EventDetails, ManageLinks, headingStyle, textStyle } from "./components/layout";

export interface BookingConfirmationEmailProps {
  view: BookingEmailView;
}

/** Sent to the invitee once a booking is confirmed. Shows time in their own time zone. */
export default function BookingConfirmationEmail({ view }: BookingConfirmationEmailProps) {
  const timeRange = formatRange(view.startUtc, view.endUtc, view.inviteeTimezone);
  const duration = formatDuration(view.startUtc, view.endUtc);
  const previewText = `Confirmed: ${view.eventTitle} with ${view.hostName} · ${timeRange}`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={headingStyle}>You&apos;re booked with {view.hostName}</Heading>
      <Text style={textStyle}>
        Hi {view.inviteeName}, your event has been confirmed. Here are the details:
      </Text>

      <EventDetails
        eventTitle={view.eventTitle}
        timeRange={timeRange}
        duration={duration}
        hostName={view.hostName}
        inviteeName={view.inviteeName}
        locationText={view.locationText}
        meetingUrl={view.meetingUrl}
        answers={view.answers}
      />

      <Section>
        <ManageLinks rescheduleUrl={view.rescheduleUrl} cancelUrl={view.cancelUrl} />
      </Section>
    </EmailLayout>
  );
}
