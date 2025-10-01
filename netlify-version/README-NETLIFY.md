# Interactive English Tutor – Netlify Edition

This folder contains a self-contained Netlify deployment of the Interactive English Tutor application. It mirrors the Express/SPA project structure but compiles the backend into Netlify Functions so the API and frontend can be served from one Netlify site.

## Prerequisites
- Node.js 18+
- npm
- Netlify CLI (`npm install -g netlify-cli`)
- Supabase project & credentials
- OpenAI API key

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `JWT_SECRET`
   - Any other variables referenced in `api/config`

3. **Run in Netlify Dev**
   ```bash
   npm run dev:netlify
   ```
   Netlify Dev serves the frontend at http://localhost:8888 and proxies API calls to `/.netlify/functions/api`.

4. **Run with separate servers (optional)**
   ```bash
   npm run dev
   ```
   Starts the Vite dev server and the Express API for side-by-side comparison.

## Build & Deploy

- `npm run build` – Type-check and build the Vite frontend.
- `npm run build:netlify` – Alias for the standard build (used by Netlify).
- `npm run deploy:netlify` – Deploy using the Netlify CLI.

## Netlify Configuration

- `netlify.toml` configures build commands, redirects, and security headers.
- `netlify/functions/api.ts` is the single function entry point that wraps the Express API via `serverless-http`.

## Notes
- Functions have a 30s timeout by default (configurable in `netlify.toml`).
- Cold starts can add a few seconds to the first request.
- All API routes continue to live under `/api` thanks to the redirect rule.
- Remember to keep secrets out of source control—use the Netlify UI or `netlify env:set`.

## Troubleshooting
- Run `npm run check` for TypeScript issues.
- Use `netlify functions:serve` (via `netlify dev`) to inspect serverless logs locally.
- Verify Supabase connectivity with `/api/health/checks`.

For additional architecture details, see the main `README.md` alongside this file.
