import express, { Request, Response } from 'express';
import { config } from '@/config';
import { logger } from '@/utils/logger';

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

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
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
    this.app.post('/push/:channel', (req: Request, res: Response) => {
      this.handlePushMessage(req, res);
    });

    this.app.post('/push', (req: Request, res: Response) => {
      this.handlePushMessage(req, res);
    });

    // Basic channel info endpoint (placeholder)
    this.app.get('/api/channels', (req: Request, res: Response) => {
      const userId = this.extractUserId(req);
      if (!this.isAdmin(userId)) {
        res
          .status(403)
          .json(this.createResponse(false, null, 'Admin access required'));
        return;
      }

      // Placeholder response
      const channels = [
        {
          id: 'example-channel',
          name: 'Example Channel',
          description: 'This is an example channel',
          isPublic: true,
          subscriberCount: 0,
          messageCount: 0,
        },
      ];

      res.json(this.createResponse(true, channels));
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

  private handlePushMessage(req: Request, res: Response): void {
    try {
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

      // For now, just acknowledge the request
      const result = {
        channelId: channel,
        status: 'received',
        timestamp: new Date().toISOString(),
        message:
          'Message push functionality will be available when services are fully integrated',
      };

      res.json(this.createResponse(true, result));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process push request', { error: errorMessage });
      res.status(500).json(this.createResponse(false, null, errorMessage));
    }
  }

  private extractUserId(req: Request): number | null {
    // Extract user ID from authorization header, query param, or body
    const authHeader = req.get('Authorization');
    const userIdParam = req.query.userId as string;
    const userIdBody = req.body?.userId;

    if (authHeader) {
      // Parse Bearer token or custom auth
      const token = authHeader.replace('Bearer ', '');
      return parseInt(token) || null;
    }

    return parseInt(userIdParam || userIdBody) || null;
  }

  private isAdmin(userId: number | null): boolean {
    if (!userId) return false;
    return config.developer.adminUserIds.includes(userId);
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

  public async start(port: number = 3000): Promise<void> {
    return new Promise(resolve => {
      this.server = this.app.listen(port, () => {
        logger.info(`HTTP server started on port ${port}`);
        resolve();
      });
    });
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
