# Configuration reference

All configuration is environment variables, validated at startup by `src/lib/env.ts` (via zod).
If a required variable is missing or invalid, the app fails fast with a list of the problems
instead of starting in a broken state.

## Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Postgres connection string, e.g. `postgres://user:pass@host:5432/db`. |
| `APP_URL` | Yes | — | Public base URL of this deployment, no trailing slash (a trailing slash is stripped automatically). Used to validate auth request origins, build OAuth callback and email links. Must be `https://` in production. |
| `BETTER_AUTH_SECRET` | Yes | — | Random secret used to sign sessions, at least 16 characters. Generate with `openssl rand -base64 32`. |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production`. Set to `production` in Docker automatically. |

## Email (SMTP)

| Variable | Required | Default | Description |
|---|---|---|---|
| `SMTP_HOST` | Yes | — | SMTP server hostname. |
| `SMTP_PORT` | No | `587` | SMTP port. |
| `SMTP_USER` | No | `""` | SMTP username. Leave empty for a local/open-relay dev server (Mailpit, MailHog) — the transport omits auth entirely when this is blank. |
| `SMTP_PASS` | No | `""` | SMTP password. |
| `SMTP_SECURE` | No | `false` | `true` for implicit TLS (typically port 465); `false` for STARTTLS (typically 587) or unencrypted (25/1025). |
| `EMAIL_FROM` | Yes | — | The `From` address on outgoing mail, e.g. `"Scheduling <noreply@example.com>"`. Must be a sender your SMTP provider allows you to send as — see provider notes below. |

## Google (optional)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | No | `""` | OAuth client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | No | `""` | OAuth client secret. |

Both must be set for Google sign-in and Google Calendar sync to appear; leaving both blank
disables the feature entirely (the settings page shows setup instructions instead). See
[google-calendar.md](google-calendar.md).

## Postgres container (docker compose only)

These only affect the bundled `db` service in `docker-compose.yml`; they have no effect if you
point `DATABASE_URL` at an external database.

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | No | `calendly` | Superuser created in the Postgres container. |
| `POSTGRES_PASSWORD` | No | `calendly` | Password for that user. |
| `POSTGRES_DB` | No | `calendly` | Database created on first container start. |

## Runtime / operational flags

These aren't in `.env.example` because most self-hosters never need to touch them, but they are
read directly from `process.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `RUN_MIGRATIONS_ON_BOOT` | No | `false` | When `true`, pending Drizzle migrations run automatically before the app starts serving requests (see `src/instrumentation.node.ts`). The Docker image and `docker-compose.yml` both set this to `true`; you generally don't need to set it yourself. |
| `DISABLE_JOBS` | No | `false` (unset) | When set to the string `"true"`, skips starting the pg-boss job queue (reminders, calendar sync) entirely. Used by tests/CI so importing the job module doesn't spin up polling workers against the test database. Don't set this in a normal deployment — reminders and calendar sync won't run. |
| `SKIP_ENV_VALIDATION` | No | unset | When set to `"1"`, skips zod validation of environment variables entirely and returns `process.env` as-is. Used only during the Docker image build step (`npm run build`), where no real runtime env is available yet. Never set this when actually running the app — a misconfigured deployment will fail in stranger ways than the validation error it's meant to produce. |
| `PORT` | No | `3000` | Port the Next.js server listens on. Set to `3000` in the Docker image; change it (and the corresponding `docker-compose.yml` port mapping) if you need a different internal port. |

## SMTP provider examples

Any SMTP-speaking provider works. `EMAIL_FROM` must be an address or domain the provider has
verified you're allowed to send as — an unverified sender is usually silently dropped or
rejected, not delivered.

**Gmail (app password)**

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=<16-character app password>
SMTP_SECURE=false
EMAIL_FROM="Scheduling <you@gmail.com>"
```

Requires 2-Step Verification enabled on the account, then an App Password generated for "Mail".

**Mailgun**

```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=<mailgun smtp password>
SMTP_SECURE=false
EMAIL_FROM="Scheduling <noreply@yourdomain.com>"
```

`EMAIL_FROM` must be on a domain you've verified in Mailgun.

**Amazon SES**

```
SMTP_HOST=email-smtp.<region>.amazonaws.com
SMTP_PORT=587
SMTP_USER=<SES SMTP username>
SMTP_PASS=<SES SMTP password>
SMTP_SECURE=false
EMAIL_FROM="Scheduling <noreply@yourdomain.com>"
```

Requires the sending identity (address or domain) to be verified in SES, and the account to be
out of the SES sandbox if you need to email arbitrary invitees.

**Postmark**

```
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=<Postmark server token>
SMTP_PASS=<Postmark server token>
SMTP_SECURE=false
EMAIL_FROM="Scheduling <noreply@yourdomain.com>"
```

Postmark uses the same server token for both `SMTP_USER` and `SMTP_PASS`. `EMAIL_FROM` must be a
verified sender signature or domain.

**Local Mailpit (development only)**

```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
EMAIL_FROM="Scheduling <noreply@example.com>"
```

Start Mailpit with `docker compose --profile dev up -d mailpit`; view sent mail at
`http://localhost:8025`. No credentials needed. This is what `.env.example` ships by default.
