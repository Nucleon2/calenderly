import { Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { formatDuration, formatRange } from "../src/server/email/format";
import type { BookingEmailView, EmailRecipient } from "../src/server/email/types";
import {
  EmailLayout,
  EventDetails,
  ManageLinks,
  cardStyle,
  headingStyle,
  labelStyle,
  textStyle,
} from "./components/layout";

export interface BookingRescheduledEmailProps {
  view: BookingEmailView;
  recipient: EmailRecipient;
  previousStartUtc: Date;
  previousEndUtc: Date;
  rescheduledBy: "host" | "invitee";
}

/** Sent to both parties when a booking moves. Shows the old time struck against the new one. */
export default function BookingRescheduledEmail({
  view,
  recipient,
  previousStartUtc,
  previousEndUtc,
  rescheduledBy,
}: BookingRescheduledEmailProps) {
  const tz = recipient === "host" ? view.hostTimezone : view.inviteeTimezone;
  const newTimeRange = formatRange(view.startUtc, view.endUtc, tz);
  const previousTimeRange = formatRange(previousStartUtc, previousEndUtc, tz);
  const duration = formatDuration(view.startUtc, view.endUtc);
  const previewText = `Rescheduled: ${view.eventTitle} · now ${newTimeRange}`;
  const rescheduledByLabel = rescheduledBy === "host" ? view.hostName : view.inviteeName;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={headingStyle}>Event rescheduled</Heading>
      <Text style={textStyle}>
        {rescheduledByLabel} moved {view.eventTitle} to a new time.
      </Text>

      <Section style={cardStyle}>
        <Text style={labelStyle}>Previous time</Text>
        <Text style={{ ...textStyle, margin: 0, textDecoration: "line-through", color: "#6b7280" }}>
          {previousTimeRange}
        </Text>
      </Section>

      <EventDetails
        eventTitle={view.eventTitle}
        timeRange={newTimeRange}
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
