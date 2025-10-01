# AGENTS.md

This file provides guidance to neovate when working with code in this repository.

## Development Commands

### Build & Compilation
- `npm run build` - Type-check and build React frontend for production
- `cd api-cloudflare && npm run build` - Build Cloudflare Worker for deployment

### Development Servers
- `npm run dev` - Run both React frontend (port 5173) and Express API (port 3002) concurrently
- `npm run client:dev` - Run React frontend only at http://localhost:5173
- `npm run server:dev` - Run Express API only at http://localhost:3002
- `cd api-cloudflare && npm run dev` - Run Cloudflare Worker locally at http://127.0.0.1:8787

### Code Quality
- `npm run lint` - Run ESLint checks
- `npm run check` - Run TypeScript type checking
- `npm run preview` - Preview production build locally

### Database & Seeding
- `npm run seed:demo` - Seed Supabase with demo users
- `npm run ensure:admin` - Ensure admin user exists

### Deployment
- `cd api-cloudflare && npm run deploy` - Deploy Cloudflare Worker to production

### Package Management
- `npm install` - Install dependencies for main project
- `cd api-cloudflare && npm install` - Install Worker dependencies

## Code Architecture & Patterns

### Project Structure Philosophy
**Multi-repository architecture** with three main components:
- **Frontend**: React SPA in `src/` with Vite build system
- **Backend API**: Dual API strategy - Express.js for Vercel deployment, Cloudflare Workers for edge deployment
- **Database**: Supabase PostgreSQL with migrations in `supabase/`

### Key Architectural Patterns

**Dual API Pattern**:
- `api/` - Express.js API for Vercel deployment (traditional serverless)
- `api-cloudflare/` - Hono-based Cloudflare Worker for edge deployment
- Both APIs mirror the same endpoints and response shapes for frontend compatibility
- Worker routes should maintain Express behavior unless intentionally diverging

**Frontend Architecture**:
- React 18 with functional components and hooks
- Zustand for state management (stores in `src/stores/`)
- React Router for navigation
- API client abstraction in `src/lib/api.ts`
- Component-based UI with Tailwind CSS styling

**Data Flow Patterns**:
- **Authentication**: JWT-based with Zustand store (`authStore.ts`) managing user state
- **API Communication**: Centralized ApiClient class handling authentication, requests, and error handling
- **State Management**: Zustand stores for global state, local component state for UI
- **File Upload**: Multer for Express, native FormData handling for Worker

### Configuration Management

**Environment Variables**:
- **Root `.env`**: `SUPABASE_*`, `OPENAI_API_KEY`, `JWT_SECRET`, `PORT` (Express API)
- **Worker `.dev.vars`**: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `JWT_SECRET`
- **Frontend**: `VITE_API_URL` pointing to desired API origin

**Build Configuration**:
- **Vite**: Configured with React plugin, path aliases (`@/*`), proxy to Express API in dev
- **TypeScript**: Strict mode enabled, path mapping for `@/*` imports
- **ESLint**: React-specific rules, TypeScript integration
- **Rollup**: Manual chunks for React, Supabase, and vendor code

### Key Abstractions & Interfaces

**Core Types** (in `src/lib/api.ts`):
- `User` - User profile with role-based access (child, parent, admin)
- `Book` & `BookPage` - Book structure with pages and metadata
- `ReadingSession` - Progress tracking for reading sessions
- `VocabularyWord` & `PageGlossaryEntry` - Vocabulary learning system
- `Achievement` - Gamification and progress tracking

**API Client**:
- Centralized `ApiClient` class handling all HTTP requests
- Automatic JWT token management
- Request timeout handling (10s default, 60s for AI operations)
- Comprehensive error handling with user-friendly messages

**Authentication Store**:
- Zustand store managing user authentication state
- Automatic token persistence in localStorage
- Safety timeout for auth checks (10 seconds)

### Build/Bundling Strategy

**Frontend Build**:
- Vite with React plugin and TypeScript
- Manual chunk splitting for optimal loading:
  - `react` chunk: React and React DOM
  - `supabase` chunk: Supabase client
  - `vendor` chunk: React Router and Zustand
- Production optimizations enabled
- Custom plugin for development badge

**Worker Build**:
- Wrangler CLI for Cloudflare Workers deployment
- Hono framework for edge-optimized API
- TypeScript compilation with Worker types

## Technology Stack & Dependencies

### Core Frameworks & Libraries

**Frontend**:
- **React 18** - UI framework with functional components and hooks
- **Vite** - Build tool and development server
- **React Router** - Client-side routing
- **Zustand** - Lightweight state management
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library

**Backend APIs**:
- **Express.js** - Traditional Node.js web framework (Vercel deployment)
- **Hono** - Edge-optimized web framework (Cloudflare Workers)
- **Supabase** - Database and authentication (PostgreSQL)
- **OpenAI** - AI-powered features (vocabulary extraction, image analysis)

### Development Dependencies

**TypeScript**: Full-stack TypeScript with strict mode
**ESLint**: Code linting with React and TypeScript rules
**Concurrently**: Run multiple development servers simultaneously
**Nodemon**: Auto-restart Express API during development
**Wrangler**: Cloudflare Workers development and deployment

### Special Tooling & Processes

**AI Integration**:
- OpenAI API for vocabulary extraction and image analysis
- Custom text cleaning utilities for better speech synthesis
- JSON repair utilities for AI-generated content
- Timeout handling for long-running AI operations (up to 240s)

**File Processing**:
- PDF.js for PDF document processing
- Multer for file uploads (Express API)
- FormData handling for Worker uploads
- Image analysis with AI-powered description generation

**Database**:
- Supabase PostgreSQL with row-level security
- SQL migrations in `supabase/migrations/`
- Seeding scripts for demo data
- Health checks for database connectivity

**Development Experience**:
- Path aliases (`@/*`) for clean imports
- Hot reload for both frontend and backend
- Proxy configuration for API calls in development
- Comprehensive error handling and user feedback
