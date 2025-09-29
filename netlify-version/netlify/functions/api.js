/**
 * Netlify Function handler for API routes
 * Simplified version focusing on login functionality
 */

const serverlessHttp = require('serverless-http');
const express = require('express');
const cors = require('cors');

// Create Express app with basic configuration
const app = express();

// CORS configuration - allow all origins for now
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Headers:`, JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ 
    status: 'ok', 
    message: 'Netlify function is running',
    timestamp: new Date().toISOString(),
    environment: 'netlify',
    function: 'api'
  });
});

// Login endpoint with detailed error handling
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('=== LOGIN REQUEST START ===');
    console.log('Request body:', req.body);
    
    const { email, password } = req.body;
    
    // Basic validation
    if (!email || !password) {
      console.log('Missing credentials');
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required'
      });
    }

    // Check environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const jwtSecret = process.env.JWT_SECRET;
    
    console.log('Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      hasJwtSecret: !!jwtSecret,
      supabaseUrlPreview: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'missing'
    });
    
    if (!supabaseUrl || !supabaseServiceKey || !jwtSecret) {
      console.log('Missing environment variables');
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error',
        details: 'Missing required environment variables for authentication',
        missing: {
          supabaseUrl: !supabaseUrl,
          supabaseServiceKey: !supabaseServiceKey,
          jwtSecret: !jwtSecret
        }
      });
    }

    // For demo/testing - simulate successful login for demo accounts
    const demoAccounts = {
      'child@demo.com': { id: 'demo-child', username: 'Demo Child', role: 'child', age: 8 },
      'parent@demo.com': { id: 'demo-parent', username: 'Demo Parent', role: 'parent' },
      'admin@demo.com': { id: 'demo-admin', username: 'Demo Admin', role: 'admin' }
    };
    
    if (demoAccounts[email] && password === 'password123') {
      console.log('Demo account login successful for:', email);
      
      // Generate a simple JWT token (for demo purposes)
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { 
          userId: demoAccounts[email].id,
          email: email,
          role: demoAccounts[email].role
        },
        jwtSecret,
        { expiresIn: '7d' }
      );
      
      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: demoAccounts[email].id,
          email: email,
          username: demoAccounts[email].username,
          role: demoAccounts[email].role,
          age: demoAccounts[email].age,
          created_at: new Date().toISOString()
        },
        token: token
      });
    }

    // If not a demo account, return unauthorized
    console.log('Login failed: Invalid credentials for', email);
    return res.status(401).json({ 
      success: false,
      error: 'Invalid email or password',
      note: 'This is a demo environment. Use one of the demo accounts shown on the login page.'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Login failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    console.log('=== LOGIN REQUEST END ===');
  }
});

// Register endpoint (basic implementation)
app.post('/api/auth/register', async (req, res) => {
  console.log('Register request:', req.body);
  res.status(501).json({
    success: false,
    error: 'Registration not implemented in demo',
    message: 'Please use one of the demo accounts to test the application'
  });
});

// Catch-all for other API routes
app.use('/api/*', (req, res) => {
  console.log(`Unhandled API route: ${req.method} ${req.path}`);
  res.status(501).json({
    success: false,
    error: 'API endpoint not implemented',
    message: `${req.method} ${req.path} is not implemented in this demo version`,
    availableEndpoints: ['/api/health', '/api/auth/login']
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Interactive English Tutor API',
    version: '1.0.0-netlify',
    endpoints: ['/api/health', '/api/auth/login', '/api/auth/register']
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.path}`,
    suggestion: 'Try /api/health or /api/auth/login'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message || 'Unknown error occurred',
    timestamp: new Date().toISOString()
  });
});

// Create the serverless handler
const serverlessHandler = serverlessHttp(app);

// Export the handler
exports.handler = async (event, context) => {
  // Add comprehensive CORS headers
  const addCorsHeaders = (response) => {
    if (!response.headers) {
      response.headers = {};
    }
    
    // Set CORS headers
    response.headers['Access-Control-Allow-Origin'] = '*';
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, HEAD';
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-requested-with, Accept, Origin, Referer';
    response.headers['Access-Control-Allow-Credentials'] = 'true';
    response.headers['Access-Control-Max-Age'] = '86400';
    
    // Additional headers for better compatibility
    response.headers['Content-Type'] = response.headers['Content-Type'] || 'application/json';
    
    return response;
  };

  try {
    console.log(`=== NETLIFY FUNCTION CALL: ${event.httpMethod} ${event.path} ===`);
    console.log('Event:', JSON.stringify({
      httpMethod: event.httpMethod,
      path: event.path,
      headers: event.headers,
      queryStringParameters: event.queryStringParameters
    }, null, 2));

    // Handle preflight OPTIONS requests
    if (event.httpMethod === 'OPTIONS') {
      console.log('Handling CORS preflight request');
      return addCorsHeaders({
        statusCode: 204,
        body: '',
      });
    }

    // Process the request through Express
    console.log('Processing request through Express...');
    const response = await serverlessHandler(event, context);
    
    console.log('Express response:', {
      statusCode: response.statusCode,
      headers: Object.keys(response.headers || {}),
      bodyLength: response.body ? response.body.length : 0
    });
    
    // Add CORS headers to the response
    return addCorsHeaders(response);
    
  } catch (error) {
    console.error('=== NETLIFY FUNCTION ERROR ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    
    // Return a proper error response with CORS headers
    return addCorsHeaders({
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message || 'Unknown error occurred',
        timestamp: new Date().toISOString(),
        function: 'netlify-api'
      }),
    });
  }
};