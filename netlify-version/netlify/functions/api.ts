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

const getHeaderValue = (headers: Record<string, string | string[]> | undefined, key: string): string | undefined => {
  if (!headers) return undefined;
  const value = headers[key] ?? headers[key.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const logIncomingEvent = (event: HandlerEvent): void => {
  try {
    const requestId = getHeaderValue(event.headers, 'x-nf-request-id') ?? getHeaderValue(event.headers, 'x-request-id');
    const url = event.rawUrl ?? event.path ?? 'unknown';
    console.info('[netlify][api] incoming request', {
      method: event.httpMethod,
      url,
      requestId,
      hasBody: typeof event.body === 'string' && event.body.length > 0,
    });
  } catch (loggingError) {
    console.warn('[netlify][api] failed to log request', loggingError);
  }
};

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
  logIncomingEvent(event);

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
