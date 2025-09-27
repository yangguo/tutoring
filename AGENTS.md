# Repository Guidelines

## Project Structure & Module Organization
- `src/` React + TypeScript client: `components/` (PascalCase), `pages/` (route views), `hooks/` (`useX`), `stores/` (Zustand `xStore.ts`), `lib/` (`api.ts`, `utils.ts`), `public/` static assets.
- `api/` Express + TypeScript server: `routes/`, `config/` (env, Supabase), `chat/`, `utils/`, `scripts/` (seeding). Local entry: `api/server.ts`; Vercel entry: `api/index.ts`.
- `api-cloudflare/` Cloudflare Worker API (Hono + TypeScript). Mirrors the Express endpoints that the frontend calls: auth, books, dashboard, chat, uploads, etc. Local dev via `npm run dev` (wrangler), deploy via `npm run deploy`.
- `supabase/` SQL migrations; keep new migrations atomic and reversible.

## Build, Test, and Development Commands
- `npm run dev` – run client (Vite) and server (Nodemon) together.
- `npm run client:dev` – client only at `http://localhost:5173` (set `VITE_API_URL` to the active API origin).
- `npm run server:dev` – Express API only at `http://localhost:3002`.
- `npm run build` – type-check and build client for production.
- `npm run preview` – serve built client.
- `npm run lint` / `npm run check` – ESLint / TypeScript checks.
- `npm run seed:demo` – seed Supabase with demo users.
- `cd api-cloudflare && npm run dev` – local Cloudflare Worker (Miniflare) at `http://127.0.0.1:8787` using `.dev.vars` for secrets.
- `cd api-cloudflare && npm run deploy` – deploy Worker via Wrangler.

## Coding Style & Naming Conventions
- TypeScript across client/server/worker; 2-space indent; prefer functional components and hooks.
- Files: components/pages `PascalCase.tsx`; hooks `useThing.ts`; utilities `camelCase.ts`; stores `nameStore.ts`.
- Styling via Tailwind utilities (`src/index.css`). Keep class lists readable and deduplicated.
- Lint with `eslint.config.js`; fix warnings before PRs.
- Worker routes should mirror the Express behaviour (response shapes, auth, Supabase access). Keep logic changes in sync between `api/` and `api-cloudflare/` unless intentionally diverging.

## Testing Guidelines
- No test runner configured yet. Use `npm run check` and `npm run lint` as a baseline.
- If adding tests, prefer Vitest + React Testing Library for `src/` and Vitest for `api/`. Name tests `*.test.ts(x)` adjacent to sources or under `__tests__/`.
- Mock external services (Supabase, OpenAI). Aim to cover critical paths.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat: add lesson chat`). Branch names: `feat/...`, `fix/...`, `chore/...`.
- PRs include: concise description, linked issues, screenshots for UI changes, notes for API/migration updates, and checklist showing `lint`/`check` passed.

## Security & Configuration Tips
- Never commit secrets. Use `.env` with `SUPABASE_*`, `OPENAI_API_KEY`, `JWT_SECRET`, `PORT`.
- Backend loads env via `dotenv`. Verify values before `npm run server:dev`.
- Worker secrets: set via `.dev.vars` for local dev and Wrangler/Cloudflare dashboard for deploy (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `JWT_SECRET`).
- Frontend needs `VITE_API_URL` pointing to the desired API origin (Vercel Express or Cloudflare Worker) for auth and data calls.

## Agent-Specific Instructions
- Scope: repo-wide. Follow existing patterns; keep changes minimal and focused; avoid renames/new deps unless necessary and discussed.
- Use project scripts and paths as shown above; prefer fixing root causes over workarounds.
