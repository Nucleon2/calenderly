import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * Builds a fresh Nodemailer SMTP transport from env. `auth` is omitted entirely
 * when `SMTP_USER` is empty, so an open-relay/local dev SMTP server (e.g. MailHog,
 * Mailpit) works without credentials.
 */
export function createTransport(): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

let singleton: Transporter | null = null;
let testOverride: Transporter | null | undefined;

/** Lazily creates (and reuses) the process-wide SMTP transport. */
export function getTransport(): Transporter {
  if (testOverride !== undefined) {
    return testOverride ?? createAndCacheSingleton();
  }
  return singleton ?? createAndCacheSingleton();
}

function createAndCacheSingleton(): Transporter {
  singleton = createTransport();
  return singleton;
}

/**
 * Test-only hook: forces `getTransport()` to return `t` (or, when `t` is `null`,
 * falls back to the normal lazily-created singleton again). Use with a
 * `jsonTransport: true` transport to capture sends without hitting the network.
 */
export function setTransportForTests(t: Transporter | null): void {
  testOverride = t === null ? undefined : t;
}
