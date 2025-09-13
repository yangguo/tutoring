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
- **Express.js** with TypeScript
- **JWT** authentication
- **Supabase** (PostgreSQL) for database
- **OpenAI API** for AI features
- **Multer** for file uploads
- **Helmet** and **CORS** for security

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
Create a `.env` file in the root directory:
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
npm run client:dev  # Frontend only (port 5173)
npm run server:dev  # Backend only (port 3001)
```

## 📜 Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run client:dev` - Start frontend development server
- `npm run server:dev` - Start backend development server
- `npm run build` - Build the frontend for production
- `npm run preview` - Preview the production build
- `npm run lint` - Run ESLint
- `npm run check` - Run TypeScript type checking
- `npm run seed:demo` - Seed database with demo users

## 📁 Project Structure

```
tutoring/
├── api/                    # Backend Express.js application
│   ├── routes/            # API route handlers
│   ├── config/            # Configuration files
│   ├── utils/             # Utility functions
│   └── scripts/           # Database scripts
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
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Core Features
- `GET /api/books` - Get user's book library
- `POST /api/upload` - Upload new books
- `GET /api/dashboard` - Get dashboard data
- `POST /api/chat/lesson` - AI lesson interaction
- `GET /api/achievements` - Get user achievements

## 🚀 Deployment

The application is configured for deployment on Vercel:

1. Connect your repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

See `vercel.json` for deployment configuration.

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
