# Architecture

## Request flow: creating a booking

1. **Booking page** (`src/app/(public)/[username]/[eventSlug]/page.tsx`) loads the event type
   and renders a month calendar. The client calls the `getSlotsAction` server action for the
   visible month, in the invitee's browser timezone.
2. **`getSlotsAction`** (`.../actions.ts`) validates the timezone and month range, converts the
   local month boundaries to a precise UTC instant range with `localMinutesToUtc`, and delegates
   to `getSlotsForEventType` (`src/server/bookings/slots-service.ts`), which assembles the slot
   engine's inputs (schedule, confirmed bookings, external busy time) and calls the pure engine.
3. The invitee picks a slot and submits the booking form, which posts to **`submitBookingAction`**.
   Before touching the database, it:
   - Checks a honeypot field and a minimum time-on-page, both failing with the same generic
     error so bots can't distinguish which check tripped.
   - Applies an in-memory sliding-window rate limit, keyed both per event type and per client IP
     (`src/lib/rate-limit.ts`).
   - Validates the form payload against `createBookingSchema` (zod).
4. **`createBooking`** (`src/server/bookings/service.ts`) re-loads the event type, re-assembles
   the slot engine inputs, and re-checks that the specific requested slot is still available
   (`isSlotAvailable`) — the availability shown to the invitee a few seconds earlier is not
   trusted as still valid.
5. The booking is inserted inside a transaction. The database's own exclusion constraint is the
   final authority against a race between two concurrent bookings for the same overlapping time:
   if it fires, the insert fails with Postgres error `23P01`, which the service maps back to the
   same `SlotUnavailableError` the pre-check would have thrown.
6. After the transaction commits: a calendar-sync job is enqueued (`calendar.sync`, action
   `create`), confirmation emails are sent to host and invitee (with `.ics` attachments), and
   reminder jobs are scheduled per the event type's `reminderOffsetsMinutes`.
7. The client is redirected to `/booking/{uid}` (confirmation page).

## Data model summary

| Table | Key columns | Notes |
|---|---|---|
| `user` (Better Auth) | `username`, `timezone`, `defaultScheduleId`, `onboardingCompletedAt` | Extended with app-specific columns alongside Better Auth's base fields. |
| `session`, `account`, `verification` (Better Auth) | — | `account` holds Google OAuth tokens and granted `scope`. |
| `availability_schedules` | `userId`, `timezone`, `isDefault` | One default per user (partial unique index). |
| `availability_rules` | `scheduleId`, `weekday` (0=Sunday), `startMinute`, `endMinute` | Multiple rows per weekday allowed (e.g. split shifts). |
| `date_overrides` | `scheduleId`, `date`, `isUnavailable` | Unique per (schedule, date). |
| `date_override_intervals` | `dateOverrideId`, `startMinute`, `endMinute` | Custom hours for a non-unavailable override. |
| `event_types` | `ownerUserId`, `slug`, `durationMinutes`, `locationType`, `scheduleId`, buffers, `minNoticeMinutes`, `slotIntervalMinutes`, `maxBookingsPerDay`, `dateRangeType`/`dateRangeDays`/`dateRangeFrom`/`dateRangeTo`, `isSecret`, `reminderOffsetsMinutes` | Unique per (owner, slug). `scheduleId` null falls back to the owner's default schedule. |
| `event_type_questions` | `eventTypeId`, `type`, `label`, `required`, `options` | Custom booking-form questions. |
| `bookings` | `uid` (nanoid, public id), `eventTypeId`, `hostUserId`, `startUtc`/`endUtc`, `status`, invitee fields, `answers` (jsonb), `rescheduledFromId`, `icsSequence`, `externalCalendarEventId`/`externalCalendarId` | See double-booking prevention and reschedule model below. |
| `calendar_connections` | `userId`, `provider`, `accountId` (FK to Better Auth `account`), `externalEmail`, `destinationCalendarId`, `status` | Unique per (user, provider, externalEmail). `status: 'needs_reauth'` disables sync without deleting the connection. |
| `selected_calendars` | `connectionId`, `externalCalendarId`, `isCheckedForConflicts` | One row per calendar Google exposes for the connection; conflict-checking is opt-in per calendar. |
| `pgboss.*` | — | Owned entirely by pg-boss; holds job state for the `booking.reminder` and `calendar.sync` queues. |

## Slot engine

`src/server/availability/slots.ts` is a pure function, no I/O:

1. Clamp the requested `[rangeStart, rangeEnd]` by the event type's date-range policy (rolling
   N days / fixed range / indefinite) and by `now + minNoticeMinutes`.
2. For each calendar date in the schedule's timezone: a date override wins if one exists
   (unavailable → no slots that day; custom intervals → use those instead of the weekly rule),
   otherwise fall back to the weekly rules for that weekday. Each local interval is converted to
   a UTC instant on that specific calendar date, so DST transitions are handled per-date rather
   than with a fixed offset.
3. Confirmed bookings and external busy intervals are merged, expanded by the event type's
   `bufferAfterMinutes`/`bufferBeforeMinutes` (a booking's "neighborhood"), and subtracted from
   the free intervals computed in step 2 (interval sweep, not a naive per-minute scan).
4. The remaining free intervals are stepped through by `slotIntervalMinutes` (defaulting to the
   event's `durationMinutes`), keeping only candidates where the full duration fits inside a free
   interval and the start satisfies the minimum-notice cutoff.
5. `maxBookingsPerDay` (if set) is enforced by counting confirmed bookings per schedule-local
   calendar date and excluding candidate slots on days already at the cap.
6. Slots are grouped into the result map by the **invitee's** local date (not the host's), so a
   slot that's 23:30 host-time correctly lands under the invitee's next calendar day.

The DB-aware wrapper, `assembleSlotInput` / `getSlotsForEventType`
(`src/server/bookings/slots-service.ts`), loads the event type and schedule, queries confirmed
bookings for the host in range, asks the calendar provider for busy intervals, and calls the pure
engine with that assembled input. `createBooking` calls the same assembly function to re-validate
a single candidate slot immediately before inserting.

## Double-booking prevention

Two independent layers:

1. **Application-level re-check**: `createBooking` recomputes availability for the exact
   requested slot right before inserting, rather than trusting a slot list rendered moments
   earlier.
2. **Database-level exclusion constraint**: `bookings` carries
   `EXCLUDE USING gist (host_user_id WITH =, tstzrange(start_utc, end_utc, '[)') WITH &&) WHERE
   (status = 'confirmed')`, backed by the `btree_gist` extension. This makes it structurally
   impossible for one host to have two overlapping `confirmed` bookings, even under concurrent
   requests that both pass the application-level check. A constraint violation surfaces as
   Postgres error `23P01`, which the service layer maps to `SlotUnavailableError`.

Cancelled and rescheduled bookings are excluded from the constraint's `WHERE` clause, so they
never contend for a time slot.

## Reschedule model

Rescheduling does not mutate the original row. Instead, in one transaction:

- A new `bookings` row is inserted with a new `uid`, the new `startUtc`/`endUtc`, and
  `rescheduledFromId` pointing at the original booking's id. `icsSequence` is the old booking's
  `icsSequence + 1`.
- The original row's `status` is set to `rescheduled`.

The original booking's cancel/reschedule links, if visited again, resolve forward to the new
`uid` by looking up `rescheduledFromId`. For ICS purposes, the *entire chain* of reschedules
shares one calendar-invite identity: `resolveRootBookingId` walks `rescheduledFromId` back to the
earliest booking in the chain, and that root id is used as the ICS `UID` so a calendar client
treats every version as the same event, just updated.

## ICS semantics

`src/server/email/ics.ts` builds an RFC 5545 `VCALENDAR` per email:

- `UID` is the reschedule-chain root booking id (see above) — stable across reschedules.
- `SEQUENCE` is `booking.icsSequence`, incremented on every reschedule so calendar clients treat
  it as an update rather than a stale duplicate.
- `METHOD:REQUEST` for a new booking or a reschedule; `METHOD:CANCEL` (with `STATUS:CANCELLED`)
  for a cancellation.
- Attached to the email as `text/calendar; charset=utf-8; method=REQUEST` (or `CANCEL`), which is
  what tells calendar clients to treat it as an actionable invite rather than a plain attachment.

## Jobs

Background work runs on [pg-boss](https://github.com/timgit/pg-boss), a Postgres-backed queue,
started in-process from `src/instrumentation.node.ts` (skipped entirely when
`DISABLE_JOBS=true`). Two queues, defined in `src/server/jobs/boss.ts`:

- **`booking.reminder`**: one job per configured reminder offset (default 24h and 1h before
  start), enqueued by `scheduleReminders` with `singletonKey = "${bookingId}:${offsetMinutes}"`
  and `startAfter` set to the send time. Cancelling or rescheduling a booking deletes its pending
  reminder jobs by `singletonKey` prefix (`cancelReminders`). The handler
  (`src/server/jobs/worker.ts`) re-validates before sending: it re-loads the booking and skips
  the send if it's no longer `confirmed`, if `startUtc` has changed since the job was scheduled
  (the booking moved), or if the start time has already passed.
- **`calendar.sync`**: one job per booking mutation (`create`/`update`/`delete`), enqueued by
  `enqueueCalendarSync` with `singletonKey = "${bookingId}:${action}"` so re-enqueuing the same
  action while one is pending coalesces rather than piling up duplicates. The handler resolves
  the host's calendar provider and calls the corresponding method, persisting the returned
  external event id/calendar id/meeting URL back onto the booking row.

Both queues use `retryLimit` with backoff, so a transient Google API or SMTP failure is retried
rather than silently dropped.

## Calendar provider abstraction

`src/server/calendar/provider.ts` defines the `CalendarProvider` interface:
`getBusyIntervals`, `createEvent`, `updateEvent`, `deleteEvent`. Two implementations:

- **`NoopProvider`**: does nothing (empty busy intervals, no event created). Used for any host
  without an active Google connection, so the rest of the booking flow works identically with or
  without calendar sync.
- **`GoogleCalendarProvider`** (`src/server/calendar/google/provider.ts`): backed by the Google
  Calendar API (`googleapis`). Queries `freebusy.query` across the user's checked calendars for
  conflicts, creates/updates/deletes events on the destination calendar with `sendUpdates: "none"`
  (this app sends its own emails), and requests a Google Meet link via
  `conferenceDataVersion: 1` when the event type's location is Google Meet. An `invalid_grant`
  response from Google (revoked/expired refresh token) marks the connection `needs_reauth`
  instead of failing the whole booking flow — the booking still succeeds, just without calendar
  sync until the user reconnects.

`getProviderForUser` (`src/server/calendar/service.ts`) resolves which implementation to use per
host: `GoogleCalendarProvider` only when that user has an `active` Google connection, `NoopProvider`
otherwise (including on any lookup failure — a broken calendar integration must never break
booking).

## What's deliberately not built yet

Per the project's scope (see the README's "Project status" section): organizations/teams,
collective and round-robin event types, routing forms, Outlook/CalDAV calendar providers, embeds
(inline/popup widgets), webhooks and a public API, a workflow/custom-email-template editor, SMS,
payments, and custom branding. Also out of scope entirely: SSO/SAML, audit logs, and any kind of
AI features.
