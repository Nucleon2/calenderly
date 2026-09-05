# Self-hosting

## Requirements

- Docker and Docker Compose.
- A domain name you can point at the server, with a reverse proxy that terminates HTTPS
  (Caddy, nginx, Traefik, or similar). The app itself does not terminate TLS.
- An SMTP account (any provider, including your own mail server) to send confirmation,
  cancellation, and reminder emails.

## Production checklist

1. **HTTPS via a reverse proxy.** `APP_URL` must be the public `https://` URL you serve the app
   at. Better Auth validates request origins against `APP_URL`, and a mismatch (for example
   running behind a proxy that isn't forwarding the right host) produces an "Invalid origin"
   error at sign-in. The app listens on plain HTTP internally; put a reverse proxy in front of it
   for TLS.

   Minimal Caddy example (`Caddyfile`):

   ```
   schedule.example.com {
       reverse_proxy localhost:3000
   }
   ```

   Minimal nginx example:

   ```nginx
   server {
       listen 443 ssl;
       server_name schedule.example.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   Cookies set by the app are scoped to `APP_URL`'s host, so the proxy's public hostname and
   `APP_URL` must match exactly (scheme included).

2. **Environment file.** Copy `.env.example` to `.env` and fill in `APP_URL`,
   `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), and the SMTP variables. See
   [configuration.md](configuration.md) for the full reference.

3. **First run.**

   ```bash
   docker compose up -d
   ```

   This starts Postgres and the app. The app container waits for Postgres's healthcheck, then
   applies pending migrations on boot (`RUN_MIGRATIONS_ON_BOOT=true` is set for the `app` service
   in `docker-compose.yml`) before it starts serving requests. Check `GET /api/health` to confirm
   the app booted and can reach its database.

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

Migrations apply automatically on the next boot; there's no separate migration step to run
manually in the default setup.

## Backups

Back up the Postgres data. With the bundled `db` service:

```bash
docker compose exec db pg_dump -U calendly calendly > backup.sql
```

To restore into a fresh database:

```bash
cat backup.sql | docker compose exec -T db psql -U calendly -d calendly
```

Take a backup before every update that changes the schema (i.e. before `docker compose build &&
docker compose up -d` on a version bump), and on whatever schedule your data warrants otherwise.

## Running against an external Postgres

You can point `DATABASE_URL` at any Postgres 16+ instance instead of the bundled `db` service (in
that case, remove or ignore the `db` service in `docker-compose.yml`). The database needs the
`btree_gist` extension, which backs the exclusion constraint that prevents a host from having two
overlapping confirmed bookings:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

The bundled Postgres container installs this automatically on first start via
`docker/postgres-init/01-extensions.sql`. An externally managed database needs a role with
`CREATE EXTENSION` privileges (superuser, or a role granted that specific privilege) to run the
statement above once.

## Scaling notes

This app is designed to run as a single instance:

- The booking-form rate limiter is in-memory per process, not shared across instances.
- Background jobs (reminders, calendar sync) run inside the same Node process as the web server,
  started from `src/instrumentation.node.ts`. There's no separate worker process to deploy.
- pg-boss (the job queue) is backed by Postgres, so job state itself is shared — only the
  in-memory rate limiter is instance-local.

If you need to split the web process from the job worker later, both roles run from the same
Docker image: the worker role would need `startJobs()` invoked without also serving HTTP traffic.
This isn't wired up out of the box.

## Deploying to Vercel

Docker on a VPS is the primary target, but the app also runs on Vercel. Two things differ from
the Docker setup: there's no long-lived process for background jobs, and migrations don't run on
boot.

1. **Provision a Postgres** the functions can reach (Neon, Supabase, Vercel Postgres, RDS, ...).
   Use the provider's *pooled* connection string if it offers one — every warm function instance
   opens its own connections. Enable `btree_gist` as described above.
2. **Import the GitHub repo** in Vercel. The framework preset is Next.js; no build settings need
   changing. `vercel.json` in the repo registers a daily cron job (see *Background jobs* below).
3. **Set the environment variables** from `.env.example` in the project settings:
   `DATABASE_URL`, `APP_URL` (your `https://` Vercel domain), `BETTER_AUTH_SECRET`, the `SMTP_*`
   variables and `EMAIL_FROM`, optionally `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, and
   `CRON_SECRET` (`openssl rand -hex 32`). Vercel passes `CRON_SECRET` to cron invocations
   automatically.
4. **Run the migrations.** Either set the project's Build Command to
   `npm run db:migrate && npm run build` (the build container must be able to reach the
   database), or set `RUN_MIGRATIONS_ON_BOOT=true` so each cold start applies pending
   migrations before serving (idempotent, but adds latency to cold starts).
5. **Deploy**, open `APP_URL`, and check `GET /api/health`.

**Background jobs.** Reminder emails and Google Calendar sync are queued in Postgres (pg-boss).
In Docker a polling worker inside the web process handles them; on Vercel that worker is
disabled because the process is frozen between requests. Instead a scheduler must call
`GET /api/jobs/run` (authenticated with `CRON_SECRET`), which processes everything that's due
and returns. Reminders can be late by up to one scheduler interval.

- **Vercel Pro:** change the schedule in `vercel.json` to `* * * * *` so Vercel Cron hits the
  endpoint every minute. Vercel passes `CRON_SECRET` automatically.
- **Vercel Hobby:** Vercel Cron is limited to once a day (a more frequent schedule fails the
  deploy), so `vercel.json` ships with a daily schedule (`0 3 * * *`) as a safety net and the
  real driver is the GitHub Actions workflow in `.github/workflows/run-jobs.yml`, which calls
  the endpoint every 5 minutes. Enable it by adding a repository secret `CRON_SECRET` (same
  value as on Vercel) and a repository variable `APP_URL` (your `https://` Vercel domain).
  GitHub pauses scheduled workflows on public repos after 60 days without commits; push
  something or re-enable it from the Actions tab. Any other scheduler (cron-job.org, a systemd
  timer on a box you own) calling `https://<your-domain>/api/jobs/run?secret=<CRON_SECRET>`
  works just as well.

**Things that don't apply on Vercel.** `output: "standalone"` and `RUN_MIGRATIONS_ON_BOOT`
defaults are Docker concerns; both are handled automatically when `VERCEL` is set. The booking
rate limiter is per-instance memory, so it's weaker than on a single VPS.

## Troubleshooting

**"Invalid origin" error at sign-in or sign-up.**
`APP_URL` doesn't match the URL you're actually accessing the app through (scheme, host, or
port). Fix `APP_URL` in `.env` and restart the app container.

**Emails aren't arriving.**
If the app runs in Docker and you use the bundled Mailpit, set `SMTP_HOST=mailpit`: inside the
app container `localhost` is the container itself. Otherwise check `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` in
`.env`. Then check the app container's logs (`docker compose logs app`) for SMTP connection or
authentication errors — Nodemailer logs the underlying error when a send fails.

**Google Calendar says a connection "needs reconnection".**
The stored refresh token was revoked or expired. This happens if the Google OAuth consent screen
is left in "Testing" status (refresh tokens expire after 7 days) or if the user revoked app
access from their Google account. See [google-calendar.md](google-calendar.md) for how to publish
the OAuth app and how to reconnect.
