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
*   Express.js with TypeScript
*   JWT for authentication
*   Supabase (PostgreSQL) for the database
*   OpenAI API for AI features

## Building and Running

### Prerequisites

*   Node.js (v18 or higher)
*   npm or yarn
*   Supabase account
*   OpenAI API key

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory with the following content:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# JWT Configuration
JWT_SECRET=your_jwt_secret

# Server Configuration
PORT=3001
NODE_ENV=development
```

### 3. Database Setup

Run the Supabase migrations:

```bash
# Apply database migrations
supabase db push

# Seed demo users (optional)
npm run seed:demo
```

### 4. Start Development Servers

```bash
# Start both frontend and backend concurrently
npm run dev

# Or start them separately:
npm run client:dev  # Frontend only (port 5173)
npm run server:dev  # Backend only (port 3001)
```

### Available Scripts

*   `npm run dev`: Start both frontend and backend in development mode.
*   `npm run client:dev`: Start the frontend development server.
*   `npm run server:dev`: Start the backend development server.
*   `npm run build`: Build the frontend for production.
*   `npm run preview`: Preview the production build.
*   `npm run lint`: Run ESLint.
*   `npm run check`: Run TypeScript type checking.
*   `npm run seed:demo`: Seed the database with demo users.

## Development Conventions

*   **Code Style:** The project uses TypeScript for type safety and follows the configuration in `eslint.config.js`.
*   **Styling:** Tailwind CSS is used for styling.
*   **Error Handling:** The backend includes error handling for common issues like file size limits and JWT errors.
*   **Security:** The application uses environment variables for sensitive data, JWT token validation, input validation, and security headers via Helmet.
