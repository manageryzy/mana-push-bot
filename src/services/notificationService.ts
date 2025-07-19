import AWS from 'aws-sdk';
import { NotificationPayload } from '@/types';
import { config } from '@/config';
import { logger, logNotification } from '@/utils/logger';
import { TelegramService } from './telegramService';

export class NotificationService {
  private sqs: AWS.SQS;
  private telegramService: TelegramService;

  constructor(telegramService: TelegramService) {
    this.sqs = new AWS.SQS({ region: config.aws.region });
    this.telegramService = telegramService;
  }

  public async processNotification(
    payload: NotificationPayload
  ): Promise<boolean> {
    try {
      logger.info('Processing notification', {
        id: payload.id,
        type: payload.type,
        target: payload.target,
      });

      // Validate payload
      if (!this.validatePayload(payload)) {
        throw new Error('Invalid notification payload');
      }

      // Check if notification has expired
      if (payload.metadata?.expires) {
        const expiryDate = new Date(payload.metadata.expires);
        if (expiryDate < new Date()) {
          logger.warn('Notification expired', {
            id: payload.id,
            expires: payload.metadata.expires,
          });
          return false;
        }
      }

      // Route notification based on type
      let success = false;
      switch (payload.type) {
        case 'message':
          success = await this.sendMessage(payload);
          break;
        case 'broadcast':
          success = await this.sendBroadcast(payload);
          break;
        case 'alert':
          success = await this.sendAlert(payload);
          break;
        default:
          throw new Error(`Unknown notification type: ${payload.type}`);
      }

      logNotification(payload.target, payload.content, success);
      return success;
    } catch (error: any) {
      logger.error('Error processing notification', {
        id: payload.id,
        error: error.message,
        stack: error.stack,
      });

      logNotification(payload.target, payload.content, false, error.message);
      return false;
    }
  }

  private async sendMessage(payload: NotificationPayload): Promise<boolean> {
    const { target, content } = payload;

    if (target.chatId) {
      return await this.sendToChat(target.chatId, content);
    } else if (target.userId) {
      return await this.sendToUser(target.userId, content);
    } else if (target.channelId) {
      return await this.sendToChannel(target.channelId, content);
    }

    throw new Error('No valid target specified for message');
  }

  private async sendBroadcast(payload: NotificationPayload): Promise<boolean> {
    // TODO: Implement broadcast to multiple targets
    // This would require storing user/chat IDs and iterating through them
    logger.warn('Broadcast not yet implemented', { id: payload.id });
    return false;
  }

  private async sendAlert(payload: NotificationPayload): Promise<boolean> {
    const { target, content } = payload;

    // Format alert message
    const alertText = `🚨 *ALERT*\\n\\n${content.text || content.html || content.markdown}`;

    if (target.chatId) {
      return await this.telegramService.sendNotification(
        target.chatId,
        alertText,
        {
          parse_mode: 'MarkdownV2',
          disable_notification: payload.metadata?.priority === 'low',
        }
      );
    }

    return false;
  }

  private async sendToChat(chatId: number, content: any): Promise<boolean> {
    if (content.media) {
      return await this.sendMediaMessage(chatId, content);
    } else {
      const text = content.text || content.html || content.markdown;
      const parseMode = content.html
        ? 'HTML'
        : content.markdown
          ? 'MarkdownV2'
          : undefined;

      return await this.telegramService.sendNotification(chatId, text, {
        parse_mode: parseMode,
      });
    }
  }

  private async sendToUser(userId: number, content: any): Promise<boolean> {
    // For user notifications, we send to their private chat (same as chatId)
    return await this.sendToChat(userId, content);
  }

  private async sendToChannel(
    channelId: string,
    content: any
  ): Promise<boolean> {
    // Channel ID should start with @ or be a numeric ID
    const chatId = channelId.startsWith('@') ? channelId : parseInt(channelId);
    return await this.sendToChat(chatId as number, content);
  }

  private async sendMediaMessage(
    chatId: number,
    content: any
  ): Promise<boolean> {
    const { media } = content;

    switch (media.type) {
      case 'photo':
        return await this.telegramService.sendPhoto(
          chatId,
          media.url,
          media.caption
        );
      case 'video':
        // TODO: Implement video sending
        logger.warn('Video sending not yet implemented');
        return false;
      case 'document':
        // TODO: Implement document sending
        logger.warn('Document sending not yet implemented');
        return false;
      case 'audio':
        // TODO: Implement audio sending
        logger.warn('Audio sending not yet implemented');
        return false;
      default:
        throw new Error(`Unsupported media type: ${media.type}`);
    }
  }

  public async queueNotification(
    payload: NotificationPayload
  ): Promise<boolean> {
    try {
      const params: AWS.SQS.SendMessageRequest = {
        QueueUrl: config.aws.notificationQueueUrl,
        MessageBody: JSON.stringify(payload),
        MessageAttributes: {
          notificationType: {
            DataType: 'String',
            StringValue: payload.type,
          },
          priority: {
            DataType: 'String',
            StringValue: payload.metadata?.priority || 'normal',
          },
        },
      };

      // Add delay for scheduled notifications
      if (payload.metadata?.scheduled) {
        const scheduledTime = new Date(payload.metadata.scheduled);
        const now = new Date();
        const delaySeconds = Math.max(
          0,
          Math.floor((scheduledTime.getTime() - now.getTime()) / 1000)
        );

        if (delaySeconds > 0 && delaySeconds <= 900) {
          // SQS max delay is 15 minutes
          params.DelaySeconds = delaySeconds;
        }
      }

      await this.sqs.sendMessage(params).promise();

      logger.info('Notification queued', {
        id: payload.id,
        type: payload.type,
        queueUrl: config.aws.notificationQueueUrl,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to queue notification', {
        id: payload.id,
        error: error.message,
      });
      return false;
    }
  }

  private validatePayload(payload: NotificationPayload): boolean {
    if (!payload.id || !payload.type || !payload.target || !payload.content) {
      return false;
    }

    // Validate target
    const hasValidTarget = !!(
      payload.target.chatId ||
      payload.target.userId ||
      payload.target.channelId
    );

    if (!hasValidTarget) {
      return false;
    }

    // Validate content
    const hasValidContent = !!(
      payload.content.text ||
      payload.content.html ||
      payload.content.markdown ||
      payload.content.media
    );

    return hasValidContent;
  }

  public async getQueueAttributes(): Promise<any> {
    try {
      const params = {
        QueueUrl: config.aws.notificationQueueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
        ],
      };

      const result = await this.sqs.getQueueAttributes(params).promise();
      return result.Attributes;
    } catch (error: any) {
      logger.error('Failed to get queue attributes', { error: error.message });
      return null;
    }
  }
}
