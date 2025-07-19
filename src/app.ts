import { TelegramService } from './services/telegramService';
import { ConfigService } from './services/configService';
import { ChannelService } from './services/channelService';
import { MessagePushService } from './services/messagePushService';
import { HttpServer } from './services/httpServer';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';

export class Application {
  private telegramService: TelegramService;
  private configService: ConfigService;
  private channelService: ChannelService;
  private messagePushService: MessagePushService;
  private httpServer: HttpServer;
  private isRunning = false;

  constructor() {
    // Initialize services
    this.configService = new ConfigService();
    this.telegramService = new TelegramService();
    this.channelService = new ChannelService(
      this.configService,
      this.telegramService
    );
    this.messagePushService = new MessagePushService(
      this.telegramService,
      this.channelService,
      this.configService
    );
    this.httpServer = new HttpServer(
      this.channelService,
      this.messagePushService
    );
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting Mana Push Bot application...');

      // Validate configuration
      validateConfig();

      // Initialize services
      await this.configService.initialize();

      // Start HTTP server
      await this.httpServer.start(config.app.port);

      // Start Telegram bot
      await this.telegramService.start();

      this.isRunning = true;
      logger.info('Application started successfully', {
        port: config.app.port,
        stage: config.app.stage,
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

  // Getters for accessing services (useful for testing)
  getConfigService(): ConfigService {
    return this.configService;
  }

  getChannelService(): ChannelService {
    return this.channelService;
  }

  getMessagePushService(): MessagePushService {
    return this.messagePushService;
  }

  getHttpServer(): HttpServer {
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
export const app = new Application();

// Start application if this file is run directly
if (require.main === module) {
  app.start().catch(error => {
    logger.error('Failed to start application', { error });
    process.exit(1);
  });
}
