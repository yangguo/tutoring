# Interactive English Tutor - Netlify Version

This is the Netlify deployment version of the Interactive English Tutor web application. It has been adapted from the original Vercel deployment to work with Netlify's serverless functions and build system.

## 🚀 Netlify Deployment Setup

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Netlify account
- Supabase account
- OpenAI API key

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   Fill in your environment variables:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `JWT_SECRET` - A secure random string for JWT signing

3. **Development with Netlify Dev**
   ```bash
   npm run dev:netlify
   ```
   This starts the Netlify development server which includes:
   - Frontend on `http://localhost:8888`
   - Serverless functions on `http://localhost:8888/.netlify/functions/api`

4. **Alternative: Standard Development**
   ```bash
   npm run dev
   ```
   This runs the original Express server setup for comparison.

### Build and Deploy

1. **Build for production**
   ```bash
   npm run build:netlify
   ```

2. **Test locally**
   ```bash
   netlify dev
   ```

3. **Deploy to Netlify**
   ```bash
   npm run deploy:netlify
   ```

### Netlify Configuration

The project includes:
- `netlify.toml` - Netlify build and deployment configuration
- `netlify/functions/api.ts` - Main serverless function handling all API routes
- Updated `package.json` with Netlify-specific scripts and dependencies

## 📊 Key Differences from Vercel Version

### Serverless Functions
- **Vercel**: Uses `api/index.ts` as a single serverless function entry point
- **Netlify**: Uses `netlify/functions/api.ts` with similar approach but adapted for Netlify's runtime

### Build Process
- **Netlify**: Requires explicit function building step (`build:functions`)
- **Configuration**: Uses `netlify.toml` instead of `vercel.json`

### Development
- **Netlify Dev**: Provides local serverless function testing environment
- **Proxy Setup**: Vite config updated to work with Netlify dev server

### Environment Variables
- Set in Netlify dashboard under Site Settings > Environment Variables
- Same variables as the original version

## 🔧 Scripts

- `npm run dev:netlify` - Start Netlify development environment
- `npm run build:netlify` - Build for Netlify deployment
- `npm run deploy:netlify` - Deploy to Netlify
- `npm run dev` - Standard development (Express server)
- `npm run build` - Standard build (for comparison)

## 📁 Project Structure

The Netlify version maintains the same project structure as the original with additions:

```
netlify-version/
├── netlify/
│   └── functions/
│       ├── api.ts              # Main serverless function
│       └── tsconfig.json       # TypeScript config for functions
├── netlify.toml                # Netlify configuration
├── api/                        # Backend code (same as original)
├── src/                        # Frontend code (same as original)
├── supabase/                   # Database migrations (same as original)
└── README-NETLIFY.md          # This file
```

## 🚨 Important Notes

1. **Cold Starts**: Netlify functions may have cold start delays (5-10 seconds for first request)
2. **Timeout**: Functions have a 30-second timeout limit (configured in netlify.toml)
3. **Bundle Size**: The serverless function includes the entire Express app, which may impact cold start times
4. **Environment**: Uses same environment variables as the original version

## 🛠️ Troubleshooting

### Common Issues

1. **Function Build Errors**
   - Check `netlify/functions/tsconfig.json` configuration
   - Ensure all dependencies are properly installed
   - Run `npm run build:functions` to test function compilation

2. **API Routes Not Working**
   - Verify `netlify.toml` redirects are correct
   - Check function logs in Netlify dashboard
   - Test with `netlify dev` locally

3. **Environment Variables**
   - Set in Netlify dashboard, not in `.env` for production
   - Use same variable names as original version

4. **Build Failures**
   - Check Node.js version (should be 18+)
   - Verify all dependencies are compatible with Netlify runtime

## 📚 Documentation

For more information about the application features and API, refer to the main README.md file in the project root.

## 🤝 Support

This Netlify version maintains full compatibility with the original application features. If you encounter deployment-specific issues, check the Netlify documentation or contact the development team.