/**
 * Netlify Function handler for API routes
 * Fixed version with proper module handling and performance optimizations
 */

const serverlessHttp = require('serverless-http');

// Import the Express app synchronously to avoid dynamic import issues
let app;
try {
  // Try to import the built Express app
  app = require('../../api/app.js').default;
} catch (error) {
  console.error('Error importing Express app:', error);
  
  // Fallback: create a minimal Express app for basic functionality
  const express = require('express');
  app = express();
  
  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      message: 'Netlify function is running (fallback mode)',
      timestamp: new Date().toISOString()
    });
  });
  
  // Basic auth endpoints for testing
  app.post('/api/auth/login', (req, res) => {
    console.log('Login attempt received:', req.body);
    res.json({ 
      message: 'Login endpoint reached (fallback mode)',
      received: req.body,
      note: 'Full Express app import failed. Check function logs.'
    });
  });
  
  app.post('/api/auth/register', (req, res) => {
    console.log('Register attempt received:', req.body);
    res.json({ 
      message: 'Register endpoint reached (fallback mode)',
      received: req.body,
      note: 'Full Express app import failed. Check function logs.'
    });
  });
  
  console.log('Using fallback Express app due to import failure');
}

// Create the serverless handler once (not on every request)
const serverlessHandler = serverlessHttp(app, {
  basePath: '', // Remove basePath since netlify.toml handles redirects
});

// Export the handler
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
