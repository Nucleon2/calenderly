# Development guide

## Stack

- Next.js 16 (App Router, Server Actions), TypeScript strict.
- Tailwind v4 + shadcn/ui components built on Base UI, lucide-react icons.
- react-hook-form + zod (via `@hookform/resolvers`) for forms.
- Postgres 16 + Drizzle ORM, drizzle-kit for migrations.
- Better Auth for email/password and Google sign-in.
- date-fns v4 + `@date-fns/tz` (`TZDate`) for all timezone handling.
- Nodemailer (SMTP) + React Email templates + the `ics` package for calendar invites.
- pg-boss (Postgres-backed queue) for reminders and calendar sync, run in-process.
- Vitest (unit + integration) and Playwright (e2e).

## Repository layout

```
docker/                    Dockerfile, postgres-init/ (btree_gist extension)
docker-compose.yml
drizzle/                   generated SQL migrations + meta/
drizzle.config.ts
src/
  app/
    (public)/[username]/                  profile page (event type list)
    (public)/[username]/[eventSlug]/      booking page + actions.ts (getSlots, submitBooking)
    (public)/booking/[uid]/               confirmation, cancel/, reschedule/
    (auth)/{sign-in,sign-up,onboarding}/
    dashboard/{event-types,availability,bookings,settings}/
    api/auth/[...all]/route.ts            Better Auth handler
    api/health/route.ts
    api/bookings/export/route.ts          CSV export
  server/
    auth/{auth.ts, schema.ts, session.ts}
    availability/{schema.ts, service.ts, slots.ts, errors.ts}   slots.ts is the pure engine
    event-types/{schema.ts, service.ts, errors.ts}
    bookings/{schema.ts, service.ts, slots-service.ts, types.ts, view-model.ts, errors.ts}
    calendar/{provider.ts, service.ts, schema.ts, errors.ts, google/{client.ts, provider.ts, calendars.ts, scopes.ts}}
    email/{mailer.ts, ics.ts, format.ts, transport.ts, types.ts}
    jobs/{boss.ts, reminders.ts, calendar-sync.ts, worker.ts, index.ts}
  lib/{time/{index.ts, intervals.ts}, env.ts, rate-limit.ts, utils.ts}
  db/{client.ts, seed.ts, schema/{auth,availability,event-types,bookings,calendar,relations,index}.ts}
  components/{ui (shadcn), auth, booking, availability, event-types, bookings, dashboard, settings}/
  instrumentation.node.ts   runs migrations (if enabled) and starts pg-boss on boot
emails/                     React Email templates
tests/{unit/, integration/, fixtures/, stubs/}
e2e/booking.spec.ts
```

## Conventions

- **Server actions call services, not the database.** All Drizzle/`db` access lives under
  `src/server/<module>/`. Server actions (`actions.ts` files under `src/app`) and route handlers
  call into service functions; they don't import `@/db` directly.
- **One zod schema per entity**, in `src/server/<module>/schema.ts`, shared by the client form
  (via `@hookform/resolvers/zod`) and the server action/service that validates the same input.
- **Typed errors.** Each module defines its own error classes (e.g.
  `src/server/bookings/errors.ts`: `SlotUnavailableError`, `BookingNotFoundError`,
  `InvalidBookingStateError`, `BookingValidationError`, `EventTypeUnavailableError`). Callers
  catch specific error types to produce user-facing messages instead of leaking raw exceptions.
- **Time handling rules:**
  - Instants (a specific point in time — a booking's start/end, `createdAt`) are always stored
    and passed around as UTC `timestamptz` / JS `Date`.
  - Recurring rules (weekly availability, date overrides) are stored as local minutes-since-
    midnight plus an IANA timezone string on the schedule — never as a fixed UTC offset, so DST
    transitions are handled correctly.
  - The slot engine itself, `src/server/availability/slots.ts`, is a pure function: no database
    or framework imports, just schedule/event-type/busy-interval data in and candidate slots out.
    This is what the exhaustive DST/buffer/notice unit test matrix in
    `tests/unit/availability/` targets.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm start` | Run a production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run db:generate` | Generate a Drizzle migration from schema changes. |
| `npm run db:migrate` | Apply pending migrations. |
| `npm run db:studio` | Drizzle Studio (browse the database). |
| `npm run db:seed` | Idempotent demo data seed (see below). |
| `npm test` | Unit tests (Vitest `unit` project). |
| `npm run test:watch` | Unit tests in watch mode. |
| `npm run test:integration` | Integration tests (Vitest `integration` project), serial. |
| `npm run test:e2e` | Playwright end-to-end tests. |
| `npm run test:all` | Every Vitest project, serial. |

## Local setup

```bash
docker compose up -d db
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run db:seed` is idempotent — it looks up rows by natural key (email, slug, schedule name)
and only inserts what's missing, so running it repeatedly is safe. It creates a demo host
(`demo@example.com` / `password1234`, booking page at `/demo`), a working-hours schedule
(Mon-Fri 9-12 and 13-17, `America/New_York`), a Saturday date override, two event types
("Intro Call", "Consultation" with custom questions), and a few sample bookings.

For local email testing:

```bash
docker compose --profile dev up -d mailpit
```

View sent mail at `http://localhost:8025`; `.env.example`'s default SMTP settings already point
at Mailpit.

## Tests

### Vitest projects

`vitest.config.ts` defines two projects:

- **`unit`** (`tests/unit/**`): pure logic — the slot engine, time helpers, service-level logic
  with mocked dependencies. Runs in parallel, no database required. `npm test`.
- **`integration`** (`tests/integration/**`): exercises real service code against a real
  Postgres database (`tests/integration/helpers/db.ts`, defaulting to `DATABASE_URL=postgres://
  calendly:calendly@localhost:5432/calendly_test`, set by `tests/setup.ts`). These run with
  `fileParallelism: false` — every integration test file shares one database, so concurrent files
  would corrupt each other's state. `npm run test:integration`.

Create the test database once:

```bash
docker compose exec db psql -U calendly -d postgres -c "CREATE DATABASE calendly_test"
docker compose exec db psql -U calendly -d calendly_test -c "CREATE EXTENSION IF NOT EXISTS btree_gist"
```

Both projects alias `server-only` to a stub (`tests/stubs/server-only.ts`) since that package
throws outside Next's react-server condition.

### Playwright e2e

`npm run test:e2e` drives a real browser against `npm run dev` (started automatically by
Playwright's `webServer` config unless `CI` is set). The booking flow test needs the seeded demo
user (`npm run db:seed`) and a running Mailpit instance to check outgoing mail against.

## Adding a migration

1. Edit the table definitions under `src/db/schema/*.ts`.
2. Run `npm run db:generate` to produce a new SQL file under `drizzle/`.
3. **Review the generated SQL.** Drizzle can't express a Postgres `EXCLUDE` constraint, so the
   bookings table's overlap-prevention constraint is hand-added to the migration after
   generation:

   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   -- ...
   ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
     EXCLUDE USING gist ("host_user_id" WITH =, tstzrange("start_utc", "end_utc", '[)') WITH &&)
     WHERE (status = 'confirmed');
   ```

   If a future migration touches the `bookings` table, check whether this constraint needs to be
   re-added or adjusted — drizzle-kit has no way to know about it and won't regenerate it for
   you.
4. Run `npm run db:migrate` to apply it locally, and commit both the migration file and the
   updated `drizzle/meta/` snapshot.

## shadcn / Base UI notes

Components are shadcn/ui built on [Base UI](https://base-ui.com/) rather than Radix, which
changes a couple of familiar patterns:

- Use the **`render` prop** to make a component render as a different element/component, not
  `asChild`. For example: `<AlertDialogAction render={<Button variant="destructive" />}>`.
- **`Select` needs an `items` prop** (an array or map describing the options) in addition to its
  `Select.Item` children, so the trigger can display the selected item's label. See
  `src/components/event-types/event-type-form.tsx` or `src/components/settings/timezone-select.tsx`
  for examples.
