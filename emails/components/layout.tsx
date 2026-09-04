import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

/** The one accent colour used across every booking email. */
export const ACCENT_COLOR = "#0069ff";
export const TEXT_COLOR = "#1a1a1a";
export const MUTED_COLOR = "#6b7280";
export const BORDER_COLOR = "#e5e7eb";

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f4f5f7",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: "24px 0",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  maxWidth: "600px",
  margin: "0 auto",
  padding: "32px",
  borderRadius: "8px",
  border: `1px solid ${BORDER_COLOR}`,
};

const footerStyle: React.CSSProperties = {
  color: MUTED_COLOR,
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
};

export interface EmailLayoutProps {
  /** Shown as the inbox preview snippet; not visible in the rendered body. */
  previewText: string;
  children: React.ReactNode;
}

/**
 * Shared wrapper for every booking email: plain system-font styling, a single
 * accent colour, a max width of 600px, and no external images. Every template
 * renders its own content inside this shell.
 */
export function EmailLayout({ previewText, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {children}
          <Hr style={{ borderColor: BORDER_COLOR, margin: "32px 0 16px" }} />
          <Section>
            <Text style={footerStyle}>
              This email was sent automatically because it relates to a scheduled event.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const headingStyle: React.CSSProperties = {
  color: TEXT_COLOR,
  fontSize: "20px",
  fontWeight: 700,
  lineHeight: "28px",
  margin: "0 0 16px",
};

export const textStyle: React.CSSProperties = {
  color: TEXT_COLOR,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 12px",
};

export const labelStyle: React.CSSProperties = {
  color: MUTED_COLOR,
  fontSize: "12px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 4px",
};

export const buttonStyle: React.CSSProperties = {
  backgroundColor: ACCENT_COLOR,
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "10px 20px",
  textDecoration: "none",
};

export const linkStyle: React.CSSProperties = {
  color: ACCENT_COLOR,
  fontSize: "14px",
  textDecoration: "underline",
};

export const cardStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: `1px solid ${BORDER_COLOR}`,
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "0 0 20px",
};

export interface EventDetailsProps {
  eventTitle: string;
  timeRange: string;
  duration: string;
  hostName: string;
  inviteeName: string;
  locationText?: string | null;
  meetingUrl?: string | null;
  answers: { label: string; value: string }[];
}

/**
 * Shared "what got booked" card: time, duration, participants, location/meeting
 * link (as a button when present), and the invitee's answers to the booking form.
 */
export function EventDetails({
  eventTitle,
  timeRange,
  duration,
  hostName,
  inviteeName,
  locationText,
  meetingUrl,
  answers,
}: EventDetailsProps) {
  return (
    <Section style={cardStyle}>
      <Text style={{ ...labelStyle, margin: "0 0 4px" }}>{eventTitle}</Text>
      <Text style={{ ...textStyle, fontWeight: 600, margin: "0 0 4px" }}>{timeRange}</Text>
      <Text style={{ ...textStyle, color: MUTED_COLOR, margin: "0 0 16px" }}>{duration}</Text>

      <Text style={labelStyle}>Host</Text>
      <Text style={textStyle}>{hostName}</Text>

      <Text style={labelStyle}>Invitee</Text>
      <Text style={{ ...textStyle, margin: meetingUrl || locationText ? "0 0 16px" : "0" }}>
        {inviteeName}
      </Text>

      {meetingUrl ? (
        <Section style={{ margin: "0 0 16px" }}>
          <Button href={meetingUrl} style={buttonStyle}>
            Join meeting
          </Button>
          <Text style={{ ...textStyle, fontSize: "12px", color: MUTED_COLOR, margin: "8px 0 0" }}>
            {meetingUrl}
          </Text>
        </Section>
      ) : locationText ? (
        <Section style={{ margin: "0 0 16px" }}>
          <Text style={labelStyle}>Location</Text>
          <Text style={{ ...textStyle, margin: 0 }}>{locationText}</Text>
        </Section>
      ) : null}

      {answers.length > 0 ? (
        <Section>
          {answers.map((answer) => (
            <Section key={answer.label} style={{ margin: "0 0 10px" }}>
              <Text style={labelStyle}>{answer.label}</Text>
              <Text style={{ ...textStyle, margin: 0 }}>{answer.value}</Text>
            </Section>
          ))}
        </Section>
      ) : null}
    </Section>
  );
}

export interface ManageLinksProps {
  rescheduleUrl: string;
  cancelUrl: string;
}

/** Shared cancel / reschedule link row shown on confirmation and reminder emails. */
export function ManageLinks({ rescheduleUrl, cancelUrl }: ManageLinksProps) {
  return (
    <Text style={textStyle}>
      Need to make a change?{" "}
      <Link href={rescheduleUrl} style={linkStyle}>
        Reschedule
      </Link>{" "}
      ·{" "}
      <Link href={cancelUrl} style={linkStyle}>
        Cancel
      </Link>
    </Text>
  );
}
