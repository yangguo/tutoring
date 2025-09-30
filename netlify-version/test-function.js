/**
 * Simple test function to verify exports work
 */

exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Test function works',
      event: event
    })
  };
};

exports.test = function() {
  return 'test function';
};