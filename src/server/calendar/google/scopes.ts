/**
 * OAuth scopes requested for Google Calendar access.
 *
 * `calendar.readonly` covers `calendarList.list` and `freebusy.query` (needed
 * to read the user's calendar list and busy periods, including secondary
 * calendars they don't own). `calendar.events` covers creating, updating and
 * deleting events on the destination calendar.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

/**
 * True when `scope` (as stored on the Better Auth `account` row) grants every
 * scope in `GOOGLE_CALENDAR_SCOPES`. Better Auth stores scopes comma-joined,
 * but this also tolerates a raw space-delimited OAuth scope string.
 */
export function hasCalendarScopes(scope: string | null | undefined): boolean {
  if (!scope) return false;
  const granted = new Set(
    scope
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return GOOGLE_CALENDAR_SCOPES.every((required) => granted.has(required));
}
