# Cloudflare Worker API for Tutoring

This folder contains a Cloudflare Worker-compatible backend for the tutoring app.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start local dev server:
   ```bash
   npm run dev
   ```

## Deployment

1. Authenticate Wrangler:
   ```bash
   wrangler login
   ```
2. Deploy:
   ```bash
   npm run deploy
   ```

## Environment Variables

Set Supabase and OpenAI credentials in the Cloudflare dashboard or via Wrangler secrets:
- SUPABASE_URL
- SUPABASE_KEY
- OPENAI_API_KEY
