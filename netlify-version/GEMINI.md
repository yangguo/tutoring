# GEMINI.md

## Project Overview

This is an interactive English tutoring web application designed to help children learn English. It features interactive picture book reading, AI-powered speaking practice, vocabulary building, and progress tracking.

**Frontend:**
*   React 18 with TypeScript
*   Vite for development and building
*   Tailwind CSS for styling
*   React Router for navigation
*   Zustand for state management

**Backend:**
The project has two backend implementations:

1.  **Primary Backend (Cloudflare Workers):**
    *   Located in the `api-cloudflare` directory.
    *   Built with [Hono](https://hono.dev/), a lightweight web framework for edge computing.
    *   Deployed on Cloudflare Workers for low-latency global access.
    *   Uses JWT for authentication.
    *   Connects to a Supabase (PostgreSQL) database.

2.  **Legacy Backend (Express.js):**
    *   Located in the `api` directory.
    *   Built with Express.js and TypeScript.
    *   This was the original backend and is preserved for reference.

## Building and Running

### Prerequisites

*   Node.js (v18 or higher)
*   npm or yarn
*   Supabase account
*   OpenAI API key
*   Cloudflare account (for deploying the backend)

### 1. Install Dependencies

Install dependencies for both the frontend/legacy backend and the new Cloudflare backend.

```bash
# Install root dependencies (frontend, shared libs)
npm install

# Install Cloudflare backend dependencies
cd api-cloudflare
npm install
cd ..
```

### 2. Environment Setup

The project uses a `.env` file in the root for frontend and legacy backend configuration, and a `.dev.vars` file for the Cloudflare backend.

**A. Root `.env` file:**

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Update the `.env` file with your credentials for Supabase, OpenAI, and a JWT secret.

**B. Cloudflare `.dev.vars` file:**

For local development with the Cloudflare backend, create a `.dev.vars` file inside the `api-cloudflare` directory. The `wrangler dev` command will automatically load it.

Copy the relevant variables from the root `.env` file into `api-cloudflare/.dev.vars`. It should look like this:

```env
# api-cloudflare/.dev.vars

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# JWT Configuration
JWT_SECRET=your_jwt_secret
```

### 3. Database Setup

Run the Supabase migrations. You need the [Supabase CLI](https://supabase.com/docs/guides/cli) installed.

```bash
# Apply database migrations
supabase db push

# Seed demo users (optional)
npm run seed:demo
```

### 4. Start Development Servers

You can run the frontend and either the Cloudflare backend or the legacy Express backend.

**Recommended: Frontend + Cloudflare Backend**

```bash
# Start the frontend (port 5173)
npm run client:dev

# In a separate terminal, start the Cloudflare backend
cd api-cloudflare
npm run dev # Usually runs on port 8787
```

**Legacy: Frontend + Express Backend**

```bash
# Start both frontend and Express backend concurrently
npm run dev

# Or start them separately:
npm run client:dev  # Frontend only (port 5173)
npm run server:dev  # Legacy Express backend only (port 3001)
```

### Available Scripts

**Root `package.json`:**
*   `npm run client:dev`: Start the frontend development server.
*   `npm run build`: Build the frontend for production.
*   `npm run preview`: Preview the production build.
*   `npm run lint`: Run ESLint.
*   `npm run check`: Run TypeScript type checking.
*   `npm run server:dev`: Start the legacy Express backend development server.
*   `npm run dev`: Start both frontend and legacy backend concurrently.
*   `npm run seed:demo`: Seed the database with demo users.

**`api-cloudflare/package.json`:**
*   `npm run dev`: Start the Cloudflare backend in local development mode.
*   `npm run deploy`: Deploy the backend to Cloudflare Workers.

## Development Conventions

*   **Code Style:** The project uses TypeScript for type safety and follows the configuration in `eslint.config.js`.
*   **Styling:** Tailwind CSS is used for styling.
*   **Error Handling:** The backend includes error handling for common issues like file size limits and JWT errors.
*   **Security:** The application uses environment variables for sensitive data, JWT token validation, input validation, and security headers via Helmet (in the legacy Express backend).