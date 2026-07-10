# Meetory Telegram Bot

Meetory is a Telegram bot built with Node.js, TypeScript, grammY, Express, Vercel, Neon PostgreSQL, and Google Calendar API.

PostgreSQL stores only users, Google OAuth connections, shared calendar records, and calendar membership metadata. Events are not stored in PostgreSQL. Events must live only in Google Calendar.

## Public Routes

Vercel routes all public paths to one serverless function: [api/index.ts](api/index.ts).

After deploy, the public URLs are:

```txt
GET  https://<your-vercel-domain>/health
POST https://<your-vercel-domain>/telegram/webhook
GET  https://<your-vercel-domain>/google/oauth
GET  https://<your-vercel-domain>/google/callback
```

There is no public `/api` prefix.

## Environment Variables

Create `.env` locally and configure the same variables in Vercel:

```bash
TELEGRAM_API_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
DATABASE_URL=
APP_BASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
OAUTH_STATE_SECRET=
TOKEN_ENCRYPTION_KEY=
```

`APP_BASE_URL` should be your deployed base URL, for example:

```txt
https://<your-vercel-domain>
```

`GOOGLE_REDIRECT_URI` should be:

```txt
https://<your-vercel-domain>/google/callback
```

Generate secrets:

```bash
openssl rand -base64 32
```

Use one generated value for `OAUTH_STATE_SECRET`. Generate another value for `TOKEN_ENCRYPTION_KEY`. `TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes.

## Neon Setup

1. Create a Neon project at https://neon.tech.
2. Copy the PostgreSQL connection string.
3. Put it in `DATABASE_URL`.
4. Initialize the schema:

```bash
yarn db:init
```

The init script runs [db/init.sql](db/init.sql) and is safe to run more than once.

## Google Cloud Setup

1. Create a Google Cloud project.
2. Enable the Google Calendar API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Web Client.
5. Add this authorized redirect URI:

```txt
https://<your-vercel-domain>/google/callback
```

6. Copy the OAuth client id and secret into:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://<your-vercel-domain>/google/callback
```

Meetory requests only Google Calendar access and Google account email.

## Local Development

Install dependencies:

```bash
yarn install
```

Initialize the database:

```bash
yarn db:init
```

Run typecheck:

```bash
yarn typecheck
```

Start the local Express server:

```bash
yarn start
```

For local Telegram webhook testing, expose the local server with an HTTPS tunnel and set `APP_BASE_URL` to the tunnel URL.

## Vercel Deploy

1. Add all environment variables in Vercel project settings.
2. Deploy to Vercel.
3. Initialize the database from a local machine with production `DATABASE_URL`:

```bash
yarn db:init
```

4. Set the Telegram webhook:

```bash
yarn webhook:set
```

The webhook URL is:

```txt
https://<your-vercel-domain>/telegram/webhook
```

5. Verify health:

```txt
https://<your-vercel-domain>/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "ok"
}
```

## Database Model

Tables:

- `users`
- `google_connections`
- `calendars`
- `calendar_members`

There is intentionally no `events` table. When Meetory saves an event later, it should:

1. identify the Telegram user;
2. ask which Meetory calendar to use;
3. load the Google credentials for the owner connection of that calendar;
4. create the event through the Google Calendar API.

## Not Implemented Yet

- Google calendar creation
- inviting calendar members
- `calendar_members` UI
- event creation
- AI parsing
- reminders
- cron jobs
