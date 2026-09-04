import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { afterEach, describe, expect, it } from "vitest";
import {
  sendBookingCancelled,
  sendBookingConfirmation,
  sendBookingReminder,
  sendBookingRescheduled,
  sendTestEmail,
} from "@/server/email/mailer";
import { setTransportForTests } from "@/server/email/transport";
import { makeBookingEmailView } from "../../fixtures/email";

interface CapturedMessage {
  to: { address: string }[];
  replyTo?: { address: string }[];
  subject: string;
  attachments?: { filename: string; contentType: string }[];
  icalEvent?: { method: string; content: string };
}

/**
 * A real Nodemailer JSON transport, wrapped so every send is also captured (parsed)
 * for assertions instead of only being reachable through the resolved `info`.
 */
function createCapturingTransport(): { transport: Transporter; sent: CapturedMessage[] } {
  const real = nodemailer.createTransport({ jsonTransport: true });
  const sent: CapturedMessage[] = [];
  const originalSendMail = real.sendMail.bind(real);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (real as any).sendMail = async (options: unknown) => {
    const info = await originalSendMail(options as never);
    sent.push(JSON.parse(info.message as string) as CapturedMessage);
    return info;
  };
  return { transport: real, sent };
}

afterEach(() => {
  setTransportForTests(null);
});

describe("sendBookingConfirmation", () => {
  it("sends exactly 2 messages: invitee then host, each with one ICS REQUEST attachment", async () => {
    const { transport, sent } = createCapturingTransport();
    setTransportForTests(transport);
    const view = makeBookingEmailView();

    const results = await sendBookingConfirmation(view);

    expect(results).toHaveLength(2);
    expect(sent).toHaveLength(2);

    const [inviteeMsg, hostMsg] = sent;
    expect(inviteeMsg.to[0].address).toBe(view.inviteeEmail);
    expect(inviteeMsg.replyTo?.[0].address).toBe(view.hostEmail);
    expect(inviteeMsg.attachments).toHaveLength(1);
    expect(inviteeMsg.icalEvent?.method).toBe("REQUEST");

    expect(hostMsg.to[0].address).toBe(view.hostEmail);
    expect(hostMsg.replyTo?.[0].address).toBe(view.inviteeEmail);
    expect(hostMsg.attachments).toHaveLength(1);
    expect(hostMsg.icalEvent?.method).toBe("REQUEST");
  });
});

describe("sendBookingCancelled", () => {
  it("sends 2 messages with an ICS CANCEL", async () => {
    const { transport, sent } = createCapturingTransport();
    setTransportForTests(transport);
    const view = makeBookingEmailView();

    const results = await sendBookingCancelled(view, { reason: "No longer needed", cancelledBy: "invitee" });

    expect(results).toHaveLength(2);
    expect(sent).toHaveLength(2);
    for (const msg of sent) {
      expect(msg.icalEvent?.method).toBe("CANCEL");
    }
    expect(sent[0].to[0].address).toBe(view.inviteeEmail);
    expect(sent[1].to[0].address).toBe(view.hostEmail);
  });
});

describe("sendBookingRescheduled", () => {
  it("sends 2 messages with an ICS REQUEST using the bumped sequence", async () => {
    const { transport, sent } = createCapturingTransport();
    setTransportForTests(transport);
    const view = makeBookingEmailView({ icsSequence: 2 });

    const results = await sendBookingRescheduled(view, {
      previousStartUtc: new Date("2026-03-09T13:00:00.000Z"),
      previousEndUtc: new Date("2026-03-09T13:30:00.000Z"),
      rescheduledBy: "host",
    });

    expect(results).toHaveLength(2);
    expect(sent).toHaveLength(2);
    for (const msg of sent) {
      expect(msg.icalEvent?.method).toBe("REQUEST");
      expect(msg.icalEvent?.content).toContain("SEQUENCE:2");
    }
  });
});

describe("sendBookingReminder", () => {
  it("sends 1 message to the chosen recipient with no ICS attachment", async () => {
    const { transport, sent } = createCapturingTransport();
    setTransportForTests(transport);
    const view = makeBookingEmailView();

    const result = await sendBookingReminder(view, "host");

    expect(sent).toHaveLength(1);
    expect(result.to).toBe(view.hostEmail);
    expect(sent[0].to[0].address).toBe(view.hostEmail);
    expect(sent[0].icalEvent).toBeUndefined();
    expect(sent[0].attachments).toBeUndefined();
  });
});

describe("sendTestEmail", () => {
  it("sends 1 message to the given address", async () => {
    const { transport, sent } = createCapturingTransport();
    setTransportForTests(transport);

    const result = await sendTestEmail("someone@example.com");

    expect(sent).toHaveLength(1);
    expect(result.to).toBe("someone@example.com");
    expect(sent[0].to[0].address).toBe("someone@example.com");
    expect(sent[0].subject).toBe("SMTP test email");
  });
});

describe("error propagation", () => {
  it("throws when the transport rejects, instead of swallowing the error", async () => {
    const failing = {
      sendMail: async () => {
        throw new Error("smtp connection refused");
      },
    } as unknown as Transporter;
    setTransportForTests(failing);

    await expect(sendTestEmail("someone@example.com")).rejects.toThrow("smtp connection refused");
  });
});
