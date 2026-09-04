# Google Calendar integration

Connecting Google Calendar lets the app check your existing events for conflicts when computing
available slots, and write new bookings onto a calendar of your choice (with a Google Meet link
for Google Meet event types). This is optional — without it, availability is based purely on your
configured schedule.

## 1. Create a Google Cloud project

Go to the [Google Cloud Console](https://console.cloud.google.com/), create a new project (or
use an existing one), and select it.

## 2. Enable the Google Calendar API

In **APIs & Services > Library**, search for "Google Calendar API" and enable it for the project.

## 3. Configure the OAuth consent screen

In **APIs & Services > OAuth consent screen**:

- User type: **External** (unless you have a Google Workspace organization and want to restrict
  it to internal users).
- Scopes: add `https://www.googleapis.com/auth/calendar.readonly` and
  `https://www.googleapis.com/auth/calendar.events`. These cover listing calendars, reading
  busy/free periods, and creating/updating/deleting events on the destination calendar.
- Test users (while in Testing status): add your own Google account so you can connect it before
  publishing.

**Publish the app.** While the consent screen is in "Testing" status, Google issues refresh
tokens that expire after 7 days — calendar sync will silently stop working for anyone who
connected, and they'll need to reconnect weekly. Publishing to "In production" avoids this. For a
self-hosted app used by you or a small team, publishing triggers Google's "unverified app"
warning screen for anyone connecting (since you likely haven't gone through Google's verification
review) — this is expected and fine to click through for personal or small-scale use. Google caps
unverified apps at 100 users total.

## 4. Create the OAuth client

In **APIs & Services > Credentials**, create an **OAuth client ID**:

- Application type: **Web application**.
- Authorized redirect URI: `${APP_URL}/api/auth/callback/google` — substitute your actual
  `APP_URL`, e.g. `https://schedule.example.com/api/auth/callback/google`.

Save the generated **Client ID** and **Client secret**.

## 5. Set environment variables

```
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
```

Restart the app. Until both are set, the Calendars settings page shows setup instructions instead
of a connect button (see `src/components/settings/google-setup-notice.tsx`).

## 6. Connect from the app

Sign in, go to **Settings > Calendars**, and connect your Google account. You'll be sent through
Google's consent screen requesting the scopes above, then back to the app. After connecting, you
can choose:

- Which calendars are **checked for conflicts** (their busy time blocks out slots on your booking
  page).
- Which calendar is the **destination calendar** (new bookings are created here).

## What the integration does

- **Conflict checking**: for each calendar you've checked, the app queries Google's free/busy
  API and treats busy periods as unavailable when computing slots, in addition to your configured
  availability schedule.
- **Event creation**: when someone books, an event is created on your destination calendar with
  the invitee as an attendee. Google Meet event types get a Meet link attached
  (`conferenceDataVersion: 1`), returned by Google and stored on the booking.
- **Suppressed Google invitations**: events are created with `sendUpdates: "none"` — Google does
  not send its own invitation/update emails to the invitee. This app sends its own confirmation,
  cancellation, and reschedule emails with `.ics` attachments instead, so invitees aren't
  double-notified.
- **Reschedule and cancel**: the corresponding Google Calendar event is updated or deleted to
  match.

## Disconnecting

From **Settings > Calendars**, disconnect the calendar. This removes the stored connection and
calendar selections. It does not revoke the underlying Google account link used for sign-in (if
you also use "Sign in with Google"), since your login may depend on it. To fully revoke access,
remove the app from your [Google Account's connected apps](https://myaccount.google.com/permissions).

## Troubleshooting

**Settings page says "needs reconnection".**
The stored refresh token was rejected by Google (`invalid_grant`), most commonly because:

- The OAuth consent screen is still in "Testing" status and the 7-day refresh token expired —
  publish the app (step 3).
- You revoked the app's access from your Google account.

Reconnect from **Settings > Calendars** to fix it.

**Booking slots don't reflect an event on my calendar.**
Confirm that calendar is checked under "check for conflicts" in Settings > Calendars — only
checked calendars are queried for busy time.

**No Meet link on a booking.**
Meet links are only requested for event types with location type "Google Meet". Confirm the
event type's location is set correctly, and that the connection status is "active", not "needs
reconnection".
