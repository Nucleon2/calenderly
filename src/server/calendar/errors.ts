/** Typed errors thrown by the calendar service and its providers. */

/** No calendar connection (or no scoped Google account) exists for the user. */
export class CalendarNotConnectedError extends Error {
  constructor(message = "No calendar connection found for this user") {
    super(message);
    this.name = "CalendarNotConnectedError";
  }
}

/** The stored refresh token is invalid, expired or was revoked; the user
 * must reconnect their calendar. Also thrown when a connection's status is
 * already `needs_reauth`. */
export class CalendarReauthRequiredError extends Error {
  constructor(message = "Calendar connection needs to be reconnected") {
    super(message);
    this.name = "CalendarReauthRequiredError";
  }
}

/** GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured. */
export class GoogleNotConfiguredError extends Error {
  constructor(
    message = "Google Calendar is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
  ) {
    super(message);
    this.name = "GoogleNotConfiguredError";
  }
}
