import { Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { formatDuration, formatRange } from "../src/server/email/format";
import type { BookingEmailView, EmailRecipient } from "../src/server/email/types";
import { EmailLayout, EventDetails, cardStyle, headingStyle, labelStyle, textStyle } from "./components/layout";

export interface BookingCancelledEmailProps {
  view: BookingEmailView;
  recipient: EmailRecipient;
  reason?: string | null;
  cancelledBy: "host" | "invitee";
}

/** Sent to both parties when a booking is cancelled. Shows the reason and who cancelled. */
export default function BookingCancelledEmail({
  view,
  recipient,
  reason,
  cancelledBy,
}: BookingCancelledEmailProps) {
  const tz = recipient === "host" ? view.hostTimezone : view.inviteeTimezone;
  const timeRange = formatRange(view.startUtc, view.endUtc, tz);
  const duration = formatDuration(view.startUtc, view.endUtc);
  const previewText = `Cancelled: ${view.eventTitle} · ${timeRange}`;
  const cancelledByLabel = cancelledBy === "host" ? view.hostName : view.inviteeName;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={headingStyle}>Event cancelled</Heading>
      <Text style={textStyle}>
        The following event was cancelled by {cancelledByLabel}:
      </Text>

      <EventDetails
        eventTitle={view.eventTitle}
        timeRange={timeRange}
        duration={duration}
        hostName={view.hostName}
        inviteeName={view.inviteeName}
        locationText={view.locationText}
        meetingUrl={null}
        answers={view.answers}
      />

      <Section style={cardStyle}>
        <Text style={labelStyle}>Reason</Text>
        <Text style={{ ...textStyle, margin: 0 }}>{reason?.trim() || "No reason given."}</Text>
      </Section>
    </EmailLayout>
  );
}
