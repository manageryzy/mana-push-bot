import express, { Request, Response } from 'express';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { AuthService } from '@/utils/auth';
import { ChannelService } from '@/services/channelService';
import { ConfigService } from '@/services/configService';
import { TelegramService } from '@/services/telegramService';
import { MessagePushService } from '@/services/messagePushService';
import { templateEngine } from '@/utils/templateEngine';
import {
  DEFAULT_ALERTMANAGER_TEMPLATE,
  AlertManagerTemplateContext,
} from '@/templates/alertManagerTemplate';

export interface PushMessageRequest {
  channel?: string;
  message: string;
  format?: 'text' | 'markdown' | 'html';
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, any>;
}

// AlertManager webhook interfaces
export interface AlertManagerAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL?: string;
  fingerprint?: string;
}

export interface AlertManagerWebhook {
  receiver: string;
  status: 'firing' | 'resolved';
  alerts: AlertManagerAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  version: string;
  groupKey: string;
  truncatedAlerts?: number;
  template?: string; // Optional custom template
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

    // AlertManager webhook endpoint
    this.app.post(
      '/webhook/alertmanager/:channel?',
      async (req: Request, res: Response) => {
        await this.handleAlertManagerWebhook(req, res);
      }
    );

    // Generic webhook endpoint (alias for AlertManager)
    this.app.post('/webhook/:channel?', async (req: Request, res: Response) => {
      await this.handleAlertManagerWebhook(req, res);
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
        const alertManagerUrl = `${config.app.baseUrl}/webhook/alertmanager/${channelId}`;

        res.json(
          this.createResponse(true, {
            channelId,
            pushUrl,
            alertManagerUrl,
            documentation: {
              standard: {
                method: 'POST',
                url: pushUrl,
                contentType: 'application/json',
                body: {
                  message: 'Your message here',
                  format:
                    'markdown | text | html (optional, default: markdown)',
                  priority: 'low | normal | high (optional, default: normal)',
                  metadata: 'Additional data (optional)',
                },
              },
              alertmanager: {
                method: 'POST',
                url: alertManagerUrl,
                contentType: 'application/json',
                description: 'Accepts AlertManager webhook format directly',
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

  private async handleAlertManagerWebhook(
    req: Request,
    res: Response
  ): Promise<void> {
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

      const channel = req.params.channel;
      if (!channel) {
        res
          .status(400)
          .json(
            this.createResponse(false, null, 'Channel is required in URL path')
          );
        return;
      }

      // Try to parse as AlertManager webhook format
      const alertManagerPayload = req.body as AlertManagerWebhook;

      // Basic validation for AlertManager format
      if (
        !alertManagerPayload.alerts ||
        !Array.isArray(alertManagerPayload.alerts)
      ) {
        res
          .status(400)
          .json(
            this.createResponse(
              false,
              null,
              'Invalid AlertManager webhook format: missing alerts array'
            )
          );
        return;
      }

      logger.info('AlertManager webhook received', {
        channel,
        status: alertManagerPayload.status,
        alertCount: alertManagerPayload.alerts.length,
        receiver: alertManagerPayload.receiver,
        truncatedAlerts: alertManagerPayload.truncatedAlerts || 0,
      });
      for (const alert of alertManagerPayload.alerts) {
        logger.info('Alert', {
          alert,
        });
      }

      // Transform AlertManager payload to message format
      const message = this.formatAlertManagerMessage(
        alertManagerPayload,
        alertManagerPayload.template
      );
      const priority = this.getAlertPriority(alertManagerPayload);

      // Log the AlertManager webhook request
      logger.info('AlertManager webhook received', {
        channel,
        status: alertManagerPayload.status,
        alertCount: alertManagerPayload.alerts.length,
        receiver: alertManagerPayload.receiver,
        truncatedAlerts: alertManagerPayload.truncatedAlerts || 0,
      });

      // Use MessagePushService to actually send the message
      const pushData = {
        channelId: channel,
        message,
        format: 'html' as const,
        priority,
        // metadata: {
        //   source: 'alertmanager',
        //   receiver: alertManagerPayload.receiver,
        //   status: alertManagerPayload.status,
        //   groupKey: alertManagerPayload.groupKey,
        //   alertCount: alertManagerPayload.alerts.length,
        //   externalURL: alertManagerPayload.externalURL,
        //   version: alertManagerPayload.version,
        //   groupLabels: JSON.stringify(alertManagerPayload.groupLabels),
        //   commonLabels: JSON.stringify(alertManagerPayload.commonLabels),
        // },
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
              alertManager: {
                status: alertManagerPayload.status,
                alertCount: alertManagerPayload.alerts.length,
                receiver: alertManagerPayload.receiver,
              },
            })
          );
        } else {
          res
            .status(500)
            .json(
              this.createResponse(
                false,
                null,
                result.error || 'Failed to send AlertManager notification'
              )
            );
        }
      } catch (pushError) {
        const pushErrorMessage =
          pushError instanceof Error ? pushError.message : 'Unknown push error';
        logger.error('AlertManager webhook push operation failed', {
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
      logger.error('Failed to process AlertManager webhook request', {
        error: errorMessage,
        body: req.body,
      });
      res.status(500).json(this.createResponse(false, null, errorMessage));
    }
  }

  private formatAlertManagerMessage(
    payload: AlertManagerWebhook,
    template?: string
  ): string {
    const { status, alerts, receiver, commonLabels, externalURL } = payload;

    // Filter out internal labels (starting with '__') and prepare common labels
    const filteredCommonLabels = Object.entries(commonLabels)
      .filter(([key]) => !key.startsWith('__'))
      .map(([key, value]) => ({ key, value }));

    // Get common label keys for filtering individual alert labels
    const commonLabelKeys = new Set(filteredCommonLabels.map(({ key }) => key));

    // Process alerts and add computed properties
    const processedAlerts = alerts.map(alert => {
      // Add unique labels (excluding alertname, internal labels, and common labels)
      const uniqueLabels = Object.entries(alert.labels)
        .filter(
          ([key]) =>
            key !== 'alertname' &&
            !key.startsWith('__') &&
            !commonLabelKeys.has(key)
        )
        .map(([key, value]) => ({ key, value }));

      // Filter annotations (exclude internal ones)
      const filteredAnnotations = Object.entries(alert.annotations)
        .filter(([key]) => !key.startsWith('__'))
        .map(([key, value]) => ({ key, value }));

      const alertName = alert.labels.alertname || 'Unknown';
      const showResolvedTime =
        alert.status === 'resolved' && alert.endsAt !== '0001-01-01T00:00:00Z';

      return {
        ...alert,
        alertName,
        showResolvedTime,
        uniqueLabels: uniqueLabels.length > 0 ? uniqueLabels : undefined,
        filteredAnnotations:
          filteredAnnotations.length > 0 ? filteredAnnotations : undefined,
      };
    });

    // Check if we should show external URL
    const showExternalURL = Boolean(
      externalURL && !alerts.some(alert => alert.generatorURL === externalURL)
    );

    // Create template context for Handlebars
    const context: AlertManagerTemplateContext = {
      status,
      receiver,
      alerts: processedAlerts,
      commonLabels,
      filteredCommonLabels:
        filteredCommonLabels.length > 0 ? filteredCommonLabels : undefined,
      externalURL,
      showExternalURL,
    };

    // Use provided template or default
    const templateToUse = template || DEFAULT_ALERTMANAGER_TEMPLATE;

    try {
      const result = templateEngine.render(templateToUse, context);
      logger.info('AlertManager template rendered successfully', {
        alertCount: alerts.length,
        receiver,
        status,
        templateLength: templateToUse.length,
        resultLength: result.length,
      });
      return result;
    } catch (error) {
      logger.error('Failed to render AlertManager template', {
        error: error instanceof Error ? error.message : 'Unknown error',
        template: templateToUse.substring(0, 100) + '...',
        context: JSON.stringify(context, null, 2),
      });

      // Fallback to a simple message if template rendering fails
      return `🚨 Alert: ${alerts.length} alert(s) from ${receiver}\n\nTemplate rendering failed. Please check template syntax.`;
    }
  }

  private getAlertPriority(
    payload: AlertManagerWebhook
  ): 'low' | 'normal' | 'high' {
    // Determine priority based on alert status and labels
    if (payload.status === 'resolved') {
      return 'low';
    }

    // Check for severity labels in any alert
    const hasCritical = payload.alerts.some(
      alert =>
        alert.labels.severity === 'critical' ||
        alert.labels.priority === 'critical'
    );

    const hasWarning = payload.alerts.some(
      alert =>
        alert.labels.severity === 'warning' ||
        alert.labels.priority === 'warning'
    );

    if (hasCritical) {
      return 'high';
    } else if (hasWarning) {
      return 'normal';
    }

    return 'normal';
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
