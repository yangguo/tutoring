# Interactive English Tutor - Copilot Instructions

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap, Build, and Test the Repository

- **Prerequisites**: Node.js v18+ (tested with v20.19.5) and npm
- **Install dependencies**: `npm install` -- takes 25 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
- **Type checking**: `npm run check` -- takes 6 seconds. NEVER CANCEL. Set timeout to 30+ seconds.
- **Build production**: `npm run build` -- takes 15 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
- **Linting**: `npm run lint` -- takes 3 seconds. Note: Repository currently has 146 existing lint issues (not your responsibility to fix unless related to your changes).

### Development Servers

- **Full development environment**: `npm run dev` -- starts both client and server concurrently. NEVER CANCEL. Set timeout to 60+ seconds.
  - Client runs on `http://localhost:5173` (Vite dev server)
  - Server runs on `http://localhost:3002` (Express with nodemon)
  - Server will show Supabase connection warnings with default .env values (expected behavior)
  - Both servers start within 3 seconds, ready for development
- **Client only**: `npm run client:dev` -- Vite dev server on port 5173 (~500ms startup)
- **Server only**: `npm run server:dev` -- Express server on port 3002 (~2s startup)
- **Production preview**: `npm run preview` -- serves built files on `http://localhost:4173`

### Dual Backend Architecture

This project supports **two backend implementations**:

1. **Express API (`api/`)** - Default for local development
   - Entry: `api/server.ts` (local), `api/index.ts` (Vercel deployment)  
   - Consolidated routes in `api/router.ts` (2800+ lines, all endpoints)
   - Uses Express middleware, JWT auth via `api/utils/jwt.ts`

2. **Cloudflare Workers API (`api-cloudflare/`)** - Alternative serverless deployment
   - Built with Hono framework, modular route files
   - Entry: `api-cloudflare/index.ts`, routes in `api-cloudflare/router.ts`
   - Independent `package.json`, deploy with `wrangler deploy`
   - Uses Cloudflare Workers bindings for environment variables

**Important**: When adding features, implement in **both** backends to maintain compatibility.

### Environment Setup

ALWAYS create a `.env` file before running development servers:
```bash
cp .env.example .env
```

The application requires Supabase and OpenAI credentials for full functionality, but will start with example values (showing connection warnings).

### Database Operations

- **Seed demo users**: `npm run seed:demo` -- creates demo accounts (requires valid Supabase credentials)
- **Ensure admin**: `npm run ensure:admin` -- creates admin user (requires valid Supabase credentials)

## Validation

### Manual Testing Requirements

ALWAYS perform these validation steps after making changes:

1. **Build verification**: Run `npm run build` and ensure it completes successfully
2. **Development servers**: Start `npm run dev` and verify both servers start without fatal errors
   - Client should be available at `http://localhost:5173`
   - Server should show "Server ready on port 3002" (Supabase warnings expected with default .env)
3. **API health check**: Test `curl http://localhost:3002/api/health` returns valid JSON response
4. **Production preview**: Run `npm run preview` to test built application on `http://localhost:4173`
5. **Type checking**: Run `npm run check` to ensure no TypeScript errors
6. **Basic user interface**: Verify homepage loads with proper styling and navigation
7. **Authentication pages**: Test `/login` and `/register` routes render correctly with forms

### End-to-End Scenarios

When modifying user-facing features, ALWAYS test these complete workflows:

1. **Homepage Experience**: 
   - Navigate to `http://localhost:5173` and verify gradient background, hero section, and feature cards display
   - Test navigation buttons ("Start Learning", "Explore Books") redirect appropriately
   - Verify testimonials and call-to-action sections render correctly

2. **Authentication Flow**: 
   - Access `/login` and verify form fields (email, password) and demo account information display
   - Access `/register` and verify role selection (Student/Parent/Admin), age/grade fields work
   - Confirm authentication protection works (accessing `/library` without login redirects to `/login`)

3. **Route Protection**: 
   - Verify protected routes redirect to login when accessed directly
   - Test navigation between public pages (home, login, register) works seamlessly

4. **UI Responsiveness**: 
   - Verify application layout adapts to different screen sizes
   - Check that Tailwind CSS styles render correctly across components

### Pre-commit Validation

ALWAYS run before committing changes:
```bash
npm run check && npm run build
```

The lint command shows 146 existing issues - only fix lint issues directly related to your changes.

## Project Architecture

### Frontend (src/)
- **React 18 + TypeScript** with Vite build system
- **Routing**: React Router v7 (`src/pages/` for route components)
- **State**: Zustand stores (`src/stores/` with `xStore.ts` naming)
- **Components**: Reusable components in `src/components/` (PascalCase)
- **Styling**: Tailwind CSS with utilities in `src/index.css`
- **Hooks**: Custom hooks in `src/hooks/` with `useX.ts` naming

### Backend - Dual Architecture

**Express API (`api/`)** - Primary implementation:
- **Express.js + TypeScript** server with comprehensive route consolidation
- **Critical**: All 20+ API endpoints consolidated into single `api/router.ts` (2800+ lines)
- **Entry points**: `api/server.ts` (local), `api/index.ts` (Vercel deployment)
- **Database**: Supabase integration via `api/config/supabase.ts` with full TypeScript interfaces
- **AI Features**: OpenAI integration in `api/chat/` directory (lesson.ts, speaking-practice.ts)
- **Authentication**: JWT tokens via `api/utils/jwt.ts` with role-based access control

**Cloudflare Workers API (`api-cloudflare/`)** - Alternative serverless:
- **Hono framework** with modular route organization (separate files per domain)
- **Entry**: `api-cloudflare/index.ts`, routes in `api-cloudflare/router.ts`
- **Environment**: Uses Cloudflare Workers bindings instead of process.env
- **Development**: `cd api-cloudflare && npm run dev` (separate package.json)
- **Deployment**: `wrangler deploy` after `wrangler login`

### Database (supabase/)
- **PostgreSQL** via Supabase
- **Migrations**: SQL files in `supabase/migrations/`
- **Key tables**: users, books, reading_sessions, achievements, vocabulary_words

## Common Development Tasks

### Adding New API Features
1. **Express implementation**: Add routes to `api/router.ts` following existing patterns
2. **Cloudflare implementation**: Create new route file in `api-cloudflare/` and register in `router.ts`
3. Use TypeScript interfaces from respective `config/supabase.ts` files
4. Test both implementations: `npm run dev` (Express) and `cd api-cloudflare && npm run dev`
5. Validate with `npm run check` for TypeScript compilation

### Backend Architecture Patterns
- **Express**: Single consolidated router with middleware chains (`authenticateToken`, `requireRole`)
- **Cloudflare**: Modular Hono routes with `jwtMiddleware` applied per route group
- **Database types**: Both backends share Supabase schema but may have separate interface files
- **Environment variables**: Express uses `.env`, Cloudflare uses Workers bindings

### Fixing Bugs
1. Reproduce issue in development environment
2. Use browser dev tools for client issues
3. Check server logs for API issues (both Express and Cloudflare if applicable)
4. Test fix with manual validation scenarios

### Database Changes
1. Create new migration files in `supabase/migrations/`
2. Keep migrations atomic and reversible
3. Update TypeScript interfaces in both `api/config/supabase.ts` and `api-cloudflare/config/supabase.ts`

## File Organization Reference

```
tutoring/
├── src/                          # React frontend
│   ├── components/              # UI components (PascalCase.tsx)
│   ├── pages/                   # Route views (PascalCase.tsx)
│   ├── hooks/                   # Custom hooks (useThing.ts)
│   ├── stores/                  # Zustand stores (nameStore.ts)
│   ├── lib/                     # Utilities (api.ts, utils.ts)
│   └── assets/                  # Static assets
├── api/                         # Express backend
│   ├── routes/                  # API routes (DEPRECATED - use router.ts)
│   ├── router.ts               # Main API routes file
│   ├── config/                  # Configuration (supabase.ts)
│   ├── chat/                    # AI chat handlers
│   ├── utils/                   # Server utilities
│   ├── scripts/                 # Database seeding scripts
│   ├── server.ts               # Local development entry
│   └── index.ts                # Vercel deployment entry
├── api-cloudflare/              # Cloudflare Workers backend
│   ├── router.ts               # Hono route orchestration
│   ├── index.ts                # Workers entry point
│   ├── *.ts                    # Modular route files (auth.ts, books.ts, etc.)
│   ├── config/                  # Supabase configuration
│   ├── chat/                    # AI chat handlers (lesson.ts, speaking-practice.ts)
│   ├── utils/                   # Workers utilities (jwt.ts, error.ts)
│   ├── package.json            # Separate dependency management
│   └── wrangler.toml           # Cloudflare deployment config
├── supabase/migrations/         # Database migrations
├── public/                      # Static assets
├── package.json                 # Dependencies and scripts
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.js          # Tailwind CSS configuration
└── .env.example                # Environment template
```

## Important Implementation Notes

### Error Handling
- Server includes comprehensive error handling for file uploads, JWT validation, and database operations
- Client uses React error boundaries and toast notifications (Sonner)

### Security Features
- JWT authentication with configurable expiration
- Input validation using Joi schemas
- CORS and Helmet security headers
- Environment variables for sensitive data

### Performance Considerations
- Vite build outputs optimized chunks (React, Supabase, vendor)
- Manual chunks configured in `vite.config.ts`
- Large bundle size warnings expected due to PDF.js worker

### Known Issues
- PDF.js worker creates large bundle (1.3MB) - this is expected
- Supabase connection fails with example environment values
- Multiple lint issues exist in codebase - only fix issues related to your changes

## Timing Expectations

- **npm install**: ~25 seconds (first time)
- **npm run check**: ~6 seconds
- **npm run lint**: ~3 seconds (shows existing issues)
- **npm run build**: ~15 seconds
- **Server startup**: ~2-3 seconds
- **Client startup**: ~500ms

NEVER CANCEL build or development commands. Always wait for completion or explicit errors.