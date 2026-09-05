# Calendly Clone

A self-hostable scheduling app: define your availability, publish event types, and let people
book time with you without a login. Confirmation emails, calendar invites, Google Calendar
sync, and reminders are all built in.

## Features

- **Availability schedules**: multiple named schedules, each with its own IANA timezone,
  multiple working intervals per weekday, and date overrides (mark a day unavailable or give it
  custom hours).
- **Event types**: title, duration, location (Google Meet, phone, in-person, custom), buffers
  before/after, minimum notice, custom slot interval, max bookings per day, rolling/fixed/
  indefinite date ranges, custom booking questions, secret (unlisted) event types.
- **Public booking page**: `/{username}` profile and `/{username}/{event-slug}` booking flow with
  a month calendar, timezone selector, and an invitee form. No invitee account required.
- **Cancel and reschedule**: tokenized links, no login needed on either side.
- **Host dashboard**: upcoming/past bookings, booking detail with question answers, cancel with
  reason, reschedule, CSV export.
- **Email**: confirmation, cancellation, and reschedule emails with `.ics` calendar invites, sent
  through any SMTP provider via Nodemailer. Automatic reminders before each booking.
- **Google Calendar**: checks connected calendars for conflicts, creates events (with Google Meet
  links) on your chosen destination calendar, and keeps them in sync on reschedule/cancel.
- **Docker deployment**: one image, one Postgres database, migrations run automatically on boot.

## Quick start (Docker Compose)

```bash
git clone <this-repo-url>
cd calendly-clone
cp .env.example .env
```

Edit `.env` and set at least:

- `APP_URL` — the public URL you'll reach the app at (e.g. `https://schedule.example.com`, or
  `http://localhost:3000` while trying it out locally).
- `BETTER_AUTH_SECRET` — a random secret: `openssl rand -base64 32`.
- The `SMTP_*` and `EMAIL_FROM` variables, so confirmation emails can actually send.

Then:

```bash
docker compose up -d
```

Open `APP_URL` in a browser and sign up — the first account you create is your host account.
Check `GET /api/health` to confirm the app can reach its database.

Database migrations run automatically on container start (`RUN_MIGRATIONS_ON_BOOT=true` is set
in `docker-compose.yml`). If you point the app at an external Postgres instead of the bundled
`db` service, that database needs the `btree_gist` extension available (the bundled Postgres has
it installed automatically via `docker/postgres-init/01-extensions.sql`); see
[docs/self-hosting.md](docs/self-hosting.md).

## Documentation

- [Self-hosting guide](docs/self-hosting.md) — production deployment, HTTPS, backups, updates,
  [deploying to Vercel](docs/self-hosting.md#deploying-to-vercel).
- [Configuration reference](docs/configuration.md) — every environment variable, SMTP provider
  examples.
- [Google Calendar setup](docs/google-calendar.md) — OAuth app, scopes, connecting an account.
- [Development guide](docs/development.md) — running locally, tests, conventions.
- [Architecture](docs/architecture.md) — request flow, data model, slot engine, jobs.

## Development quick start

Requires Node 20+ and Docker (for Postgres).

```bash
docker compose up -d db
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

The seed script creates a demo host account: `demo@example.com` / `password1234`, with a booking
page at `/demo`.

For local email testing, run Mailpit alongside the dev database:

```bash
docker compose --profile dev up -d mailpit
```

Mailpit's web UI is at `http://localhost:8025`; the default `.env.example` SMTP settings already
point at it.

### Tests

```bash
npm test               # unit tests (Vitest)
npm run test:integration   # integration tests, needs a `calendly_test` database
npm run test:e2e        # Playwright end-to-end tests
```

Create the integration test database once:

```bash
docker compose exec db psql -U calendly -d postgres -c "CREATE DATABASE calendly_test"
docker compose exec db psql -U calendly -d calendly_test -c "CREATE EXTENSION IF NOT EXISTS btree_gist"
```

See [docs/development.md](docs/development.md) for details on each test suite.

## Project status

This is a solo/single-user scheduling tool: one host per booking, one calendar per host. Not
implemented yet: teams/organizations, collective or round-robin event types, Outlook/CalDAV
calendar providers, embeddable widgets, and webhooks/public API.

## License

MIT — see [LICENSE](LICENSE).
