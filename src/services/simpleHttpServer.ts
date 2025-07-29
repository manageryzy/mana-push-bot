import express, { Request, Response } from 'express';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { AuthService } from '@/utils/auth';
import { ChannelService } from '@/services/channelService';
import { ConfigService } from '@/services/configService';
import { TelegramService } from '@/services/telegramService';
import { MessagePushService } from '@/services/messagePushService';

export interface PushMessageRequest {
  channel?: string;
  message: string;
  format?: 'text' | 'markdown' | 'html';
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export class SimpleHttpServer {
  private app: express.Application;
  private server: any;
  private channelService!: ChannelService;
  private messagePushService!: MessagePushService;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private async initializeServices(): Promise<void> {
    try {
      const configService = new ConfigService();
      await configService.initialize(); // This loads the bot-config.json file

      const telegramService = new TelegramService();
      this.channelService = new ChannelService(configService, telegramService);
      this.messagePushService = new MessagePushService(
        telegramService,
        this.channelService,
        configService
      );

      logger.info('Services initialized and configuration loaded');
    } catch (error) {
      logger.error('Failed to initialize services', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async start(port: number = 3000): Promise<void> {
    // Initialize services before starting the server
    await this.initializeServices();

    return new Promise(resolve => {
      this.server = this.app.listen(port, () => {
        logger.info(
          `HTTP server started on port ${port} with services initialized`
        );
        resolve();
      });
    });
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware
    this.app.use((req: any, res: any, next: any) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req: any, _res: any, next: any) => {
      logger.info('HTTP request received', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        environment: config.app.stage,
      };

      res.json(this.createResponse(true, health));
    });

    // Message push endpoints
    this.app.post('/push/:channel', async (req: Request, res: Response) => {
      await this.handlePushMessage(req, res);
    });

    this.app.post('/push', async (req: Request, res: Response) => {
      await this.handlePushMessage(req, res);
    });

    // Basic channel info endpoint
    this.app.get('/api/channels', async (req: Request, res: Response) => {
      try {
        const userId = this.extractUserId(req);
        if (!this.isAdmin(userId)) {
          res
            .status(403)
            .json(this.createResponse(false, null, 'Admin access required'));
          return;
        }

        // Use real ChannelService to get channels
        if (!this.channelService) {
          res
            .status(503)
            .json(this.createResponse(false, null, 'Services not initialized'));
          return;
        }

        const channels = await this.channelService.getAllChannels();
        res.json(this.createResponse(true, channels));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to get channels', { error: errorMessage });
        res.status(500).json(this.createResponse(false, null, errorMessage));
      }
    });

    // Get push URL endpoint
    this.app.get(
      '/api/admin/push-url/:channelId',
      (req: Request, res: Response) => {
        const userId = this.extractUserId(req);
        if (!this.isAdmin(userId)) {
          res
            .status(403)
            .json(this.createResponse(false, null, 'Admin access required'));
          return;
        }

        const { channelId } = req.params;
        const pushUrl = `${config.app.baseUrl}/push/${channelId}`;

        res.json(
          this.createResponse(true, {
            channelId,
            pushUrl,
            documentation: {
              method: 'POST',
              contentType: 'application/json',
              body: {
                message: 'Your message here',
                format: 'markdown | text | html (optional, default: markdown)',
                priority: 'low | normal | high (optional, default: normal)',
                metadata: 'Additional data (optional)',
              },
            },
          })
        );
      }
    );

    // Error handling
    this.app.use((error: any, req: Request, res: Response, _next: any) => {
      logger.error('HTTP server error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
      });

      res
        .status(500)
        .json(this.createResponse(false, null, 'Internal server error'));
    });
  }

  private async handlePushMessage(req: Request, res: Response): Promise<void> {
    try {
      // Check if services are initialized
      if (!this.messagePushService || !this.channelService) {
        res
          .status(503)
          .json(
            this.createResponse(
              false,
              null,
              'Services not initialized. Server may still be starting up.'
            )
          );
        return;
      }

      const channel = req.params.channel || req.body.channel;
      const {
        message,
        format = 'markdown',
        priority = 'normal',
        metadata,
      } = req.body as PushMessageRequest;

      if (!channel) {
        res
          .status(400)
          .json(this.createResponse(false, null, 'Channel is required'));
        return;
      }

      if (!message) {
        res
          .status(400)
          .json(this.createResponse(false, null, 'Message is required'));
        return;
      }

      // Log the push request
      logger.info('Message push requested', {
        channel,
        format,
        priority,
        messageLength: message.length,
        hasMetadata: !!metadata,
      });

      // Use MessagePushService to actually send the message
      const pushData = {
        channelId: channel,
        message,
        format,
        priority,
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      };

      try {
        const result = await this.messagePushService.pushToChannel(pushData);

        if (result.success) {
          res.json(
            this.createResponse(true, {
              channelId: result.channelId,
              status: 'sent',
              messageId: result.messageId,
              timestamp: result.timestamp,
              recipientCount: result.recipientCount,
            })
          );
        } else {
          res
            .status(500)
            .json(
              this.createResponse(
                false,
                null,
                result.error || 'Failed to send message'
              )
            );
        }
      } catch (pushError) {
        const pushErrorMessage =
          pushError instanceof Error ? pushError.message : 'Unknown push error';
        logger.error('Push operation failed', {
          error: pushErrorMessage,
          pushData,
        });
        res
          .status(500)
          .json(
            this.createResponse(false, null, `Push failed: ${pushErrorMessage}`)
          );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process push request', { error: errorMessage });
      res.status(500).json(this.createResponse(false, null, errorMessage));
    }
  }

  private extractUserId(req: Request): number | null {
    const authHeader = req.get('Authorization');
    const userIdParam = req.query.userId as string;
    const userIdBody = req.body?.userId;

    return AuthService.extractUserId(authHeader, userIdParam, userIdBody);
  }

  private isAdmin(userId: number | null): boolean {
    if (!userId) {
      return false;
    }
    return AuthService.isAdmin(userId);
  }

  private createResponse<T>(
    success: boolean,
    data?: T,
    error?: string
  ): ApiResponse<T> {
    const response: ApiResponse<T> = {
      success,
      timestamp: new Date().toISOString(),
    };

    if (data !== undefined) {
      response.data = data;
    }

    if (error !== undefined) {
      response.error = error;
    }

    return response;
  }

  public async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}
