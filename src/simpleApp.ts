import { TelegramService } from './services/telegramService';
import { SimpleHttpServer } from './services/simpleHttpServer';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';

export class SimpleApplication {
  private telegramService: TelegramService;
  private httpServer: SimpleHttpServer;
  private isRunning = false;

  constructor() {
    this.telegramService = new TelegramService();
    this.httpServer = new SimpleHttpServer();
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting Mana Push Bot application (simple mode)...');

      // Validate configuration
      validateConfig();

      // Start HTTP server
      await this.httpServer.start(config.app.port || 3001);

      // Start Telegram bot
      await this.telegramService.start();

      this.isRunning = true;
      logger.info('Application started successfully', {
        port: config.app.port,
        stage: config.app.stage,
        mode: 'simple',
      });

      // Handle graceful shutdown
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
    } catch (error) {
      logger.error('Failed to start application', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping application...');

    try {
      // Stop services
      await this.httpServer.stop();
      await this.telegramService.stop();

      this.isRunning = false;
      logger.info('Application stopped successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  }

  // Getters for accessing services
  getHttpServer(): SimpleHttpServer {
    return this.httpServer;
  }

  getTelegramService(): TelegramService {
    return this.telegramService;
  }

  isApplicationRunning(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const simpleApp = new SimpleApplication();

// Start application if this file is run directly
if (require.main === module) {
  simpleApp.start().catch(error => {
    logger.error('Failed to start application', { error });
    process.exit(1);
  });
}
