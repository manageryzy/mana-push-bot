import { handler, httpHandler, resetServices } from '@/handlers/notification';
import { handler as webhookHandler } from '@/handlers/webhook';
import { handler as healthHandler } from '@/handlers/health';
import { Context, SQSEvent, APIGatewayProxyEvent } from 'aws-lambda';
import { logger } from '@/utils/logger';

const mockHandleUpdate = jest.fn().mockResolvedValue(undefined);
const mockHandleWebhook = jest.fn().mockImplementation(async body => {
  // Simulate the real handleWebhook calling handleUpdate internally
  mockHandleUpdate(body);
  return { ok: true };
});

jest.mock('@/services/telegramService', () => ({
  TelegramService: jest.fn().mockImplementation(() => ({
    handleUpdate: mockHandleUpdate,
    handleWebhook: mockHandleWebhook,
  })),
}));
const mockProcessNotification = jest.fn().mockResolvedValue(true);
const mockQueueNotification = jest.fn().mockResolvedValue(true);

jest.mock('@/services/notificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    processNotification: mockProcessNotification,
    queueNotification: mockQueueNotification,
  })),
}));
jest.mock('@/utils/logger');
jest.mock('@/config', () => ({
  validateConfig: jest.fn(),
  config: {
    telegram: {
      botToken: 'test-token',
      webhookUrl: 'https://test.com',
    },
    app: {
      stage: 'prod',
      logLevel: 'info',
      port: 3000,
      baseUrl: 'http://localhost:3000',
    },
    aws: {
      region: 'us-east-1',
      notificationQueueUrl: 'test-queue-url',
    },
    developer: {
      adminUserIds: [123456789],
      devChatId: 123456789,
    },
    auth: {
      jwtSecret: 'test-secret',
    },
  },
}));

describe('AWS Lambda Integration Tests', () => {
  let mockContext: Context;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset services to ensure fresh instances with mocks
    resetServices();

    // Create realistic Lambda context
    mockContext = {
      awsRequestId: 'e4f5c6d7-8a9b-0c1d-2e3f-4a5b6c7d8e9f',
      callbackWaitsForEmptyEventLoop: true,
      functionName: 'mana-push-bot-prod-notification',
      functionVersion: '$LATEST',
      invokedFunctionArn:
        'arn:aws:lambda:us-east-1:123456789012:function:mana-push-bot-prod-notification',
      memoryLimitInMB: '256',
      logGroupName: '/aws/lambda/mana-push-bot-prod-notification',
      logStreamName: '2025/01/19/[$LATEST]1a2b3c4d5e6f7890',
      getRemainingTimeInMillis: jest.fn(),
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };
  });

  describe('Cold Start Scenarios', () => {
    it('should handle cold start with initialization', async () => {
      // Simulate cold start with full remaining time
      mockContext.getRemainingTimeInMillis = jest.fn().mockReturnValue(300000); // 5 minutes

      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'cold-start-msg',
            receiptHandle: 'cold-start-receipt',
            body: JSON.stringify({
              id: 'cold-start-notif',
              type: 'message',
              target: { chatId: 123456789 },
              content: { text: 'Cold start test' },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: Date.now().toString(),
              SenderId: 'AROAIDPPEZS3A3QDU576Q',
              ApproximateFirstReceiveTimestamp: Date.now().toString(),
            },
            messageAttributes: {},
            md5OfBody: 'a1b2c3d4e5f6',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(logger.info).toHaveBeenCalledWith(
        'Services initialized for notification processing'
      );
    });

    it('should optimize for warm invocations', async () => {
      // Reset services to ensure clean cold start
      resetServices();

      const sqsEvent: SQSEvent = { Records: [] };

      // Clear any previous mock calls
      jest.clearAllMocks();

      // First invocation (cold start)
      await handler(sqsEvent, mockContext);
      const firstCallCount = (logger.info as jest.Mock).mock.calls.length;

      // Second invocation (warm start) - don't reset services
      await handler(sqsEvent, mockContext);
      const totalCallsAfterSecond = (logger.info as jest.Mock).mock.calls
        .length;
      const secondCallCount = totalCallsAfterSecond - firstCallCount;

      // Warm invocation should have fewer log calls (no initialization)
      expect(secondCallCount).toBeLessThan(firstCallCount);
    });
  });

  describe('Lambda Timeout Handling', () => {
    it('should gracefully handle approaching timeout', async () => {
      // Start with 5 seconds, then decrease rapidly
      let timeRemaining = 5000;
      mockContext.getRemainingTimeInMillis = jest.fn(() => {
        timeRemaining -= 1000;
        return timeRemaining;
      });

      const sqsEvent: SQSEvent = {
        Records: Array.from({ length: 20 }, (_, i) => ({
          messageId: `timeout-msg-${i}`,
          receiptHandle: `timeout-receipt-${i}`,
          body: JSON.stringify({
            id: `timeout-notif-${i}`,
            type: 'message',
            target: { chatId: 123456789 },
            content: { text: `Message ${i}` },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: Date.now().toString(),
            SenderId: 'AROAIDPPEZS3A3QDU576Q',
            ApproximateFirstReceiveTimestamp: Date.now().toString(),
          },
          messageAttributes: {},
          md5OfBody: `md5-${i}`,
          eventSource: 'aws:sqs',
          eventSourceARN:
            'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
          awsRegion: 'us-east-1',
        })),
      };

      await handler(sqsEvent, mockContext);

      // Should log batch processing completion even with timeout pressure
      expect(logger.info).toHaveBeenCalledWith(
        'Notification batch processed',
        expect.any(Object)
      );
    });
  });

  describe('Multi-Region Event Handling', () => {
    it('should handle events from different AWS regions', async () => {
      const regions = ['us-east-1', 'eu-west-1', 'ap-southeast-1'];

      for (const region of regions) {
        const sqsEvent: SQSEvent = {
          Records: [
            {
              messageId: `${region}-msg`,
              receiptHandle: `${region}-receipt`,
              body: JSON.stringify({
                id: `${region}-notif`,
                type: 'message',
                target: { chatId: 123456789 },
                content: { text: `Message from ${region}` },
              }),
              attributes: {
                ApproximateReceiveCount: '1',
                SentTimestamp: Date.now().toString(),
                SenderId: 'AROAIDPPEZS3A3QDU576Q',
                ApproximateFirstReceiveTimestamp: Date.now().toString(),
              },
              messageAttributes: {},
              md5OfBody: `md5-${region}`,
              eventSource: 'aws:sqs',
              eventSourceARN: `arn:aws:sqs:${region}:123456789012:NotificationQueue`,
              awsRegion: region,
            },
          ],
        };

        await handler(sqsEvent, mockContext);

        expect(logger.info).toHaveBeenCalledWith(
          'Processing SQS batch',
          expect.objectContaining({
            recordCount: 1,
          })
        );
      }
    });
  });

  describe('API Gateway Integration Patterns', () => {
    it('should handle API Gateway with custom authorizer context', async () => {
      const apiEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          id: 'auth-notif',
          type: 'message',
          target: { chatId: 123456789 },
          content: { text: 'Authorized message' },
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'test-api-key',
          'CloudFront-Viewer-Country': 'US',
          'CloudFront-Is-Mobile-Viewer': 'false',
        },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/notification',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: { stage: 'prod' },
        requestContext: {
          accountId: '123456789012',
          apiId: 'abc123def456',
          authorizer: {
            userId: '123456789',
            principalId: 'user|123456789',
            integrationLatency: 123,
          },
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/prod/notification',
          stage: 'prod',
          requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
          requestTime: '19/Jan/2025:10:00:00 +0000',
          requestTimeEpoch: 1737280800000,
          resourceId: '123456',
          resourcePath: '/notification',
          identity: {
            cognitoIdentityPoolId: null,
            accountId: null,
            cognitoIdentityId: null,
            caller: null,
            sourceIp: '203.0.113.0',
            principalOrgId: null,
            accessKey: null,
            cognitoAuthenticationType: null,
            cognitoAuthenticationProvider: null,
            userArn: null,
            userAgent: 'Custom User Agent String/1.0',
            user: null,
            apiKey: 'test-api-key',
            apiKeyId: 'test-key-id',
            clientCert: null,
          },
          domainName: 'api.example.com',
          domainPrefix: 'api',
        },
        resource: '/notification',
      };

      const response = await httpHandler(apiEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(response.headers).toHaveProperty(
        'Content-Type',
        'application/json'
      );
    });

    it('should handle API Gateway with binary data', async () => {
      const binaryData = Buffer.from('binary content').toString('base64');

      const apiEvent: APIGatewayProxyEvent = {
        body: binaryData,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: true,
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
      expect(JSON.parse(response.body).error).toBe(
        'Invalid JSON in request body'
      );
    });
  });

  describe('SQS Event Source Variations', () => {
    it('should handle SQS FIFO queue messages', async () => {
      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'fifo-msg-001',
            receiptHandle: 'fifo-receipt-001',
            body: JSON.stringify({
              id: 'fifo-notif-001',
              type: 'message',
              target: { chatId: 123456789 },
              content: { text: 'FIFO message' },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: Date.now().toString(),
              SenderId: 'AROAIDPPEZS3A3QDU576Q',
              ApproximateFirstReceiveTimestamp: Date.now().toString(),
              MessageGroupId: 'notification-group-1',
              MessageDeduplicationId: 'dedup-123456',
              SequenceNumber: '18849496460467696128',
            },
            messageAttributes: {
              priority: {
                stringValue: 'high',
                dataType: 'String',
              },
            },
            md5OfBody: 'fifo-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue.fifo',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(logger.info).toHaveBeenCalledWith(
        'Notification processed successfully',
        expect.objectContaining({
          notificationId: 'fifo-notif-001',
        })
      );
    });

    it('should handle messages with custom attributes', async () => {
      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'attr-msg',
            receiptHandle: 'attr-receipt',
            body: JSON.stringify({
              id: 'attr-notif',
              type: 'alert',
              target: { chatId: 123456789 },
              content: { text: 'Alert with attributes' },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: Date.now().toString(),
              SenderId: 'AROAIDPPEZS3A3QDU576Q',
              ApproximateFirstReceiveTimestamp: Date.now().toString(),
            },
            messageAttributes: {
              source: {
                stringValue: 'monitoring-system',
                dataType: 'String',
              },
              severity: {
                stringValue: 'critical',
                dataType: 'String',
              },
              retryCount: {
                stringValue: '0',
                dataType: 'Number',
              },
              metadata: {
                stringValue: JSON.stringify({
                  server: 'web-01',
                  region: 'us-east-1',
                }),
                dataType: 'String',
              },
            },
            md5OfBody: 'attr-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(logger.debug).toHaveBeenCalledWith(
        'Processing notification record',
        expect.objectContaining({
          messageId: 'attr-msg',
        })
      );
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial batch failures with individual record retry', async () => {
      // Reset and configure mock for this specific test
      mockProcessNotification
        .mockResolvedValueOnce(true) // First succeeds
        .mockResolvedValueOnce(false) // Second fails
        .mockResolvedValueOnce(true); // Third succeeds

      const sqsEvent: SQSEvent = {
        Records: [
          {
            messageId: 'success-1',
            receiptHandle: 'receipt-1',
            body: JSON.stringify({
              id: 'notif-1',
              type: 'message',
              target: { chatId: 111111111 },
              content: { text: 'Success 1' },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: Date.now().toString(),
              SenderId: 'AROAIDPPEZS3A3QDU576Q',
              ApproximateFirstReceiveTimestamp: Date.now().toString(),
            },
            messageAttributes: {},
            md5OfBody: 'md5-1',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
          {
            messageId: 'fail-1',
            receiptHandle: 'receipt-2',
            body: JSON.stringify({
              id: 'notif-2',
              type: 'message',
              target: { chatId: 222222222 },
              content: { text: 'Fail 1' },
            }),
            attributes: {
              ApproximateReceiveCount: '2',
              SentTimestamp: Date.now().toString(),
              SenderId: 'AROAIDPPEZS3A3QDU576Q',
              ApproximateFirstReceiveTimestamp: Date.now().toString(),
            },
            messageAttributes: {},
            md5OfBody: 'md5-2',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
          {
            messageId: 'success-2',
            receiptHandle: 'receipt-3',
            body: JSON.stringify({
              id: 'notif-3',
              type: 'message',
              target: { chatId: 333333333 },
              content: { text: 'Success 2' },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: Date.now().toString(),
              SenderId: 'AROAIDPPEZS3A3QDU576Q',
              ApproximateFirstReceiveTimestamp: Date.now().toString(),
            },
            messageAttributes: {},
            md5OfBody: 'md5-3',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      await handler(sqsEvent, mockContext);

      expect(logger.info).toHaveBeenCalledWith(
        'Notification batch processed',
        expect.objectContaining({
          total: 3,
          successful: 2,
          failed: 1,
        })
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Notification processing failed',
        expect.objectContaining({
          recordIndex: 1,
          messageId: 'fail-1',
        })
      );
    });

    it('should handle Lambda service limits gracefully', async () => {
      // Simulate hitting Lambda concurrent execution limit
      mockContext.getRemainingTimeInMillis = jest.fn().mockReturnValue(100); // Very low time

      const largeEvent: SQSEvent = {
        Records: Array.from({ length: 100 }, (_, i) => ({
          messageId: `large-batch-${i}`,
          receiptHandle: `large-receipt-${i}`,
          body: JSON.stringify({
            id: `large-notif-${i}`,
            type: 'message',
            target: { chatId: 123456789 },
            content: { text: `Large batch message ${i}` },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: Date.now().toString(),
            SenderId: 'AROAIDPPEZS3A3QDU576Q',
            ApproximateFirstReceiveTimestamp: Date.now().toString(),
          },
          messageAttributes: {},
          md5OfBody: `large-md5-${i}`,
          eventSource: 'aws:sqs',
          eventSourceARN:
            'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
          awsRegion: 'us-east-1',
        })),
      };

      await handler(largeEvent, mockContext);

      // Should complete even with time pressure
      expect(logger.info).toHaveBeenCalledWith(
        'Notification batch processed',
        expect.any(Object)
      );
    });
  });

  describe('Cross-Service Integration', () => {
    it('should handle webhook events from Telegram', async () => {
      const webhookEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          update_id: 123456789,
          message: {
            message_id: 1,
            from: {
              id: 123456789,
              is_bot: false,
              first_name: 'Test',
              username: 'testuser',
            },
            chat: {
              id: 123456789,
              first_name: 'Test',
              username: 'testuser',
              type: 'private',
            },
            date: 1737280800,
            text: '/start',
          },
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'test-secret',
        },
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

      const response = await webhookHandler(webhookEvent, mockContext);

      expect(response.statusCode).toBe(200);
      expect(mockHandleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          update_id: 123456789,
        })
      );
    });

    it('should handle health checks with detailed metrics', async () => {
      const healthEvent: APIGatewayProxyEvent = {
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
        requestContext: {
          accountId: '123456789012',
          apiId: 'health-api',
          authorizer: null,
          protocol: 'HTTP/1.1',
          httpMethod: 'GET',
          path: '/prod/health',
          stage: 'prod',
          requestId: 'health-request-123',
          requestTime: '19/Jan/2025:10:00:00 +0000',
          requestTimeEpoch: 1737280800000,
          resourceId: 'health-resource',
          resourcePath: '/health',
          identity: {
            cognitoIdentityPoolId: null,
            accountId: null,
            cognitoIdentityId: null,
            caller: null,
            sourceIp: '203.0.113.0',
            principalOrgId: null,
            accessKey: null,
            cognitoAuthenticationType: null,
            cognitoAuthenticationProvider: null,
            userArn: null,
            userAgent: 'HealthChecker/1.0',
            user: null,
            apiKey: null,
            apiKeyId: null,
            clientCert: null,
          },
          domainName: 'api.example.com',
          domainPrefix: 'api',
        },
        resource: '/health',
      };

      const response = await healthHandler(healthEvent, mockContext);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: 'healthy',
        service: 'mana-push-bot',
        stage: 'prod',
        checks: {
          environment: {
            telegram_bot_token: true,
          },
        },
      });
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle high-throughput scenarios efficiently', async () => {
      const startTime = Date.now();

      const highThroughputEvent: SQSEvent = {
        Records: Array.from({ length: 25 }, (_, i) => ({
          messageId: `perf-msg-${i}`,
          receiptHandle: `perf-receipt-${i}`,
          body: JSON.stringify({
            id: `perf-notif-${i}`,
            type: 'message',
            target: { chatId: 123456789 + i },
            content: { text: `Performance test ${i}` },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: Date.now().toString(),
            SenderId: 'AROAIDPPEZS3A3QDU576Q',
            ApproximateFirstReceiveTimestamp: Date.now().toString(),
          },
          messageAttributes: {},
          md5OfBody: `perf-md5-${i}`,
          eventSource: 'aws:sqs',
          eventSourceARN:
            'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
          awsRegion: 'us-east-1',
        })),
      };

      await handler(highThroughputEvent, mockContext);

      const processingTime = Date.now() - startTime;

      // Should process 25 messages in under 5 seconds
      expect(processingTime).toBeLessThan(5000);

      expect(logger.info).toHaveBeenCalledWith(
        'Notification batch processed',
        expect.objectContaining({
          total: 25,
        })
      );
    });

    it('should optimize memory usage for large payloads', async () => {
      const largePayload = 'x'.repeat(100000); // 100KB payload

      const memoryEvent: SQSEvent = {
        Records: [
          {
            messageId: 'large-payload-msg',
            receiptHandle: 'large-payload-receipt',
            body: JSON.stringify({
              id: 'large-payload-notif',
              type: 'message',
              target: { chatId: 123456789 },
              content: { text: largePayload },
            }),
            attributes: {
              ApproximateReceiveCount: '1',
              SentTimestamp: Date.now().toString(),
              SenderId: 'AROAIDPPEZS3A3QDU576Q',
              ApproximateFirstReceiveTimestamp: Date.now().toString(),
            },
            messageAttributes: {},
            md5OfBody: 'large-payload-md5',
            eventSource: 'aws:sqs',
            eventSourceARN:
              'arn:aws:sqs:us-east-1:123456789012:NotificationQueue',
            awsRegion: 'us-east-1',
          },
        ],
      };

      const memBefore = process.memoryUsage().heapUsed;
      await handler(memoryEvent, mockContext);
      const memAfter = process.memoryUsage().heapUsed;

      // Memory increase should be reasonable (less than 10MB)
      const memIncrease = memAfter - memBefore;
      expect(memIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});
