import { render } from "@react-email/render";
import type { Attachment } from "nodemailer";
import * as React from "react";
import { env } from "@/lib/env";
import BookingCancelledEmail from "../../../emails/booking-cancelled";
import BookingConfirmationEmail from "../../../emails/booking-confirmation";
import BookingHostNotificationEmail from "../../../emails/booking-host-notification";
import BookingReminderEmail from "../../../emails/booking-reminder";
import BookingRescheduledEmail from "../../../emails/booking-rescheduled";
import TestEmail from "../../../emails/test-email";
import { icsAttachment } from "./ics";
import { getTransport } from "./transport";
import type { BookingEmailView, EmailRecipient } from "./types";

export interface SendResult {
  messageId: string;
  to: string;
}

async function renderEmail(node: React.ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([
    render(node),
    render(node, { plainText: true }),
  ]);
  return { html, text };
}

interface SendArgs {
  to: string;
  replyTo: string;
  subject: string;
  node: React.ReactElement;
  ics?: { view: BookingEmailView; method: "REQUEST" | "CANCEL" };
  template: string;
}

async function send({ to, replyTo, subject, node, ics, template }: SendArgs): Promise<SendResult> {
  const { html, text } = await renderEmail(node);
  const attachments: Attachment[] = [];
  let icalEvent: { method: string; content: string } | undefined;

  if (ics) {
    const attachment = icsAttachment(ics.view, ics.method);
    attachments.push({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    });
    icalEvent = { method: ics.method, content: attachment.content };
  }

  const info = await getTransport().sendMail({
    from: env.EMAIL_FROM,
    to,
    replyTo,
    subject,
    html,
    text,
    attachments: attachments.length > 0 ? attachments : undefined,
    icalEvent,
  });

  console.info("[email] sent", { template, to, messageId: info.messageId });
  return { messageId: info.messageId, to };
}

/**
 * Sends the booking confirmation: one email to the invitee and one notification
 * to the host, each carrying an ICS `REQUEST` invite. Returns the invitee result
 * first, then the host result.
 */
export async function sendBookingConfirmation(view: BookingEmailView): Promise<SendResult[]> {
  const inviteeResult = await send({
    to: view.inviteeEmail,
    replyTo: view.hostEmail,
    subject: `Confirmed: ${view.eventTitle} with ${view.hostName}`,
    node: React.createElement(BookingConfirmationEmail, { view }),
    ics: { view, method: "REQUEST" },
    template: "booking-confirmation",
  });

  const hostResult = await send({
    to: view.hostEmail,
    replyTo: view.inviteeEmail,
    subject: `New booking: ${view.inviteeName} booked ${view.eventTitle}`,
    node: React.createElement(BookingHostNotificationEmail, { view }),
    ics: { view, method: "REQUEST" },
    template: "booking-host-notification",
  });

  return [inviteeResult, hostResult];
}

/** Sends a cancellation to both parties with an ICS `CANCEL`. */
export async function sendBookingCancelled(
  view: BookingEmailView,
  opts: { reason?: string | null; cancelledBy: "host" | "invitee" },
): Promise<SendResult[]> {
  const inviteeResult = await send({
    to: view.inviteeEmail,
    replyTo: view.hostEmail,
    subject: `Cancelled: ${view.eventTitle}`,
    node: React.createElement(BookingCancelledEmail, {
      view,
      recipient: "invitee",
      reason: opts.reason,
      cancelledBy: opts.cancelledBy,
    }),
    ics: { view, method: "CANCEL" },
    template: "booking-cancelled",
  });

  const hostResult = await send({
    to: view.hostEmail,
    replyTo: view.inviteeEmail,
    subject: `Cancelled: ${view.eventTitle}`,
    node: React.createElement(BookingCancelledEmail, {
      view,
      recipient: "host",
      reason: opts.reason,
      cancelledBy: opts.cancelledBy,
    }),
    ics: { view, method: "CANCEL" },
    template: "booking-cancelled",
  });

  return [inviteeResult, hostResult];
}

/**
 * Sends a reschedule notice to both parties with an ICS `REQUEST` carrying the
 * bumped `sequence` already set on `view.icsSequence`.
 */
export async function sendBookingRescheduled(
  view: BookingEmailView,
  opts: { previousStartUtc: Date; previousEndUtc: Date; rescheduledBy: "host" | "invitee" },
): Promise<SendResult[]> {
  const inviteeResult = await send({
    to: view.inviteeEmail,
    replyTo: view.hostEmail,
    subject: `Rescheduled: ${view.eventTitle}`,
    node: React.createElement(BookingRescheduledEmail, {
      view,
      recipient: "invitee",
      previousStartUtc: opts.previousStartUtc,
      previousEndUtc: opts.previousEndUtc,
      rescheduledBy: opts.rescheduledBy,
    }),
    ics: { view, method: "REQUEST" },
    template: "booking-rescheduled",
  });

  const hostResult = await send({
    to: view.hostEmail,
    replyTo: view.inviteeEmail,
    subject: `Rescheduled: ${view.eventTitle}`,
    node: React.createElement(BookingRescheduledEmail, {
      view,
      recipient: "host",
      previousStartUtc: opts.previousStartUtc,
      previousEndUtc: opts.previousEndUtc,
      rescheduledBy: opts.rescheduledBy,
    }),
    ics: { view, method: "REQUEST" },
    template: "booking-rescheduled",
  });

  return [inviteeResult, hostResult];
}

/** Sends a reminder to a single recipient (no ICS attachment). */
export async function sendBookingReminder(
  view: BookingEmailView,
  recipient: EmailRecipient,
): Promise<SendResult> {
  const isHost = recipient === "host";
  return send({
    to: isHost ? view.hostEmail : view.inviteeEmail,
    replyTo: isHost ? view.inviteeEmail : view.hostEmail,
    subject: `Reminder: ${view.eventTitle}`,
    node: React.createElement(BookingReminderEmail, { view, recipient }),
    template: "booking-reminder",
  });
}

/** Sends a one-off SMTP configuration test email. */
export async function sendTestEmail(to: string): Promise<SendResult> {
  return send({
    to,
    replyTo: env.EMAIL_FROM,
    subject: "SMTP test email",
    node: React.createElement(TestEmail, { to }),
    template: "test-email",
  });
}
