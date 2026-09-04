import { Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { formatDuration, formatRange } from "../src/server/email/format";
import type { BookingEmailView } from "../src/server/email/types";
import { EmailLayout, EventDetails, ManageLinks, headingStyle, textStyle } from "./components/layout";

export interface BookingHostNotificationEmailProps {
  view: BookingEmailView;
}

/** Sent to the host when a new booking comes in. Shows time in the host's own time zone. */
export default function BookingHostNotificationEmail({ view }: BookingHostNotificationEmailProps) {
  const timeRange = formatRange(view.startUtc, view.endUtc, view.hostTimezone);
  const duration = formatDuration(view.startUtc, view.endUtc);
  const previewText = `New booking: ${view.inviteeName} · ${timeRange}`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={headingStyle}>New booking from {view.inviteeName}</Heading>
      <Text style={textStyle}>
        {view.inviteeName} ({view.inviteeEmail}) just booked {view.eventTitle} with you.
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
