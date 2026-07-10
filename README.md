# Meetory Telegram Bot

Meetory is a Telegram bot built with Node.js, TypeScript, grammY, Express, Vercel, and Neon PostgreSQL.

PostgreSQL stores only users, Google OAuth connections, shared calendars, and calendar membership metadata.
Events are not stored in PostgreSQL. Events must live only in each user's Google Calendar.

## Setup Neon

1. Create a Neon project at https://neon.tech.
2. Open the Neon dashboard and copy the PostgreSQL connection string.
3. Add it to `.env`:

```bash
DATABASE_URL="postgresql://..."
```

4. Initialize the database schema:

```bash
yarn db:init
```

The init script runs [db/init.sql](db/init.sql) and is safe to run more than once.

## Environment Variables

Create `.env` locally and configure the same variables in Vercel:

```bash
TELEGRAM_API_TOKEN=
DATABASE_URL=
```

`encrypted_refresh_token` is reserved for encrypted Google refresh tokens. Do not store raw refresh tokens in the database.

## Local Development

Install dependencies:

```bash
yarn install
```

Initialize the database:

```bash
yarn db:init
```

Start the local Express server:

```bash
yarn start
```

Local routes:

```txt
GET  /health
POST /telegram/webhook
GET  /google/oauth
GET  /google/callback
```

For local Telegram webhook testing, expose the local server with a HTTPS tunnel and set the Telegram webhook to:

```txt
https://<your-domain>/telegram/webhook
```

## Vercel Deploy

1. Add the environment variables in Vercel project settings:

```bash
TELEGRAM_API_TOKEN
DATABASE_URL
```

2. Deploy to Vercel.
3. Set the Telegram webhook to:

```txt
https://<your-vercel-domain>/telegram/webhook
```

4. Verify the deployment:

```txt
https://<your-vercel-domain>/health
```

## Database Model

Tables:

- `users`
- `google_connections`
- `calendars`
- `calendar_members`

There is intentionally no `events` table. When Meetory saves an event, it should:

1. identify the Telegram user;
2. ask which Meetory calendar to use;
3. load the Google credentials for the owner connection of that calendar;
4. create the event through the Google Calendar API.
