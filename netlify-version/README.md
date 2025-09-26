# Interactive English Tutor

An interactive web application designed to help children learn English through engaging picture book reading, vocabulary building, and speaking practice with AI-powered features.

## 🌟 Features

- **Interactive Reading Sessions**: Upload and read picture books with synchronized audio and text highlighting
- **AI-Powered Speaking Practice**: Pronunciation evaluation and conversation practice with OpenAI integration
- **Vocabulary Building**: Interactive word definitions and vocabulary exercises
- **Progress Tracking**: Comprehensive analytics for parents and teachers
- **Rewards System**: Achievement badges and motivation system
- **Multi-User Support**: Separate interfaces for children, parents, and teachers
- **File Upload**: Support for PDF, JPG, and PNG book uploads

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Zustand** for state management
- **Lucide React** for icons

### Backend
- **Express.js** with TypeScript (Vercel deployment)
- **Cloudflare Workers** with Hono + TypeScript (edge deployment)
- **JWT** authentication
- **Supabase** (PostgreSQL) for database
- **OpenAI API** (configurable base URL/model) for AI features
- **Multer** for file uploads (Express)
- **Helmet** and **CORS** for security (Express)

### External Services
- **Supabase** - Database and file storage
- **OpenAI GPT-4** - AI tutoring and conversation
- **Web Speech API** - Speech recognition

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account
- OpenAI API key

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone <repository-url>
cd tutoring
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory (used by the Express API and local frontend dev):
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
PORT=3002
NODE_ENV=development
```

For the Cloudflare Worker, create `api-cloudflare/.dev.vars` to supply Wrangler with local secrets:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo
JWT_SECRET=your_jwt_secret
```

### 4. Database Setup
Run the Supabase migrations:
```bash
# Apply database migrations
supabase db push

# Seed demo users (optional)
npm run seed:demo
```

### 5. Start Development Servers
```bash
# Start both frontend and backend concurrently
npm run dev

# Or start them separately:
npm run client:dev  # Frontend only (port 5173); ensure VITE_API_URL points to your API
npm run server:dev  # Express backend only (port 3002)

# Cloudflare Worker API (optional local dev)
cd api-cloudflare
npm install
npm run dev         # Miniflare dev server at http://127.0.0.1:8787
```

## 📜 Available Scripts

- `npm run dev` - Start frontend + Express backend in development mode
- `npm run client:dev` - Start frontend development server
- `npm run server:dev` - Start Express backend development server
- `npm run build` - Build the frontend for production
- `npm run preview` - Preview the production build
- `npm run lint` - Run ESLint
- `npm run check` - Run TypeScript type checking
- `npm run seed:demo` - Seed database with demo users
- `cd api-cloudflare && npm run dev` - Run the Cloudflare Worker locally (Wrangler)
- `cd api-cloudflare && npm run deploy` - Deploy the Worker to Cloudflare

## 📁 Project Structure

```
tutoring/
├── api/                    # Backend Express.js application (Vercel)
│   ├── routes/            # API route handlers
│   ├── config/            # Configuration files
│   ├── utils/             # Utility functions
│   └── scripts/           # Database scripts
├── api-cloudflare/        # Cloudflare Worker API (Hono)
│   ├── chat/              # AI speaking/lesson handlers for Workers
│   ├── config/            # Supabase bindings
│   ├── lib/               # Shared utilities (OpenAI client, etc.)
│   └── router.ts          # Worker router wiring
├── netlify/               # Netlify serverless functions
│   └── functions/         # Netlify function handlers
├── src/                   # Frontend React application
│   ├── components/        # Reusable React components
│   ├── pages/            # Page components
│   ├── stores/           # Zustand state stores
│   ├── hooks/            # Custom React hooks
│   └── lib/              # Utility libraries
├── supabase/             # Database migrations and schemas
│   └── migrations/       # SQL migration files
├── public/               # Static assets
└── .trae/               # Project documentation
```

## 🔐 Authentication

The application uses JWT-based authentication with the following user roles:
- **Child User**: Access to reading and practice features
- **Parent**: Monitor child progress and manage settings
- **Teacher**: Manage multiple students and create lesson plans
- **Admin**: Platform administration

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration (creates Supabase auth + profile)
- `POST /api/auth/login` - User login (returns profile + JWT)
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Fetch the authenticated user's profile

### Core Features
- `GET /api/books` - Get user's book library (filters, pagination, access control)
- `GET /api/books/:id` - Book detail with pages (respects public/assigned access)
- `POST /api/upload/book` - Upload new books (PDF/images)
- `POST /api/upload/book/:id/pages` - Upload generated pages for a book
- `GET /api/dashboard/*` - Dashboard data (students, lessons, progress, analytics)
- `POST /api/dashboard/lessons` (`PUT`/`DELETE`) - Manage lesson plans
- `POST /api/chat/lesson` - AI lesson interaction with lesson/book context
- `POST /api/chat/speaking-practice` - AI speaking practice for current page
- `GET /api/achievements` - Get user achievements & stats

## 🚀 Deployment

### Vercel (Frontend + Express API)

1. Connect the repository to Vercel
2. Configure environment variables for the frontend (`VITE_*`) and Express API (e.g., `SUPABASE_*`, `OPENAI_*`, `JWT_SECRET`) in the Vercel dashboard
3. Deploy automatically on push to the configured branch (see `vercel.json`)

### Netlify (Frontend + Express API via Serverless Functions)

1. See `README-NETLIFY.md` for detailed Netlify deployment instructions
2. Configure environment variables in Netlify dashboard under Site Settings > Environment Variables
3. Uses `netlify.toml` for build configuration and serverless functions in `netlify/functions/`
4. Deploy with `npm run deploy:netlify` or connect repository to Netlify for automatic deployments

### Cloudflare Workers (Hono API)

1. Configure secrets via `.dev.vars` (local) and Wrangler/Cloudflare dashboard (production)
   - `SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `JWT_SECRET`
2. From `api-cloudflare/`, run `npm run deploy` (or integrate Wrangler into Cloudflare Pages build command)
3. Point `VITE_API_URL` in the frontend to the deployed Worker URL (workers.dev or custom domain)

## 🧪 Development Guidelines

### Code Style
- Use TypeScript for type safety
- Follow ESLint configuration
- Use Tailwind CSS for styling
- Implement proper error handling

### Security
- Environment variables for sensitive data
- JWT token validation
- Input validation with Joi
- Rate limiting on API endpoints
- CORS and Helmet security headers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

This project is private and proprietary.

## 🆘 Support

For support and questions, please contact the development team.
