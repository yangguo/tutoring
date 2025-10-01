# Netlify Deployment Guide

## Prerequisites

1. Netlify account
2. GitHub repository connected to Netlify
3. Environment variables configured in Netlify dashboard

## Netlify Site Configuration

### Base Directory Setting
**CRITICAL**: In your Netlify site settings, set:
- **Base directory**: `netlify-version`

This tells Netlify to look for `netlify.toml` and build files in the `netlify-version` subdirectory.

### Build Settings
These should be automatically detected from `netlify.toml`:
- **Build command**: `npm run build:netlify`
- **Publish directory**: `netlify-version/dist`
- **Functions directory**: `netlify-version/netlify/functions`

## Environment Variables

Add these in Netlify Dashboard → Site Settings → Environment Variables:

```
NODE_ENV=production
JWT_SECRET=<your-secure-secret>
JWT_EXPIRES_IN=7d

SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>

OPENAI_BASE_URL=<your-openai-base-url>
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=<your-model>
OPENAI_VISION_MODEL=<your-vision-model>
OPENAI_VISION_TIMEOUT_MS=300000
```

## Deployment Process

### Option 1: Git Push (Recommended)
```bash
git add .
git commit -m "Deploy to Netlify"
git push origin main
```

Netlify will automatically:
1. Detect changes
2. Run build in `netlify-version` directory
3. Build the frontend (`npm run build:netlify`)
4. Build the serverless functions
5. Deploy everything

### Option 2: Netlify CLI
```bash
cd netlify-version
npm run build
netlify deploy --prod
```

## Troubleshooting 404 Errors

### Function Returns 404

**Check 1: Base Directory**
- Go to Netlify Dashboard → Site Settings → Build & Deploy → Build Settings
- Ensure **Base directory** is set to `netlify-version`
- If not set, add it and redeploy

**Check 2: Function Build Logs**
- Check deploy logs in Netlify
- Look for "Building functions" section
- Ensure no build errors

**Check 3: Function Files**
- In deploy log, verify:
  - `netlify/functions/api.ts` is detected
  - Function builds successfully
  - No import errors

**Check 4: Redirects**
- Verify `netlify.toml` has:
  ```toml
  [[redirects]]
    from = "/api/*"
    to = "/.netlify/functions/api/:splat"
    status = 200
  ```

**Check 5: Test Function Directly**
Try accessing the function directly:
```
https://your-site.netlify.app/.netlify/functions/api/health
```

If this works but `/api/health` doesn't, it's a redirect issue.
If both fail, it's a function build/runtime issue.

### Common Issues

**Issue: "import.meta" warnings**
- These are warnings, not errors
- Functions should still work despite warnings
- Related to ESM/CJS conversion during bundling

**Issue: Module resolution errors**
- Ensure all dependencies are in `package.json`
- Check that `serverless-http` is installed
- Verify `api/app.ts` imports work

**Issue: Environment variables not available**
- Verify all env vars are set in Netlify Dashboard
- Restart build after adding env vars
- Check deploy logs for env var injection

## Testing Production Deployment

After deployment, test these endpoints:

### 1. Health Check
```bash
curl https://your-site.netlify.app/api/health
```
Expected: `{"success":true,"message":"ok",...}`

### 2. Login (should fail with no credentials)
```bash
curl -X POST https://your-site.netlify.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}'
```
Expected: `{"error":"Invalid email or password"}`

### 3. Direct Function Access
```bash
curl https://your-site.netlify.app/.netlify/functions/api/health
```
Expected: Same as #1

## Architecture

### Production Request Flow
```
Browser Request: /api/auth/login
    ↓
Netlify Edge (reads netlify.toml)
    ↓
Redirect: /.netlify/functions/api/auth/login
    ↓
Serverless Function (api.ts)
    ↓
Express App (via serverless-http)
    ↓
Response
```

### Development Request Flow
```
Browser Request: http://localhost:8888/api/auth/login
    ↓
Netlify Dev (reads netlify.dev.toml)
    ↓
Proxy: http://localhost:3002/api/auth/login
    ↓
Express Server (direct)
    ↓
Response
```

## Monitoring

### Check Function Logs
1. Go to Netlify Dashboard
2. Navigate to Functions tab
3. Click on `api` function
4. View logs for errors

### Check Deploy Logs
1. Go to Deploys tab
2. Click on latest deploy
3. Review build log for errors

## Need Help?

If deployment still fails:
1. Share your Netlify deploy logs
2. Share the error from browser console
3. Try accessing `/.netlify/functions/api/health` directly
4. Check if base directory is set to `netlify-version`
