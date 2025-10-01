# Netlify Dev Fix - Login 404 Issue

## Problem
When running `npm run dev:netlify`, API requests to `/api/*` endpoints were returning 404 errors because:
1. Netlify CLI was not loading/building the serverless functions
2. The redirect in `netlify.toml` was routing to non-existent functions

## Solution

### 1. Modified `netlify.toml`
Changed the API redirect to proxy directly to the Express server instead of routing to Netlify functions:

```toml
[[redirects]]
  from = "/api/*"
  to = "http://localhost:3002/api/:splat"
  status = 200
  force = true
```

**Why this works:**
- In development, Express server runs on port 3002
- Netlify Dev proxies all `/api/*` requests directly to Express
- Avoids the function bundling issue entirely

### 2. Updated `package.json` dev:netlify script
Modified the script to run both Express server and Netlify Dev concurrently:

```json
"dev:netlify": "concurrently \"npm run server:dev\" \"VITE_API_URL=http://localhost:3002 netlify dev\""
```

**What this does:**
- Starts Express API server on port 3002
- Starts Netlify Dev which runs Vite and proxies requests
- Sets `VITE_API_URL` environment variable for proper configuration

### 3. Updated `vite.config.ts`
Modified proxy logic to work even when Netlify Dev is running:

```typescript
const useProxy = process.env.VITE_API_URL === 'http://localhost:3002' || 
                 process.env.NETLIFY_DEV !== 'true';
```

**Why this is needed:**
- Ensures Vite's proxy is active when needed
- Allows API requests to flow through properly

## How to Use

### Development
```bash
cd /workspaces/tutoring/netlify-version
npm run dev:netlify
```

This starts:
- **Express API**: `http://localhost:3002` (backend server)
- **Vite Dev Server**: `http://localhost:5173` (frontend build tool)
- **Netlify Dev**: `http://localhost:8888` (unified development server)

**Access your app at**: `http://localhost:8888`

All API requests to `http://localhost:8888/api/*` are automatically proxied to Express on port 3002.

### Production Deployment

For production deployment to Netlify, the serverless function at `netlify/functions/api.ts` will be used instead of the Express server. The redirect should be changed back to:

```toml
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200
```

**Note**: The serverless function has been updated to work correctly:
- Import path fixed: `import app from '../../api/app'` (no `.js` extension)
- No `basePath` configuration in serverless-http (Express handles full paths)

## Architecture Overview

### Development Flow
```
Browser → http://localhost:8888/api/auth/login
    ↓
Netlify Dev (redirects via netlify.toml)
    ↓
http://localhost:3002/api/auth/login
    ↓
Express API Server → Response
```

### Production Flow (when functions work)
```
Browser → https://your-site.netlify.app/api/auth/login
    ↓
Netlify Edge (redirects)
    ↓
/.netlify/functions/api/auth/login
    ↓
Serverless Function (wraps Express app) → Response
```

## Files Modified

1. **netlify.toml** - Changed redirect target for development
2. **package.json** - Updated `dev:netlify` script to run Express alongside Netlify
3. **vite.config.ts** - Modified proxy logic for Netlify Dev compatibility
4. **netlify/functions/api.ts** - Fixed import path and removed basePath
5. **api/app.ts** - Added CORS origins for Netlify Dev (localhost:8888 and 127.0.0.1:8888)

## CORS Configuration

The Express server now allows requests from:
- `http://localhost:3000`
- `http://localhost:5173` (Vite)
- `http://localhost:5174` (Vite alt port)
- `http://localhost:8888` (Netlify Dev)
- `http://127.0.0.1:8888` (Netlify Dev IPv4)
- `http://127.0.0.1:5173` (Vite IPv4)
- `http://127.0.0.1:5174` (Vite alt port IPv4)

## Testing

All endpoints work correctly:

```bash
# Health check
curl http://localhost:8888/api/health

# Login attempt
curl -X POST http://localhost:8888/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```

## Alternative: Use Standard Dev Server

If you don't need Netlify-specific features during development, you can use:

```bash
npm run dev
```

This runs the same Express + Vite setup without Netlify CLI, which is simpler and faster.
