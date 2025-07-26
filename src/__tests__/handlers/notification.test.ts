import { Context, SQSEvent, APIGatewayProxyEvent } from 'aws-lambda';
import { handler, httpHandler, resetServices } from '@/handlers/notification';
import { NotificationService } from '@/services/notificationService';
import { logger } from '@/utils/logger';

// Mock dependencies
jest.mock('@/services/telegramService');
jest.mock('@/services/notificationService');
jest.mock('@/utils/logger');
jest.mock('@/config', () => ({
  config: {
    app: {
      logLevel: 'info',
      stage: 'test',
      port: 3000,
      baseUrl: 'http://localhost:3000',
    },
    telegram: {
      botToken: 'test-token',
      webhookUrl: 'test-webhook',
    },
    aws: {
      region: 'us-east-1',
      notificationQueueUrl: 'test-queue',
    },
    developer: {
      adminUserIds: [123456789],
      devChatId: 123456789,
    },
    auth: {
      jwtSecret: 'test-secret',
    },
  },
  validateConfig: jest.fn(),
}));

describe('Notification Handler', () => {
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset handler service instances
    resetServices();

    // Create mock context with real-world AWS Lambda properties
    mockContext = {
      awsRequestId: 'test-request-id-123',
      callbackWaitsForEmptyEventLoop: true,
      functionName: 'mana-push-bot-prod-notification',
      functionVersion: '$LATEST',
      invokedFunctionArn:
        'arn:aws:lambda:us-east-1:123456789012:function:mana-push-bot-prod-notification',
      memoryLimitInMB: '128',
      logGroupName: '/aws/lambda/mana-push-bot-prod-notification',
      logStreamName: '2025/01/19/[$LATEST]abcdef123456',
      getRemainingTimeInMillis: jest.fn().mockReturnValue(30000),
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };

    mockNotificationService = {
      processNotification: jest.fn().mockResolvedValue(true),
      queueNotification: jest.fn().mockResolvedValue(true),
    } as any;

    // Mock NotificationService constructor
    (NotificationService as jest.Mock).mockImplementation(
      () => mockNotificationService
    );
  });

  describe('SQS Handler', () => {
    it('should process valid SQS notification event successfully', async () => {
      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'msg-123',
            receiptHandle: 'receipt-handle-123',
            body: JSON.stringify({
              id: 'notif-001',
              type: 'message',
              target: { chatId: 123456789 },
              content: { text: 'Test message' },
              created_at: '2025-01-19T10:00:00.000Z',
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1737280800000',
              SenderId: 'AROATEST123456',
              ApproximateFirstReceiveTimestamp: '1737280801000',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await expect(handler(sqsEvent, mockContext)).resolves.not.toThrow();

      expect(mockNotificationService.processNotification).toHaveBeenCalledWith({
        id: 'notif-001',
        type: 'message',
        target: { chatId: 123456789 },
        content: { text: 'Test message' },
        created_at: '2025-01-19T10:00:00.000Z',
      });
      expect(logger.info).toHaveBeenCalledWith('Processing SQS batch', {
        recordCount: 1,
        requestId: 'test-request-id-123',
      });
    });

    it('should handle multiple SQS records in batch', async () => {
      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'msg-1',
            receiptHandle: 'receipt-1',
            body: JSON.stringify({
              id: 'notif-1',
              type: 'message',
              target: { chatId: 111111111 },
              content: { text: 'Message 1' },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1737280800000',
              SenderId: 'AROATEST123456',
              ApproximateFirstReceiveTimestamp: '1737280801000',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5-1',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
          {
            messageId: 'msg-2',
            receiptHandle: 'receipt-2',
            body: JSON.stringify({
              id: 'notif-2',
              type: 'alert',
              target: { chatId: 222222222 },
              content: { text: 'Alert message' },
              metadata: { priority: 'high' },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1737280800000',
              SenderId: 'AROATEST123456',
              ApproximateFirstReceiveTimestamp: '1737280801000',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5-2',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(mockNotificationService.processNotification).toHaveBeenCalledTimes(
        2
      );
      expect(logger.info).toHaveBeenCalledWith('Notification batch processed', {
        total: 2,
        successful: 2,
        failed: 0,
        requestId: 'test-request-id-123',
      });
    });

    it('should handle invalid JSON in SQS message', async () => {
      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'msg-invalid',
            receiptHandle: 'receipt-invalid',
            body: '{invalid json',
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1737280800000',
              SenderId: 'AROATEST123456',
              ApproximateFirstReceiveTimestamp: '1737280801000',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(logger.error).toHaveBeenCalledWith('Invalid JSON in SQS message', {
        messageId: 'msg-invalid',
        body: '{invalid json',
      });
      expect(logger.info).toHaveBeenCalledWith('Notification batch processed', {
        total: 1,
        successful: 0,
        failed: 1,
        requestId: 'test-request-id-123',
      });
    });

    it('should handle missing required fields in notification payload', async () => {
      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'msg-incomplete',
            receiptHandle: 'receipt-incomplete',
            body: JSON.stringify({
              id: 'notif-incomplete',
              type: 'message',
              // missing target and content
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: '1737280800000',
              SenderId: 'AROATEST123456',
              ApproximateFirstReceiveTimestamp: '1737280801000',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        'Invalid notification payload structure',
        {
          messageId: 'msg-incomplete',
          payload: {
            id: 'notif-incomplete',
            type: 'message',
          },
        }
      );
    });

    it('should handle notification processing failure', async () => {
      mockNotificationService.processNotification.mockResolvedValueOnce(false);

      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'msg-fail',
            receiptHandle: 'receipt-fail',
            body: JSON.stringify({
              id: 'notif-fail',
              type: 'message',
              target: { chatId: 123456789 },
              content: { text: 'Failing message' },
            }),
            attributes: {
              ApproximateReceiveCount: '2',
              SentTimestamp: '1737280800000',
              SenderId: 'AROATEST123456',
              ApproximateFirstReceiveTimestamp: '1737280801000',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing notification record',
        {
          messageId: 'msg-fail',
          error: 'Notification processing failed',
        }
      );
    });
  });

  describe('HTTP Handler', () => {
    it('should process valid API Gateway notification request', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'http-notif-001',
          type: 'message',
          target: { chatId: 123456789 },
          content: { text: 'HTTP notification' },
          created_at: '2025-01-19T10:00:00.000Z',
        }),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TestClient/1.0',
        },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'api-id-123',
          authorizer: null,
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/prod/notification',
          stage: 'prod',
          requestId: 'api-request-id-123',
          requestTime: '19/Jan/2025:10:00:00 +0000',
          requestTimeEpoch: 1737280800000,
          resourceId: 'resource-id',
          resourcePath: '/notification',
          identity: {
            cognitoIdentityPoolId: null,
            accountId: null,
            cognitoIdentityId: null,
            caller: null,
            sourceIp: '192.0.2.1',
            principalOrgId: null,
            accessKey: null,
            cognitoAuthenticationType: null,
            cognitoAuthenticationProvider: null,
            userArn: null,
            userAgent: 'TestClient/1.0',
            user: null,
            apiKey: null,
            apiKeyId: null,
            clientCert: null,
          },
          domainName: 'api.example.com',
          domainPrefix: 'api',
        },
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        ok: true,
        notificationId: 'http-notif-001',
        queued: false,
      });
      expect(mockNotificationService.processNotification).toHaveBeenCalledWith({
        id: 'http-notif-001',
        type: 'message',
        target: { chatId: 123456789 },
        content: { text: 'HTTP notification' },
        created_at: '2025-01-19T10:00:00.000Z',
      });
    });

    it('should queue notification when queue parameter is true', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'queue-notif-001',
          type: 'alert',
          target: { chatId: 123456789 },
          content: { text: 'Queued notification' },
          metadata: { scheduled: '2025-01-19T14:00:00.000Z' },
        }),
        headers: { 'Content-Type': 'application/json' },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: { queue: 'true' },
        multiValueQueryStringParameters: { queue: ['true'] },
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'api-id-123',
          authorizer: null,
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/prod/notification',
          stage: 'prod',
          requestId: 'api-request-id-456',
          requestTime: '19/Jan/2025:10:00:00 +0000',
          requestTimeEpoch: 1737280800000,
          resourceId: 'resource-id',
          resourcePath: '/notification',
          identity: {
            cognitoIdentityPoolId: null,
            accountId: null,
            cognitoIdentityId: null,
            caller: null,
            sourceIp: '192.0.2.1',
            principalOrgId: null,
            accessKey: null,
            cognitoAuthenticationType: null,
            cognitoAuthenticationProvider: null,
            userArn: null,
            userAgent: 'TestClient/1.0',
            user: null,
            apiKey: null,
            apiKeyId: null,
            clientCert: null,
          },
          domainName: 'api.example.com',
          domainPrefix: 'api',
        },
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        ok: true,
        notificationId: 'queue-notif-001',
        queued: true,
      });
      expect(mockNotificationService.queueNotification).toHaveBeenCalled();
      expect(
        mockNotificationService.processNotification
      ).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid JSON body', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: '{invalid json}',
        headers: { 'Content-Type': 'application/json' },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        ok: false,
        error: 'Invalid JSON in request body',
      });
    });

    it('should return 400 for missing required fields', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'incomplete-notif',
          type: 'message',
          // missing target and content
        }),
        headers: { 'Content-Type': 'application/json' },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        ok: false,
        error: 'Invalid notification payload',
      });
    });

    it('should handle media notifications with photo', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'photo-notif-001',
          type: 'message',
          target: { chatId: 123456789 },
          content: {
            media: {
              type: 'photo',
              url: 'https://example.com/chart.png',
              caption: '📊 Weekly performance report',
            },
          },
        }),
        headers: { 'Content-Type': 'application/json' },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(mockNotificationService.processNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'photo-notif-001',
          content: {
            media: {
              type: 'photo',
              url: 'https://example.com/chart.png',
              caption: '📊 Weekly performance report',
            },
          },
        })
      );
    });

    it('should handle high priority alerts', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'alert-001',
          type: 'alert',
          target: { chatId: 123456789 },
          content: { text: 'System CPU usage is above 90%!' },
          metadata: {
            priority: 'high',
            source: 'monitoring-system',
          },
        }),
        headers: { 'Content-Type': 'application/json' },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(mockNotificationService.processNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'alert',
          metadata: {
            priority: 'high',
            source: 'monitoring-system',
          },
        })
      );
    });

    it('should return 500 when notification processing fails', async () => {
      mockNotificationService.processNotification.mockResolvedValueOnce(false);

      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'fail-notif',
          type: 'message',
          target: { chatId: 123456789 },
          content: { text: 'This will fail' },
        }),
        headers: { 'Content-Type': 'application/json' },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toEqual({
        ok: false,
        notificationId: 'fail-notif',
        queued: false,
      });
    });
  });

  describe('Real-world Lambda Scenarios', () => {
    it('should handle Lambda timeout gracefully', async () => {
      // Simulate low remaining time
      mockContext.getRemainingTimeInMillis = jest.fn().mockReturnValue(1000);

      const sqsEvent: SQSEvent = {
        Records: Array.from({ length: 10 }, (_, i) => ({
          messageId: `msg-${i}`,
          receiptHandle: `receipt-${i}`,
          body: JSON.stringify({
            id: `notif-${i}`,
            type: 'message',
            target: { chatId: 123456789 },
            content: { text: `Message ${i}` },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1737280800000',
            SenderId: 'AROATEST123456',
            ApproximateFirstReceiveTimestamp: '1737280801000',
          },
          messageAttributes: {},
          md5OfBody: `test-md5-${i}`,
          eventSource: 'aws:sqs',
          eventSourceARN:
            'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
          awsRegion: 'us-east-1',
        })),
      };

      await handler(sqsEvent, mockContext);

      expect(logger.info).toHaveBeenCalledWith(
        'Notification batch processed',
        expect.any(Object)
      );
    });

    it('should handle DLQ retry scenarios', async () => {
      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'dlq-msg',
            receiptHandle: 'dlq-receipt',
            body: JSON.stringify({
              id: 'dlq-notif',
              type: 'alert',
              target: { chatId: 123456789 },
              content: { text: 'Retried message from DLQ' },
            }),
            attributes: {
              ApproximateReceiveCount: '4', // High retry count indicates DLQ scenario
              SentTimestamp: '1737280800000',
              SenderId: 'AROATEST123456',
              ApproximateFirstReceiveTimestamp: '1737280801000',
            },
            messageAttributes: {},
            md5OfBody: 'test-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationDLQ',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(mockNotificationService.processNotification).toHaveBeenCalled();
    });

    it('should handle channel notifications', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'channel-001',
          type: 'message',
          target: { channelId: '@your_channel' },
          content: {
            markdown: '*Breaking News*\n\nNew feature released! Check it out.',
          },
        }),
        headers: { 'Content-Type': 'application/json' },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(mockNotificationService.processNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { channelId: '@your_channel' },
          content: {
            markdown: '*Breaking News*\n\nNew feature released! Check it out.',
          },
        })
      );
    });
  });
});
