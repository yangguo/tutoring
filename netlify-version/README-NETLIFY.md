# Interactive English Tutor - Netlify Version

This is the Netlify deployment version of the Interactive English Tutor web application. It has been adapted from the original Vercel deployment to work with Netlify's serverless functions and build system.

## 🚀 Quick Fix for Login Issues

**Problem**: After deployment to Netlify, login fails with "network error"  
**Solution**: The Netlify function has been fixed to handle authentication correctly.

### Fixed Components:
1. **Netlify Function** (`netlify/functions/api.js`) - Now properly handles CommonJS/ES module compatibility
2. **Environment Variables** - Template provided for required configuration
3. **CORS Headers** - Comprehensive CORS support added for cross-origin requests
4. **Demo Authentication** - Working demo login system for testing

## 🛠️ Deployment Instructions

### 1. Environment Variables Setup
Set these in your Netlify Dashboard (Site Settings > Environment Variables):

```bash
# Required for authentication
JWT_SECRET=your-secure-random-string-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Optional for AI features
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

**IMPORTANT**: **DO NOT** set `VITE_API_URL` in Netlify environment variables!

When `VITE_API_URL` is not set, the frontend automatically uses `window.location.origin`, which ensures:
- Production deployments call production API (`fluffy-sunburst-4208f5.netlify.app`)
- Preview deployments call preview API (`deploy-preview-X--fluffy-sunburst-4208f5.netlify.app`)
- No CORS errors between different deployment contexts

If you set `VITE_API_URL` to a specific URL, all deployments will try to use that URL, causing CORS errors in preview deployments.

### 2. Deploy to Netlify
1. Connect your GitHub repository to Netlify
2. Set build command: `npm run build:netlify`
3. Set publish directory: `dist`
4. Deploy

### 3. Test the Deployment
After deployment, you can test with these demo accounts:
- **Child**: child@demo.com / password123
- **Parent**: parent@demo.com / password123  
- **Admin**: admin@demo.com / password123

## 📊 Architecture Overview

### Request Flow
1. User visits `https://your-site.netlify.app/login`
2. Frontend loads from `dist/` directory
3. Login form submits to `/api/auth/login`
4. Netlify redirects to `/.netlify/functions/api/auth/login` (via netlify.toml)
5. Serverless function processes authentication
6. Returns JWT token and user data

### Key Files
- `netlify.toml` - Build configuration and API redirects
- `netlify/functions/api.js` - Main serverless function (CommonJS)
- `netlify/functions/package.json` - Forces CommonJS module type
- `.env` - Local development environment variables

## 🔧 Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start development server**
   ```bash
   npm run dev:netlify
   ```
   Access at `http://localhost:8888`

4. **Alternative: Standard development**
   ```bash
   npm run dev
   ```
   Frontend: `http://localhost:5173`, API: `http://localhost:3002`

## 🛠️ Function Details

The Netlify function (`netlify/functions/api.js`) provides:

### Implemented Endpoints
- `GET /api/health` - Health check
- `POST /api/auth/login` - Authentication with demo accounts
- `POST /api/auth/register` - Returns "not implemented" message

### Features
- **CommonJS Compatibility**: Works with `"type": "module"` in package.json
- **Comprehensive CORS**: Handles cross-origin requests properly
- **Demo Authentication**: JWT-based auth for testing
- **Detailed Logging**: Console logs for debugging
- **Error Handling**: Proper HTTP status codes and error messages

## 🚨 Known Issues & Solutions

### 1. Local Netlify Dev Issues
**Problem**: `netlify dev` may fail to start functions locally  
**Solution**: Functions work correctly when deployed to actual Netlify infrastructure

### 2. "Function not found" Errors
**Problem**: API calls return 404  
**Solutions**:
- Check that environment variables are set in Netlify Dashboard
- Verify netlify.toml redirects are correct
- Ensure function deploys without errors

### 3. CORS Errors in Preview Deployments
**Problem**: Preview deployment gets CORS error when calling production API  
**Error Example**: 
```
Access to fetch at 'https://fluffy-sunburst-4208f5.netlify.app/api/auth/login' 
from origin 'https://deploy-preview-9--fluffy-sunburst-4208f5.netlify.app' 
has been blocked by CORS policy
```
**Root Cause**: `VITE_API_URL` environment variable is set to production URL, forcing preview deployments to call production API instead of their own API  
**Solution**: 
1. Go to Netlify Dashboard → Site Settings → Environment Variables
2. **Delete** or **unset** the `VITE_API_URL` variable
3. Redeploy to apply changes
4. Preview deployments will now use their own API endpoints automatically

### 4. General CORS Errors
**Problem**: Cross-origin request blocked  
**Solution**: Function includes comprehensive CORS headers in responses

## 📁 Project Structure

```
netlify-version/
├── netlify/
│   └── functions/
│       ├── api.js              # Main serverless function (CommonJS)
│       └── package.json        # Forces CommonJS module type
├── netlify.toml                # Netlify configuration & redirects  
├── dist/                       # Built frontend files
├── api/                        # Original backend code
├── src/                        # Frontend React app
├── .env                        # Local environment variables
└── README-NETLIFY.md          # This file
```

## 🧪 Testing Deployment

### 1. Test Health Endpoint
```bash
curl https://your-site.netlify.app/api/health
```

### 2. Test Login
```bash
curl -X POST https://your-site.netlify.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"child@demo.com","password":"password123"}'
```

### 3. Test Frontend
Visit `https://your-site.netlify.app/login` and use demo credentials

## 🎯 Next Steps

1. **Replace Demo Auth**: Integrate with real Supabase authentication
2. **Add More Endpoints**: Implement remaining API routes from original app
3. **Environment Variables**: Set production values in Netlify Dashboard
4. **Monitor Logs**: Check function logs in Netlify Dashboard for issues

## 📚 Support

- **Netlify Docs**: https://docs.netlify.com/functions/
- **Application Issues**: Check main README.md for application-specific help
- **Deployment Issues**: Check Netlify function logs and build logs