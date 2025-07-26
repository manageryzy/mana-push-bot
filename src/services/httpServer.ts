import express, { Request, Response } from 'express';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { AuthService } from '@/utils/auth';
import { ChannelService } from '@/services/channelService';
import { MessagePushService } from '@/services/messagePushService';

export interface PushMessageRequest {
  channel: string;
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

export class HttpServer {
  private app: express.Application;
  private channelService: ChannelService;
  private messagePushService: MessagePushService;
  private server: any;

  constructor(
    channelService: ChannelService,
    messagePushService: MessagePushService
  ) {
    this.app = express();
    this.channelService = channelService;
    this.messagePushService = messagePushService;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));

    // Handle JSON parsing errors
    this.app.use((error: any, _req: Request, res: Response, next: any) => {
      if (error instanceof SyntaxError && 'body' in error) {
        return res
          .status(400)
          .json(this.createResponse(false, null, 'Invalid JSON format'));
      }
      return next(error);
    });
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
    this.app.get('/health', this.handleHealthCheck.bind(this));

    // Message pushing endpoint
    this.app.post('/push/:channel', this.handlePushMessage.bind(this));
    this.app.post('/push', this.handlePushMessage.bind(this));

    // Channel management endpoints (admin only)
    this.app.get('/api/channels', this.handleGetChannels.bind(this));
    this.app.post('/api/channels', this.handleCreateChannel.bind(this));
    this.app.put(
      '/api/channels/:channelId',
      this.handleUpdateChannel.bind(this)
    );
    this.app.delete(
      '/api/channels/:channelId',
      this.handleDeleteChannel.bind(this)
    );

    // Subscription endpoints
    this.app.post('/api/subscribe/:channelId', this.handleSubscribe.bind(this));
    this.app.delete(
      '/api/subscribe/:channelId',
      this.handleUnsubscribe.bind(this)
    );
    this.app.get('/api/subscriptions', this.handleGetSubscriptions.bind(this));

    // Admin endpoints
    this.app.get(
      '/api/admin/push-url/:channelId',
      this.handleGetPushUrl.bind(this)
    );
    this.app.get('/api/admin/stats', this.handleGetAdminStats.bind(this));

    // Error handling
    this.app.use(this.handleError.bind(this));
  }

  private async handleHealthCheck(_req: Request, res: Response): Promise<void> {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      environment: config.app.stage,
    };

    res.json(this.createResponse(true, health));
  }

  private async handlePushMessage(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const channel = req.params.channel || req.body.channel;
      const {
        message,
        format = 'markdown',
        priority = 'normal',
        metadata,
      } = req.body as PushMessageRequest;

      if (!channel) {
        return res
          .status(400)
          .json(this.createResponse(false, null, 'Channel is required'));
      }

      if (!message) {
        return res
          .status(400)
          .json(this.createResponse(false, null, 'Message is required'));
      }

      // Validate channel exists
      const channelData = await this.channelService.getChannel(channel);
      if (!channelData) {
        return res
          .status(404)
          .json(this.createResponse(false, null, 'Channel not found'));
      }

      // Push message to channel
      const result = await this.messagePushService.pushToChannel({
        channelId: channel,
        message,
        format,
        priority,
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      });

      // Check if push failed
      if (!result.success) {
        return res
          .status(500)
          .json(
            this.createResponse(
              false,
              null,
              `Failed to push message: ${result.error}`
            )
          );
      }

      return res.json(this.createResponse(true, result));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to push message', { error: errorMessage });
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleGetChannels(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);

      // Admin users get all channels, regular/unauthenticated users get public channels only
      const channels = this.isAdmin(userId)
        ? await this.channelService.getAllChannels()
        : await this.channelService.getPublicChannels();

      return res.json(this.createResponse(true, channels));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleCreateChannel(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!userId) {
        return res
          .status(401)
          .json(this.createResponse(false, null, 'Authentication required'));
      }

      if (!this.isAdmin(userId)) {
        return res
          .status(403)
          .json(this.createResponse(false, null, 'Admin access required'));
      }

      const { name, description, chatId, isPublic = false } = req.body;
      if (!name || !chatId) {
        return res
          .status(400)
          .json(
            this.createResponse(false, null, 'Name and chatId are required')
          );
      }

      const channel = await this.channelService.createChannel({
        name,
        description,
        chatId,
        isPublic,
        createdBy: userId,
      });

      return res.status(201).json(this.createResponse(true, channel));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleUpdateChannel(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!this.isAdmin(userId)) {
        return res
          .status(403)
          .json(this.createResponse(false, null, 'Admin access required'));
      }

      const { channelId } = req.params;
      const updates = req.body;

      const channel = await this.channelService.updateChannel(
        channelId,
        updates
      );
      if (!channel) {
        return res
          .status(404)
          .json(this.createResponse(false, null, 'Channel not found'));
      }

      return res.json(this.createResponse(true, channel));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleDeleteChannel(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!this.isAdmin(userId)) {
        return res
          .status(403)
          .json(this.createResponse(false, null, 'Admin access required'));
      }

      const { channelId } = req.params;
      const deleted = await this.channelService.deleteChannel(channelId);

      if (!deleted) {
        return res
          .status(404)
          .json(this.createResponse(false, null, 'Channel not found'));
      }

      return res.json(this.createResponse(true, { deleted: true }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleSubscribe(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!userId) {
        return res
          .status(401)
          .json(this.createResponse(false, null, 'Authentication required'));
      }
      const chatId = req.body.chatId || req.query.chatId;
      if (!chatId) {
        return res
          .status(400)
          .json(this.createResponse(false, null, 'Chat ID is required'));
      }

      const { channelId } = req.params;
      const result = await this.channelService.subscribe(
        userId,
        channelId,
        chatId
      );

      return res.json(this.createResponse(true, result));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleUnsubscribe(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!userId) {
        return res
          .status(401)
          .json(this.createResponse(false, null, 'Authentication required'));
      }

      const { channelId } = req.params;
      const result = await this.channelService.unsubscribe(userId, channelId);

      return res.json(this.createResponse(true, result));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleGetSubscriptions(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!userId) {
        return res
          .status(401)
          .json(this.createResponse(false, null, 'Authentication required'));
      }

      const subscriptions =
        await this.channelService.getUserSubscriptions(userId);
      return res.json(this.createResponse(true, subscriptions));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleGetPushUrl(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!this.isAdmin(userId)) {
        return res
          .status(403)
          .json(this.createResponse(false, null, 'Admin access required'));
      }

      const { channelId } = req.params;
      const channel = await this.channelService.getChannel(channelId);

      if (!channel) {
        return res
          .status(404)
          .json(this.createResponse(false, null, 'Channel not found'));
      }

      const pushUrl = `${config.app.baseUrl}/push/${channelId}`;
      const webhookUrl = `${config.app.baseUrl}/webhook/${channelId}`;

      return res.json(
        this.createResponse(true, {
          channelId,
          channelName: channel.name,
          pushUrl,
          webhookUrl,
          example: `curl -X POST "${pushUrl}" -H "Content-Type: application/json" -d '{"message": "Hello from API!"}'`,
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private async handleGetAdminStats(
    req: Request,
    res: Response
  ): Promise<Response> {
    try {
      const userId = this.extractUserId(req);
      if (!this.isAdmin(userId)) {
        return res
          .status(403)
          .json(this.createResponse(false, null, 'Admin access required'));
      }

      const stats = await this.messagePushService.getStats();
      return res.json(this.createResponse(true, stats));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res
        .status(500)
        .json(this.createResponse(false, null, errorMessage));
    }
  }

  private handleError(
    error: any,
    req: Request,
    res: Response,
    _next: any
  ): Response {
    logger.error('HTTP server error', {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
    });

    return res
      .status(500)
      .json(this.createResponse(false, null, 'Internal server error'));
  }

  private extractUserId(req: Request): number | null {
    const authHeader = req.get('Authorization');
    const userIdParam = req.query.userId as string;
    const userIdBody = req.body.userId;

    return AuthService.extractUserId(authHeader, userIdParam, userIdBody);
  }

  private isAdmin(userId: number | null): boolean {
    if (!userId) return false;
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

  public start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if server is already running
      if (this.server && this.server.listening) {
        logger.info(`HTTP server already running on port ${port}`);
        resolve();
        return;
      }

      this.server = this.app.listen(port, () => {
        logger.info(`HTTP server started on port ${port}`);
        resolve();
      });

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.warn(`Port ${port} is already in use`);
          resolve(); // Don't reject, just resolve as if already running
        } else {
          reject(error);
        }
      });
    });
  }

  public stop(): Promise<void> {
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
