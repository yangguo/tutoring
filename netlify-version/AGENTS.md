# Netlify Version - Agent Instructions

This directory contains the **Netlify deployment version** of the Interactive English Tutor application. When working with files in `netlify-version/**/*`, follow these specific instructions.

## Netlify-Specific Project Structure

- `netlify/functions/` - Netlify serverless functions (CommonJS, not TypeScript)
- `netlify.toml` - Netlify build configuration and redirects
- `api/` - Express + TypeScript server (reused via serverless wrapper)
- `src/` - React + TypeScript client (same as main project)
- `README-NETLIFY.md` - Netlify-specific documentation
- `NETLIFY-DEPLOYMENT-GUIDE.md` - Deployment instructions

## Netlify Build, Test, and Development Commands

- `npm run dev:netlify` – Netlify development server with functions at `http://localhost:8888`
- `npm run build:netlify` – Build for Netlify deployment (frontend + functions)
- `npm run deploy:netlify` – Deploy to Netlify via CLI
- `npm run dev` – Standard development (Express server, for comparison)
- `npm run build` – Standard build (for comparison)
- `npm run lint` / `npm run check` – ESLint / TypeScript checks

## Netlify Serverless Functions

- **Main function**: `netlify/functions/api.js` wraps Express app using `serverless-http`
- **Language**: JavaScript (CommonJS) - esbuild handles bundling
- **Timeout**: 30 seconds (configured in netlify.toml)
- **Base path**: `/.netlify/functions/api` - configured in netlify.toml redirects

### Function Development Rules

1. **Use JavaScript, not TypeScript** - Netlify functions use esbuild with simpler config
2. **CommonJS exports** - Use `exports.handler = async (event, context) => {}`
3. **Dynamic imports** - Use `await import()` for ES modules from `api/`
4. **Error handling** - Always wrap in try/catch with proper HTTP responses
5. **Keep minimal** - Single function wrapping entire Express app for simplicity

## Configuration Files

### netlify.toml
- Build settings: `publish = "dist"`, `command = "npm run build:netlify"`
- API redirects: `/api/*` → `/.netlify/functions/api/:splat`
- SPA fallback: `/*` → `/index.html`
- Security headers and caching rules
- Function timeout and bundler configuration

### Environment Variables
- Set in Netlify dashboard under Site Settings > Environment Variables
- Same variables as main project: `SUPABASE_*`, `OPENAI_*`, `JWT_SECRET`
- **Important**: Production env vars are NOT in `.env` - use Netlify dashboard

## Development Workflow

1. **Local development**: Use `npm run dev:netlify` (Netlify dev server)
2. **Alternative testing**: Use `npm run dev` (standard Express server)
3. **Build testing**: Use `npm run build:netlify` before deployment
4. **Function testing**: Netlify dev server automatically handles function routing

## Deployment Considerations

- **Cold starts**: First request may take 5-10 seconds
- **Bundle size**: Entire Express app included in function
- **Memory usage**: Function includes all Express middleware and dependencies
- **Concurrent requests**: Netlify automatically scales functions

## Key Differences from Main Project

- **Functions vs Express**: Uses Netlify Functions instead of standalone server
- **Configuration**: Uses `netlify.toml` instead of `vercel.json`
- **Development**: Uses `netlify dev` instead of nodemon
- **Deployment**: Uses Netlify CLI/dashboard instead of Vercel

## Testing and Validation

- Always test with `npm run dev:netlify` before deploying
- Verify function loads: Check console for import errors
- Test API routes: All `/api/*` routes should work identically
- Check redirects: SPA routing should work properly
- Monitor function logs in Netlify dashboard

## Agent-Specific Instructions for netlify-version/

- **Scope**: Only work with `netlify-version/**/*` files when addressing Netlify issues
- **Function changes**: Keep `netlify/functions/api.js` minimal - it's just a wrapper
- **API changes**: Make changes in `api/` directory (shared with main project)
- **Configuration**: Update `netlify.toml` for Netlify-specific build/deploy issues
- **Documentation**: Update Netlify-specific docs when making functional changes
- **Testing**: Always test with both `npm run dev:netlify` and standard build process
