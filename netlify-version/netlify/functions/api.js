/**
 * Netlify Function handler for API routes
 * CommonJS version for compatibility
 */

const serverlessHttp = require('serverless-http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Create Express app with basic configuration
const app = express();

// Security middleware  
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: true, // Allow same origin in production
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Netlify function is running (CommonJS version)',
    timestamp: new Date().toISOString(),
    environment: 'netlify'
  });
});

// Basic login endpoint for immediate functionality
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login attempt received:', req.body);
    
    // Load environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
      console.error('Missing environment variables');
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error - missing environment variables'
      });
    }
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required'
      });
    }
    
    // Basic validation for now - replace with actual auth logic
    console.log('Processing login for:', email);
    
    // For now, return a basic response to test connectivity
    res.json({ 
      success: true,
      message: 'Login endpoint is working',
      note: 'This is a test response - full auth logic will be loaded dynamically',
      received: { email: email, hasPassword: !!password },
      environment: {
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
        hasJwtSecret: !!jwtSecret
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Login failed',
      message: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: ['/api/health', '/api/auth/login']
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Function error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message || 'Unknown error occurred',
    timestamp: new Date().toISOString()
  });
});

// Create the serverless handler
const serverlessHandler = serverlessHttp(app);

// Export the handler using CommonJS syntax
exports.handler = async (event, context) => {
  // Add CORS headers for all responses
  const addCorsHeaders = (response) => {
    if (!response.headers) {
      response.headers = {};
    }
    response.headers['Access-Control-Allow-Origin'] = '*';
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    return response;
  };

  try {
    // Handle OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
      return addCorsHeaders({
        statusCode: 200,
        body: '',
      });
    }

    console.log(`${event.httpMethod} ${event.path}`);
    
    // Process the request
    const response = await serverlessHandler(event, context);
    
    // Add CORS headers to the response
    return addCorsHeaders(response);
    
  } catch (error) {
    console.error('Netlify function error:', error);
    
    // Return a proper error response with CORS headers
    return addCorsHeaders({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message || 'Unknown error occurred',
        timestamp: new Date().toISOString()
      }),
    });
  }
};