import { handler } from '@/handlers/webhook';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock TelegramService
jest.mock('@/services/telegramService', () => ({
  TelegramService: jest.fn().mockImplementation(() => ({
    handleWebhook: jest.fn().mockResolvedValue({ ok: true }),
  })),
}));

// Mock config validation
jest.mock('@/config', () => ({
  validateConfig: jest.fn(),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Webhook Handler', () => {
  const mockContext = {} as Context;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process valid Telegram webhook', async () => {
    const mockEvent: APIGatewayProxyEvent = {
      body: JSON.stringify({
        update_id: 123,
        message: {
          message_id: 456,
          date: 1234567890,
          text: 'Hello',
          chat: { id: 789, type: 'private' },
          from: { id: 101112, is_bot: false, first_name: 'Test' },
        },
      }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/webhook',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'api-id',
        stage: 'dev',
        requestId: 'request-id',
        identity: {
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
        },
        httpMethod: 'POST',
        resourcePath: '/webhook',
      } as any,
      resource: '/webhook',
    };

    const result = await handler(mockEvent, mockContext);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
  });

  it('should return 400 for invalid JSON', async () => {
    const mockEvent: APIGatewayProxyEvent = {
      body: 'invalid json',
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/webhook',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '/webhook',
    };

    const result = await handler(mockEvent, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      ok: false,
      error: 'Invalid JSON in request body',
    });
  });

  it('should return 400 for invalid webhook payload', async () => {
    const mockEvent: APIGatewayProxyEvent = {
      body: JSON.stringify({ invalid: 'payload' }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/webhook',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '/webhook',
    };

    const result = await handler(mockEvent, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      ok: false,
      error: 'Invalid webhook payload',
    });
  });

  it('should handle processing errors gracefully', async () => {
    // Reset and reconfigure the mock to throw an error
    jest.resetModules();
    jest.doMock('@/services/telegramService', () => ({
      TelegramService: jest.fn().mockImplementation(() => ({
        handleWebhook: jest
          .fn()
          .mockRejectedValue(new Error('Processing failed')),
      })),
    }));

    // Re-import the handler after mocking
    const { handler: errorHandler } = require('@/handlers/webhook');

    const mockEvent: APIGatewayProxyEvent = {
      body: JSON.stringify({ update_id: 123 }),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      isBase64Encoded: false,
      path: '/webhook',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '/webhook',
    };

    const result = await errorHandler(mockEvent, mockContext);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      ok: false,
      error: 'Internal server error',
    });
  });
});
