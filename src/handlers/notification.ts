import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { TelegramService } from '@/services/telegramService';
import { NotificationService } from '@/services/notificationService';
import { NotificationPayload } from '@/types';
import { logger } from '@/utils/logger';
import { validateConfig } from '@/config';

let telegramService: TelegramService;
let notificationService: NotificationService;

// Export for testing purposes
export const resetServices = (): void => {
  telegramService = undefined as any;
  notificationService = undefined as any;
};

export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<void> => {
  try {
    // Validate configuration
    validateConfig();

    // Initialize services if not already done
    if (!telegramService) {
      telegramService = new TelegramService();
      notificationService = new NotificationService(telegramService);
      logger.info('Services initialized for notification processing');
    }

    logger.info('Processing SQS batch', {
      recordCount: event.Records.length,
      requestId: context.awsRequestId,
    });

    // Process each notification
    const results = await Promise.allSettled(
      event.Records.map(record => processNotificationRecord(record))
    );

    // Log results
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info('Notification batch processed', {
      total: event.Records.length,
      successful,
      failed,
      requestId: context.awsRequestId,
    });

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('Notification processing failed', {
          recordIndex: index,
          messageId: event.Records[index].messageId,
          error: result.reason,
        });
      }
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Notification handler error', {
      error: errorMessage,
      stack: errorStack,
      requestId: context.awsRequestId,
    });

    // Re-throw to trigger SQS retry mechanism
    throw error;
  }
};

async function processNotificationRecord(record: SQSRecord): Promise<boolean> {
  try {
    logger.debug('Processing notification record', {
      messageId: record.messageId,
      receiptHandle: record.receiptHandle,
    });

    // Parse notification payload
    let payload: NotificationPayload;
    try {
      payload = JSON.parse(record.body);
    } catch (error) {
      logger.error('Invalid JSON in SQS message', {
        messageId: record.messageId,
        body: record.body,
      });
      throw new Error('Invalid JSON in SQS message');
    }

    // Validate payload structure
    if (!payload.id || !payload.type || !payload.target || !payload.content) {
      logger.error('Invalid notification payload structure', {
        messageId: record.messageId,
        payload,
      });
      throw new Error('Invalid notification payload structure');
    }

    // Process the notification
    const success = await notificationService.processNotification(payload);

    if (!success) {
      throw new Error('Notification processing failed');
    }

    logger.info('Notification processed successfully', {
      notificationId: payload.id,
      type: payload.type,
      messageId: record.messageId,
    });

    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing notification record', {
      messageId: record.messageId,
      error: errorMessage,
    });

    // Re-throw to trigger SQS retry/DLQ mechanism
    throw error;
  }
}

// HTTP endpoint for sending notifications (alternative to SQS)
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const httpHandler = async (
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    // Validate configuration
    validateConfig();

    // Initialize services if not already done
    if (!telegramService) {
      telegramService = new TelegramService();
      notificationService = new NotificationService(telegramService);
    }

    // Parse request body
    let payload: NotificationPayload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Invalid JSON in request body',
        }),
      };
    }

    // Validate payload
    if (!payload.id || !payload.type || !payload.target || !payload.content) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'Invalid notification payload',
        }),
      };
    }

    // Check if notification should be queued or processed immediately
    const shouldQueue = event.queryStringParameters?.queue === 'true';

    let success: boolean;
    if (shouldQueue) {
      success = await notificationService.queueNotification(payload);
    } else {
      success = await notificationService.processNotification(payload);
    }

    return {
      statusCode: success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: success,
        notificationId: payload.id,
        queued: shouldQueue,
      }),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('HTTP notification handler error', {
      error: errorMessage,
      stack: errorStack,
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
      }),
    };
  }
};
