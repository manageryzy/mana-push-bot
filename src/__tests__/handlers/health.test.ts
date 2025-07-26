import { handler } from '@/handlers/health';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
  },
}));

describe('Health Handler', () => {
  const mockContext = {} as Context;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return health status', async () => {
    const mockEvent: APIGatewayProxyEvent = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/health',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '/health',
    };

    const result = await handler(mockEvent, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('environment');
  });

  it('should include correct headers', async () => {
    const mockEvent: APIGatewayProxyEvent = {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/health',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '/health',
    };

    const result = await handler(mockEvent, mockContext);

    expect(result.headers).toEqual({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    });
  });
});
