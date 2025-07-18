import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { TelegramService } from '@/services/telegramService';
import { logger } from '@/utils/logger';
import { validateConfig } from '@/config';

let telegramService: TelegramService;

export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    // Validate configuration
    validateConfig();

    // Initialize services if not already done
    if (!telegramService) {
      telegramService = new TelegramService();
      logger.info('Telegram service initialized');
    }

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      logger.error('Invalid JSON in request body', { body: event.body });
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ok: false,
          error: 'Invalid JSON in request body',
        }),
      };
    }

    // Validate Telegram webhook
    if (!body.update_id) {
      logger.error('Invalid webhook payload - missing update_id', { body });
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ok: false,
          error: 'Invalid webhook payload',
        }),
      };
    }

    // Process the webhook
    logger.info('Processing webhook', {
      updateId: body.update_id,
      hasMessage: !!body.message,
      hasCallbackQuery: !!body.callback_query,
    });

    const result = await telegramService.handleWebhook(body);

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    logger.error('Webhook handler error', {
      error: error.message,
      stack: error.stack,
      event: {
        httpMethod: event.httpMethod,
        path: event.path,
        headers: event.headers,
      },
    });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: false,
        error: 'Internal server error',
      }),
    };
  }
};
