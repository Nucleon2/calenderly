import { Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { formatDuration, formatRange } from "../src/server/email/format";
import type { BookingEmailView, EmailRecipient } from "../src/server/email/types";
import { EmailLayout, EventDetails, ManageLinks, headingStyle, textStyle } from "./components/layout";

export interface BookingReminderEmailProps {
  view: BookingEmailView;
  recipient: EmailRecipient;
}

/** Sent ahead of the event to either party, in their own time zone. */
export default function BookingReminderEmail({ view, recipient }: BookingReminderEmailProps) {
  const isHost = recipient === "host";
  const tz = isHost ? view.hostTimezone : view.inviteeTimezone;
  const timeRange = formatRange(view.startUtc, view.endUtc, tz);
  const duration = formatDuration(view.startUtc, view.endUtc);
  const previewText = `Reminder: ${view.eventTitle} · ${timeRange}`;
  const greetingName = isHost ? view.hostName : view.inviteeName;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={headingStyle}>Upcoming: {view.eventTitle}</Heading>
      <Text style={textStyle}>Hi {greetingName}, this is a reminder about your upcoming event.</Text>

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
