export const handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Test function works', timestamp: new Date().toISOString() }),
    headers: {
      'Content-Type': 'application/json',
    },
  };
};