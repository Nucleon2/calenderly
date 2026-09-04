import { google } from "googleapis";
import { CalendarReauthRequiredError } from "../errors";
import { getGoogleAuthClient, getGoogleCalendarClient } from "./client";

export interface GoogleCalendarListEntry {
  id: string;
  name: string;
  primary: boolean;
  canWrite: boolean;
}

const WRITE_ROLES = new Set(["owner", "writer"]);

/** Lists every calendar on the user's Google calendar list (paginated). */
export async function listGoogleCalendars(userId: string): Promise<GoogleCalendarListEntry[]> {
  const calendar = await getGoogleCalendarClient(userId);
  const entries: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await calendar.calendarList.list({
      maxResults: 250,
      showHidden: true,
      pageToken,
    });
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      entries.push({
        id: item.id,
        name: item.summaryOverride ?? item.summary ?? item.id,
        primary: item.primary === true,
        canWrite: WRITE_ROLES.has(item.accessRole ?? ""),
      });
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return entries;
}

/**
 * The Google account's email address: preferably the `id` of the primary
 * calendar list entry (which is always the account's email), falling back to
 * the OAuth2 userinfo endpoint when no primary entry is present.
 */
export async function getGoogleAccountEmail(userId: string): Promise<string> {
  const calendars = await listGoogleCalendars(userId);
  const primary = calendars.find((c) => c.primary);
  if (primary) return primary.id;

  const auth2 = await getGoogleAuthClient(userId);
  const oauth2 = google.oauth2({ version: "v2", auth: auth2 });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) {
    throw new CalendarReauthRequiredError(
      `Could not determine the Google account email for user ${userId}`,
    );
  }
  return data.email;
}
