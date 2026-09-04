import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, headingStyle, textStyle } from "./components/layout";

export interface TestEmailProps {
  to: string;
  sentAt?: Date;
}

/** Sent from the admin settings screen to verify SMTP configuration. */
export default function TestEmail({ to, sentAt = new Date() }: TestEmailProps) {
  return (
    <EmailLayout previewText="Your SMTP configuration is working">
      <Heading style={headingStyle}>SMTP test successful</Heading>
      <Text style={textStyle}>
        This is a test email sent to {to} to confirm your SMTP configuration is working
        correctly.
      </Text>
      <Text style={textStyle}>Sent at {sentAt.toISOString()}.</Text>
    </EmailLayout>
  );
}
