import { logger } from '@/utils/logger';
import { TelegramService } from '@/services/telegramService';
import { ChannelService } from '@/services/channelService';
import { ConfigService } from '@/services/configService';
import { escapeMarkdownV2, bold, italic } from '@/utils/telegramFormatting';

export interface PushMessageData {
  channelId: string;
  message: string;
  format?: 'text' | 'markdown' | 'html';
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface PushResult {
  success: boolean;
  messageId?: number;
  error?: string;
  channelId: string;
  timestamp: string;
  recipientCount: number;
}

export interface PushStats {
  totalMessages: number;
  successfulPushes: number;
  failedPushes: number;
  channelsActive: number;
  subscribersTotal: number;
  averageResponseTime: number;
  lastPushTime?: string;
  topChannels: Array<{
    channelId: string;
    name: string;
    messageCount: number;
    subscriberCount: number;
  }>;
}

export class MessagePushService {
  private telegramService: TelegramService;
  private channelService: ChannelService;
  private configService: ConfigService;
  private messageQueue: PushMessageData[] = [];
  private processing = false;

  constructor(
    telegramService: TelegramService,
    channelService: ChannelService,
    configService: ConfigService
  ) {
    this.telegramService = telegramService;
    this.channelService = channelService;
    this.configService = configService;
  }

  async pushToChannel(data: PushMessageData): Promise<PushResult> {
    const startTime = Date.now();

    try {
      logger.info('Pushing message to channel', {
        channelId: data.channelId,
        format: data.format,
        priority: data.priority,
      });

      // Validate channel exists
      const channel = await this.channelService.getChannel(data.channelId);
      if (!channel) {
        return {
          success: false,
          error: 'Channel not found',
          channelId: data.channelId,
          timestamp: new Date().toISOString(),
          recipientCount: 0,
        };
      }

      // Get channel subscribers
      const subscribers = await this.channelService.getChannelSubscribers(
        data.channelId
      );

      logger.info('Message push subscribers debug', {
        channelId: data.channelId,
        subscriberCount: subscribers.length,
        subscriberDetails: subscribers.map(s => ({
          userId: s.userId,
          chatId: s.chatId,
        })),
      });

      // Format message based on specified format
      const formattedMessage = this.formatMessage(
        data.message,
        data.format || 'markdown',
        data
      );

      // Send to channel chat
      const bot = this.telegramService.getBot();
      let messageId: number | undefined;

      try {
        const sendOptions: any = {
          link_preview_options: { is_disabled: true },
        };

        const parseMode = this.getParseMode(data.format || 'markdown');
        if (parseMode) {
          sendOptions.parse_mode = parseMode;
        }

        const sentMessage = await bot.telegram.sendMessage(
          channel.chatId,
          formattedMessage,
          sendOptions
        );
        messageId = sentMessage.message_id;
      } catch (error) {
        logger.error('Failed to send message to channel chat', {
          channelId: data.channelId,
          chatId: channel.chatId,
          error,
        });
        throw error;
      }

      // Send to individual subscribers if needed
      let successCount = 1; // Channel message sent successfully
      let failCount = 0;

      if (subscribers.length > 0) {
        const subscriberResults = await Promise.allSettled(
          subscribers.map(async subscription => {
            try {
              logger.info('Attempting to send message to subscriber', {
                userId: subscription.userId,
                chatId: subscription.chatId,
                channelId: data.channelId,
              });

              const subscriberOptions: any = {
                link_preview_options: { is_disabled: true },
              };

              const parseMode = this.getParseMode(data.format || 'markdown');
              if (parseMode) {
                subscriberOptions.parse_mode = parseMode;
              }

              await bot.telegram.sendMessage(
                subscription.chatId,
                formattedMessage,
                subscriberOptions
              );

              logger.info('Successfully sent message to subscriber', {
                userId: subscription.userId,
                chatId: subscription.chatId,
                channelId: data.channelId,
              });

              return {
                success: true,
                userId: subscription.userId,
                chatId: subscription.chatId,
              };
            } catch (error) {
              logger.error('Failed to send message to subscriber', {
                channelId: data.channelId,
                userId: subscription.userId,
                chatId: subscription.chatId,
                error: error instanceof Error ? error.message : error,
              });
              return {
                success: false,
                userId: subscription.userId,
                chatId: subscription.chatId,
                error,
              };
            }
          })
        );

        successCount += subscriberResults.filter(
          r => r.status === 'fulfilled' && r.value.success
        ).length;

        failCount = subscriberResults.filter(
          r =>
            r.status === 'rejected' ||
            (r.status === 'fulfilled' && !r.value.success)
        ).length;
      }

      // Update statistics
      await this.updatePushStats(data, Date.now() - startTime, true);
      await this.channelService.incrementMessageCount(data.channelId);

      const result: PushResult = {
        success: true,
        messageId,
        channelId: data.channelId,
        timestamp: new Date().toISOString(),
        recipientCount: successCount,
      };

      logger.info('Message pushed successfully', {
        channelId: data.channelId,
        recipientCount: successCount,
        failedCount: failCount,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to push message', {
        channelId: data.channelId,
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      await this.updatePushStats(data, Date.now() - startTime, false);

      return {
        success: false,
        error: errorMessage,
        channelId: data.channelId,
        timestamp: new Date().toISOString(),
        recipientCount: 0,
      };
    }
  }

  async queueMessage(data: PushMessageData): Promise<void> {
    this.messageQueue.push(data);
    logger.info('Message queued', {
      channelId: data.channelId,
      queueLength: this.messageQueue.length,
    });

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue(): Promise<void> {
    if (this.processing || this.messageQueue.length === 0) {
      return;
    }

    this.processing = true;
    logger.info('Starting queue processing', {
      queueLength: this.messageQueue.length,
    });

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        try {
          await this.pushToChannel(message);
          // Add delay between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.error('Queue processing error', { message, error });
        }
      }
    }

    this.processing = false;
    logger.info('Queue processing completed');
  }

  async getStats(): Promise<PushStats> {
    try {
      const configStats = await this.configService.getStats();
      const channels = await this.channelService.getAllChannels();

      const totalSubscribers = channels.reduce(
        (sum, channel) => sum + channel.subscriberCount,
        0
      );
      const topChannels = channels
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, 10)
        .map(channel => ({
          channelId: channel.id,
          name: channel.name,
          messageCount: channel.messageCount,
          subscriberCount: channel.subscriberCount,
        }));

      return {
        totalMessages: configStats.totalMessages || 0,
        successfulPushes: configStats.successfulPushes || 0,
        failedPushes: configStats.failedPushes || 0,
        channelsActive: channels.length,
        subscribersTotal: totalSubscribers,
        averageResponseTime: configStats.averageResponseTime || 0,
        lastPushTime: configStats.lastPushTime,
        topChannels,
      };
    } catch (error) {
      logger.error('Failed to get push stats', { error });
      return {
        totalMessages: 0,
        successfulPushes: 0,
        failedPushes: 0,
        channelsActive: 0,
        subscribersTotal: 0,
        averageResponseTime: 0,
        topChannels: [],
      };
    }
  }

  private formatMessage(
    message: string,
    format: string,
    data: PushMessageData
  ): string {
    const timestamp = new Date(data.timestamp).toLocaleString();
    const priority = data.priority || 'normal';

    let formattedMessage = message;

    if (format === 'markdown') {
      // Add priority indicator for high priority messages
      if (priority === 'high') {
        formattedMessage = `🚨 ${bold('HIGH PRIORITY')} 🚨\n\n${formattedMessage}`;
      } else if (priority === 'low') {
        formattedMessage = `📋 ${italic('Info')}: ${formattedMessage}`;
      }

      // Add metadata if present
      if (data.metadata && Object.keys(data.metadata).length > 0) {
        const metadataLines = Object.entries(data.metadata)
          .map(
            ([key, value]) => `${bold(key)}: ${escapeMarkdownV2(String(value))}`
          )
          .join('\n');
        formattedMessage += `\n\n${metadataLines}`;
      }

      // Add timestamp footer
      formattedMessage += `\n\n${italic(`Sent: ${escapeMarkdownV2(timestamp)}`)}`;
    } else if (format === 'html') {
      if (priority === 'high') {
        formattedMessage = `🚨 <b>HIGH PRIORITY</b> 🚨\n\n${formattedMessage}`;
      } else if (priority === 'low') {
        formattedMessage = `📋 <i>Info</i>: ${formattedMessage}`;
      }

      if (data.metadata && Object.keys(data.metadata).length > 0) {
        const metadataLines = Object.entries(data.metadata)
          .map(([key, value]) => `<b>${key}</b>: ${String(value)}`)
          .join('\n');
        formattedMessage += `\n\n${metadataLines}`;
      }

      formattedMessage += `\n\n<i>Sent: ${timestamp}</i>`;
    } else {
      // Plain text format
      if (priority === 'high') {
        formattedMessage = `🚨 HIGH PRIORITY 🚨\n\n${formattedMessage}`;
      } else if (priority === 'low') {
        formattedMessage = `📋 Info: ${formattedMessage}`;
      }

      if (data.metadata && Object.keys(data.metadata).length > 0) {
        const metadataLines = Object.entries(data.metadata)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join('\n');
        formattedMessage += `\n\n${metadataLines}`;
      }

      formattedMessage += `\n\nSent: ${timestamp}`;
    }

    return formattedMessage;
  }

  private getParseMode(format: string): 'MarkdownV2' | 'HTML' | undefined {
    switch (format) {
      case 'markdown':
        return 'MarkdownV2';
      case 'html':
        return 'HTML';
      default:
        return undefined;
    }
  }

  private async updatePushStats(
    data: PushMessageData,
    duration: number,
    success: boolean
  ): Promise<void> {
    try {
      await this.configService.incrementStat('totalMessages', 1);

      if (success) {
        await this.configService.incrementStat('successfulPushes', 1);
      } else {
        await this.configService.incrementStat('failedPushes', 1);
      }

      // Update average response time
      const stats = await this.configService.getStats();
      const currentAvg = stats.averageResponseTime || 0;
      const totalMessages = stats.totalMessages || 1;
      const newAvg =
        (currentAvg * (totalMessages - 1) + duration) / totalMessages;

      await this.configService.updateConfig({
        stats: {
          ...stats,
          averageResponseTime: Math.round(newAvg),
          lastPushTime: data.timestamp,
        },
      });
    } catch (error) {
      logger.error('Failed to update push stats', { error });
    }
  }
}
