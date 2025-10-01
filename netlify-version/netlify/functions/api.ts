// @ts-ignore -- types are provided once dependencies are installed
import serverlessHttp from 'serverless-http';
import app from '../../api/app';

type HandlerEvent = {
  httpMethod: string;
  path?: string;
  rawUrl?: string;
  headers?: Record<string, string | string[]>;
  body?: string | null;
  [key: string]: unknown;
};

interface HandlerResponse {
  statusCode: number;
  headers?: Record<string, string | string[]>;
  body: string;
  isBase64Encoded?: boolean;
}

type HandlerContext = Record<string, unknown>;

type NetlifyHandler = (
  event: HandlerEvent,
  context: HandlerContext,
) => Promise<HandlerResponse>;

const expressHandler = serverlessHttp(app) as unknown as NetlifyHandler;

const withCors = (response: HandlerResponse): HandlerResponse => {
  const headers: Record<string, string> = {};

  if (response.headers) {
    for (const [key, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      } else if (value != null) {
        headers[key] = String(value);
      }
    }
  }

  headers['Access-Control-Allow-Origin'] = headers['Access-Control-Allow-Origin'] ?? '*';
  headers['Access-Control-Allow-Methods'] = headers['Access-Control-Allow-Methods'] ?? 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
  headers['Access-Control-Allow-Headers'] = headers['Access-Control-Allow-Headers'] ?? 'Content-Type, Authorization';

  return {
    ...response,
    headers,
  };
};

export const handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return withCors({
      statusCode: 200,
      body: '',
      headers: {},
    });
  }

  try {
    const response = await expressHandler(event, context);
    return withCors(response);
  } catch (error) {
    console.error('Netlify function error', error);

    return withCors({
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }),
    });
  }
};
