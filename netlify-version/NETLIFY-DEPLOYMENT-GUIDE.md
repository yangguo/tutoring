# Netlify Deployment Guide

## Quick Start

1. **Fork/Clone this repository**
   ```bash
   git clone <your-repo-url>
   cd netlify-version
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Test locally with Netlify Dev**
   ```bash
   npm run dev:netlify
   ```
   Visit http://localhost:8888

## Production Deployment

### Option 1: Netlify Dashboard (Recommended)

1. **Connect Repository**
   - Go to https://app.netlify.com/
   - Click "New site from Git"
   - Connect your GitHub/GitLab repository
   - Select the `netlify-version` directory as the base directory (if not using the root)

2. **Build Settings**
   - Build command: `npm run build:netlify`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

3. **Environment Variables**
   Go to Site Settings > Environment Variables and add:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   OPENAI_API_KEY=your-openai-api-key
   JWT_SECRET=your-secure-jwt-secret
   OPENAI_BASE_URL=https://api.openai.com/v1
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_VISION_MODEL=gpt-4-turbo
   JWT_EXPIRES_IN=7d
   NODE_ENV=production
   ```

   **CRITICAL**: **DO NOT** set `VITE_API_URL` in Netlify!
   - When undefined, the app uses `window.location.origin`
   - This makes preview deployments work correctly
   - Setting it causes CORS errors in preview deployments

4. **Deploy**
   - Click "Deploy site"
   - Future pushes to your main branch will auto-deploy

### Option 2: Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize Site**
   ```bash
   netlify init
   ```
   Follow the prompts to create a new site or link to existing one.

4. **Deploy**
   ```bash
   npm run deploy:netlify
   ```

## Configuration Files

### netlify.toml
Contains build settings, redirects, and function configuration. Key settings:
- API routes redirect to `/.netlify/functions/api`
- SPA fallback for React Router
- Security headers
- Function timeout: 30 seconds

### netlify/functions/api.js
Main serverless function that wraps the Express.js application using `serverless-http`.

## Environment Variables Required

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `JWT_SECRET` | Secret for JWT signing | Random secure string |
| `OPENAI_BASE_URL` | OpenAI API base URL | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Default OpenAI model | `gpt-4o-mini` |
| `OPENAI_VISION_MODEL` | Vision model | `gpt-4-turbo` |
| `JWT_EXPIRES_IN` | JWT expiration | `7d` |
| `NODE_ENV` | Environment | `production` |

## Testing

### Local Testing
```bash
# Standard development (Express server)
npm run dev

# Netlify development environment
npm run dev:netlify

# Build and preview
npm run build:netlify
netlify dev
```

### API Testing
Once deployed, test the API endpoints:
```bash
# Health check
curl https://your-site.netlify.app/api/health

# Full health check
curl https://your-site.netlify.app/api/health/checks
```

## Troubleshooting

### Common Issues

1. **Function timeout errors**
   - Increase timeout in `netlify.toml` (max 30s on free tier)
   - Optimize database queries and API calls

2. **Cold start delays**
   - First request after inactivity may take 5-10 seconds
   - Consider using Netlify's background functions for critical paths

3. **Build failures**
   - Check build logs in Netlify dashboard
   - Ensure all dependencies are in `package.json`
   - Verify Node.js version compatibility

4. **Environment variable issues**
   - Verify all required env vars are set in Netlify dashboard
   - Check for typos in variable names
   - Ensure sensitive data is not in git

5. **CORS errors in preview deployments**
   - **Symptom**: Preview deployment cannot call its own API
   - **Error**: `Access to fetch at 'https://your-site.netlify.app/api/...' from origin 'https://deploy-preview-X--your-site.netlify.app' has been blocked by CORS policy`
   - **Cause**: `VITE_API_URL` is set in Netlify environment variables
   - **Fix**: Delete `VITE_API_URL` from Netlify environment variables (Site Settings > Environment Variables)
   - **Result**: Each deployment (production/preview) will use its own API endpoint via `window.location.origin`

### Performance Optimization

1. **Function optimization**
   - Keep dependencies minimal in serverless functions
   - Use connection pooling for database connections
   - Cache frequently accessed data

2. **Bundle optimization**
   - The current setup includes the entire Express app in the function
   - Consider splitting into multiple functions for better performance
   - Use tree shaking to reduce bundle size

### Monitoring

- Check function logs in Netlify dashboard
- Monitor function execution time and frequency
- Set up alerts for function failures

## Migration from Vercel

If migrating from the existing Vercel deployment:

1. **Environment Variables**: Export from Vercel and import to Netlify
2. **Domain**: Update DNS to point to Netlify
3. **Database**: No changes needed (same Supabase instance)
4. **CI/CD**: Update build hooks if using external CI/CD

## Support

For Netlify-specific issues:
- Check [Netlify Documentation](https://docs.netlify.com/)
- Visit [Netlify Community](https://community.netlify.com/)
- Contact Netlify support

For application issues, refer to the main project documentation.