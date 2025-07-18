import { TelegramService } from '@/services/telegramService';
import { NotificationService } from '@/services/notificationService';
import { config, validateConfig } from '@/config';
import { logger } from '@/utils/logger';

// Main entry point for local development
async function main(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();

    logger.info('Starting Mana Push Bot', {
      stage: config.app.stage,
      version: '1.0.0',
    });

    // Initialize services
    const telegramService = new TelegramService();
    new NotificationService(telegramService); // Initialize but don't assign to variable

    logger.info('Bot services initialized successfully');

    // Set up webhook (for production)
    if (config.app.stage === 'prod' && config.telegram.webhookUrl) {
      try {
        await telegramService
          .getBot()
          .telegram.setWebhook(config.telegram.webhookUrl);
        logger.info('Webhook set successfully', {
          url: config.telegram.webhookUrl,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to set webhook', { error: errorMessage });
      }
    }

    // For local development, start polling
    if (config.app.stage === 'dev') {
      logger.info('Starting bot in polling mode for development');
      await telegramService.getBot().launch();

      // Graceful shutdown
      process.once('SIGINT', () => telegramService.getBot().stop('SIGINT'));
      process.once('SIGTERM', () => telegramService.getBot().stop('SIGTERM'));
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Failed to start bot', {
      error: errorMessage,
      stack: errorStack,
    });
    process.exit(1);
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error in main', { error: error.message });
    process.exit(1);
  });
}

export { main };
