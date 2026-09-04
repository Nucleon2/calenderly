import { and, eq } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { db } from "@/db/client";
import { account, type Account } from "@/db/schema";
import { isGoogleConfigured } from "@/lib/env";
import { auth } from "@/server/auth/auth";
import { CalendarNotConnectedError, CalendarReauthRequiredError, GoogleNotConfiguredError } from "../errors";
import { hasCalendarScopes } from "./scopes";

/**
 * Finds the `account` row backing this user's Google Calendar access: a
 * `providerId: "google"` row whose stored scope grants both calendar scopes.
 * A user can have several Google accounts linked (different Google emails);
 * this returns the first one with calendar scopes.
 */
export async function getGoogleAccountRow(userId: string): Promise<Account> {
  if (!isGoogleConfigured()) throw new GoogleNotConfiguredError();

  const rows = await db.query.account.findMany({
    where: and(eq(account.userId, userId), eq(account.providerId, "google")),
  });
  const row = rows.find((r) => hasCalendarScopes(r.scope));
  if (!row) {
    throw new CalendarNotConnectedError(
      `No Google account with calendar scopes is linked for user ${userId}`,
    );
  }
  return row;
}

/**
 * Builds a live `google.auth.OAuth2` client carrying a fresh access token for
 * this user's Google account, obtained through Better Auth's
 * `/get-access-token` endpoint (which transparently refreshes using the
 * stored refresh token when the access token is expired or near expiry).
 */
export async function getGoogleAuthClient(userId: string) {
  const accountRow = await getGoogleAccountRow(userId);

  let accessToken: string | null | undefined;
  try {
    const tokens = await auth.api.getAccessToken({
      body: { accountId: accountRow.id, userId },
    });
    accessToken = tokens?.accessToken;
  } catch (err) {
    if (isInvalidGrant(err)) {
      throw new CalendarReauthRequiredError(
        "Google refresh token is invalid or was revoked; reconnect your calendar.",
      );
    }
    throw err;
  }

  if (!accessToken) {
    throw new CalendarReauthRequiredError(
      "Better Auth returned no access token for the connected Google account.",
    );
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

/**
 * Returns a `calendar_v3.Calendar` client authorized for `userId`. Tokens are
 * short-lived, so this (and the auth call inside it) should be done fresh on
 * every call rather than cached across requests.
 */
export async function getGoogleCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const auth2 = await getGoogleAuthClient(userId);
  return google.calendar({ version: "v3", auth: auth2 });
}

/**
 * Detects a revoked/expired refresh token: a GaxiosError carrying
 * `invalid_grant` (from Google's token endpoint, surfaced either directly or
 * via a 400/401 response body), a bare 401 talking to a Google API with an
 * `authError` reason, or Better Auth's `/get-access-token` failing to
 * refresh at all (it wraps every refresh failure, `invalid_grant` included,
 * into a generic `FAILED_TO_GET_ACCESS_TOKEN` APIError, so any such failure
 * is treated as a reauth signal here).
 */
export function isInvalidGrant(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;

  // Better Auth's APIError (better-call) for a failed token refresh.
  if (e.name === "APIError" || e.name === "BetterAuthError") {
    const body = e.body as Record<string, unknown> | undefined;
    const code = (body?.code ?? e.code) as string | undefined;
    if (code === "FAILED_TO_GET_ACCESS_TOKEN") return true;
  }

  // The raw OAuth2 token-endpoint error shape (`{ error: "invalid_grant", ... }`).
  if (e.error === "invalid_grant") return true;

  const message = String(e.message ?? "");
  if (message.includes("invalid_grant")) return true;

  // GaxiosError from a Google API call made with a stale/revoked access token.
  const response = (e as { response?: { status?: number; data?: unknown } }).response;
  const status = (e.status ?? e.code ?? response?.status) as unknown;
  if (status === 401) {
    const data = response?.data as Record<string, unknown> | undefined;
    const nested = data?.error as { errors?: Array<{ reason?: string }>; message?: string } | string | undefined;
    if (typeof nested === "string" && nested.includes("invalid_grant")) return true;
    if (nested && typeof nested === "object") {
      if (nested.errors?.some((x) => x.reason === "authError" || x.reason === "invalid_grant")) return true;
      if (String(nested.message ?? "").toLowerCase().includes("invalid credentials")) return true;
    }
    // A bare 401 from Google here almost always means the access token was
    // rejected (revoked/expired grant) — treat it as a reauth signal too.
    return true;
  }

  return false;
}
