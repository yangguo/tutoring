/**
 * Netlify Function handler for API routes
 * This function handles all API routes using the existing Express app
 */
import serverlessHttp from 'serverless-http';

// Import the existing Express app using dynamic import to handle ES modules
const getApp = async () => {
  try {
    const { default: app } = await import('../../dist-api/app.js');
    return app;
  } catch (error) {
    console.error('Error importing app:', error);
    throw error;
  }
};

// Create the handler
export const handler = async (event, context) => {
  try {
    const app = await getApp();
    const serverlessHandler = serverlessHttp(app);
    
    return serverlessHandler(event, context);
  } catch (error) {
    console.error('Netlify function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }
};