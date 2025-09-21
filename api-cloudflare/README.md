# Cloudflare Worker API for Tutoring

This folder contains the Cloudflare Worker backend for the tutoring app. It mirrors the main Express API so the frontend can talk to either deployment with the same endpoints/response shapes.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.dev.vars` file for Wrangler (see [Environment Variables](#environment-variables)).
3. Start the local dev server (Miniflare):
   ```bash
   npm run dev
   ```
   The Worker runs at `http://127.0.0.1:8787`. Point the frontend `VITE_API_URL` to this origin while testing.

## Deployment

1. Authenticate Wrangler (if you haven't already):
   ```bash
   wrangler login
   ```
2. Deploy the Worker:
   ```bash
   npm run deploy
   ```
   Alternatively, integrate this command into a Cloudflare Pages build to deploy automatically from Git.

## Environment Variables

Set secrets via `.dev.vars` (local) and Wrangler/Cloudflare dashboard (production). Required bindings:

- `SUPABASE_URL`
- `SUPABASE_KEY` (service role key)
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (defaults to `https://api.openai.com/v1` if omitted)
- `OPENAI_MODEL` (e.g., `gpt-3.5-turbo`)
- `JWT_SECRET`

Example `.dev.vars`:

```
SUPABASE_URL=...
SUPABASE_KEY=...
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo
JWT_SECRET=...
```

## Available Routes

- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/books`, `GET /api/books/:id`
- `POST /api/upload/book`, `POST /api/upload/book/:bookId/pages`
- `GET /api/dashboard/*` (students, lessons, progress, analytics)
- `POST /api/chat/lesson`, `POST /api/chat/speaking-practice`
- `GET /api/achievements`, `GET /api/achievements/user/:id`, etc.

Keep Worker routes in sync with the Express API so the frontend can switch between deployments without behavioural changes.
