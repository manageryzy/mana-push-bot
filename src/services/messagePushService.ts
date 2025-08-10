import { logger } from '@/utils/logger';
import { TelegramService } from '@/services/telegramService';
import { ChannelService } from '@/services/channelService';
import { ConfigService } from '@/services/configService';
import {
  escapeMarkdownV2,
  bold,
  italic,
  splitMessage,
  SAFE_MESSAGE_LIMIT,
} from '@/utils/telegramFormatting';
import { decodeUnicodeEscapes, escapeHtml } from '@/utils/helpers';

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
  messageIds?: number[];
  error?: string;
  channelId: string;
  timestamp: string;
  recipientCount: number;
  numberOfParts?: number;
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
      const formattedMessages = this.formatMessage(
        data.message,
        data.format || 'markdown',
        data
      );

      // Send to channel chat
      const bot = this.telegramService.getBot();
      const messageIds: number[] = [];

      const sendOptions: any = {
        link_preview_options: { is_disabled: true },
      };

      const parseMode = this.getParseMode(data.format || 'markdown');
      if (parseMode) {
        sendOptions.parse_mode = parseMode;
      }

      try {
        // Debug logging before sending messages
        logger.debug('About to send Telegram messages', {
          channelId: data.channelId,
          chatId: channel.chatId,
          numberOfParts: formattedMessages.length,
          totalLength: formattedMessages.reduce(
            (sum, msg) => sum + msg.length,
            0
          ),
          parseMode: sendOptions.parse_mode,
        });

        // Send each message part with delay to avoid rate limiting
        for (let i = 0; i < formattedMessages.length; i++) {
          const messagePart = formattedMessages[i];

          logger.debug('Sending message part', {
            channelId: data.channelId,
            partNumber: i + 1,
            totalParts: formattedMessages.length,
            partLength: messagePart.length,
            partPreview: messagePart.substring(0, 200),
          });

          const sentMessage = await bot.telegram.sendMessage(
            channel.chatId,
            messagePart,
            sendOptions
          );
          messageIds.push(sentMessage.message_id);

          // Add small delay between parts to avoid rate limiting
          if (i < formattedMessages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Enhanced error logging for MarkdownV2 issues
        if (
          errorMessage.includes("can't parse entities") ||
          errorMessage.includes('Bad Request')
        ) {
          logger.error('MarkdownV2 parsing error in channel message', {
            channelId: data.channelId,
            chatId: channel.chatId,
            error: errorMessage,
            parseMode: sendOptions.parse_mode,
            numberOfParts: formattedMessages.length,
            originalMessage: data.message,
          });
        }

        logger.error('Failed to send message to channel chat', {
          channelId: data.channelId,
          chatId: channel.chatId,
          error,
        });
        throw error;
      }

      // Send to individual subscribers if needed
      let successCount = formattedMessages.length; // Channel messages sent successfully
      let failCount = 0;

      if (subscribers.length > 0) {
        const subscriberResults = await Promise.allSettled(
          subscribers.map(async subscription => {
            const subscriberOptions: any = {
              link_preview_options: { is_disabled: true },
            };

            const parseMode = this.getParseMode(data.format || 'markdown');
            if (parseMode) {
              subscriberOptions.parse_mode = parseMode;
            }

            try {
              logger.info('Attempting to send message parts to subscriber', {
                userId: subscription.userId,
                chatId: subscription.chatId,
                channelId: data.channelId,
                numberOfParts: formattedMessages.length,
              });

              // Send each message part to subscriber
              for (let i = 0; i < formattedMessages.length; i++) {
                const messagePart = formattedMessages[i];

                await bot.telegram.sendMessage(
                  subscription.chatId,
                  messagePart,
                  subscriberOptions
                );

                // Add small delay between parts for subscribers too
                if (i < formattedMessages.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              }

              logger.info('Successfully sent all message parts to subscriber', {
                userId: subscription.userId,
                chatId: subscription.chatId,
                channelId: data.channelId,
                numberOfParts: formattedMessages.length,
              });

              return {
                success: true,
                userId: subscription.userId,
                chatId: subscription.chatId,
              };
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';

              // Enhanced error logging for MarkdownV2 issues
              if (
                errorMessage.includes("can't parse entities") ||
                errorMessage.includes('Bad Request')
              ) {
                logger.error('MarkdownV2 parsing error in subscriber message', {
                  channelId: data.channelId,
                  userId: subscription.userId,
                  chatId: subscription.chatId,
                  error: errorMessage,
                  parseMode: subscriberOptions.parse_mode,
                  numberOfParts: formattedMessages.length,
                  originalMessage: data.message,
                });
              }

              logger.error('Failed to send message parts to subscriber', {
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

        const subscriberSuccessCount = subscriberResults.filter(
          r => r.status === 'fulfilled' && r.value.success
        ).length;

        successCount += subscriberSuccessCount * formattedMessages.length;

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
        messageId: messageIds[0], // Return the first message ID
        messageIds: messageIds, // Return all message IDs
        channelId: data.channelId,
        timestamp: new Date().toISOString(),
        recipientCount: successCount,
        numberOfParts: formattedMessages.length,
      };

      logger.info('Message pushed successfully', {
        channelId: data.channelId,
        recipientCount: successCount,
        failedCount: failCount,
        numberOfParts: formattedMessages.length,
        messageIds: messageIds,
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
  ): string[] {
    const timestamp = new Date(data.timestamp).toLocaleString();
    const priority = data.priority || 'normal';

    // First, decode any Unicode escape sequences to get proper UTF-8 characters
    let formattedMessage = decodeUnicodeEscapes(message);
    let header = '';
    let footer = '';

    if (format === 'markdown') {
      // Escape the main message for MarkdownV2
      formattedMessage = escapeMarkdownV2(formattedMessage);

      // Add priority indicator for high priority messages
      if (priority === 'high') {
        header = `🚨 ${bold('HIGH PRIORITY')} 🚨\n\n`;
      } else if (priority === 'low') {
        header = `📋 ${italic('Info')}: `;
      }

      // Debug logging for message formatting
      logger.debug('Formatting message with MarkdownV2', {
        originalLength: message.length,
        decodedLength: formattedMessage.length,
        priority,
        hasMetadata: data.metadata && Object.keys(data.metadata).length > 0,
        hasUnicodeEscapes: message.includes('\\u'),
        originalPreview: message.substring(0, 100),
        decodedPreview: formattedMessage.substring(0, 100),
      });

      // Add metadata if present
      let metadataSection = '';
      if (data.metadata && Object.keys(data.metadata).length > 0) {
        const metadataLines = Object.entries(data.metadata)
          .map(
            ([key, value]) => `${bold(key)}: ${escapeMarkdownV2(String(value))}`
          )
          .join('\n');
        metadataSection = `\n\n${metadataLines}`;
      }

      // Add separator line and timestamp footer
      footer = `${metadataSection}\n\n${'━'.repeat(20)}\n${italic(`Sent: ${escapeMarkdownV2(timestamp)}`)}`;
    } else if (format === 'html') {
      // Debug logging for HTML message formatting
      logger.debug('Formatting message with HTML', {
        originalLength: message.length,
        decodedLength: formattedMessage.length,
        priority,
        hasMetadata: data.metadata && Object.keys(data.metadata).length > 0,
        hasUnicodeEscapes: message.includes('\\u'),
        originalPreview: message.substring(0, 100),
        decodedPreview: formattedMessage.substring(0, 100),
      });

      // Escape HTML in the main message content
      formattedMessage = escapeHtml(formattedMessage);

      if (priority === 'high') {
        header = `🚨 <b>HIGH PRIORITY</b> 🚨\n\n`;
      } else if (priority === 'low') {
        header = `📋 <i>Info</i>: `;
      }

      let metadataSection = '';
      if (data.metadata && Object.keys(data.metadata).length > 0) {
        const metadataLines = Object.entries(data.metadata)
          .map(([key, value]) => {
            const decodedKey = decodeUnicodeEscapes(String(key));
            const decodedValue = decodeUnicodeEscapes(String(value));
            return `<b>${escapeHtml(decodedKey)}</b>: ${escapeHtml(decodedValue)}`;
          })
          .join('\n');
        metadataSection = `\n\n${metadataLines}`;
      }

      footer = `${metadataSection}\n\n<i>Sent: ${timestamp}</i>`;
    } else {
      // Plain text format - formattedMessage already has Unicode decoded
      if (priority === 'high') {
        header = `🚨 HIGH PRIORITY 🚨\n\n`;
      } else if (priority === 'low') {
        header = `📋 Info: `;
      }

      let metadataSection = '';
      if (data.metadata && Object.keys(data.metadata).length > 0) {
        const metadataLines = Object.entries(data.metadata)
          .map(([key, value]) => {
            const decodedKey = decodeUnicodeEscapes(String(key));
            const decodedValue = decodeUnicodeEscapes(String(value));
            return `${decodedKey}: ${decodedValue}`;
          })
          .join('\n');
        metadataSection = `\n\n${metadataLines}`;
      }

      footer = `${metadataSection}\n\nSent: ${timestamp}`;
    }

    // Combine the parts
    const fullMessage = header + formattedMessage + footer;

    // Split message if it exceeds the limit
    const messageParts = this.splitMessageSafely(fullMessage, format, {
      header,
      footer,
      coreMessage: formattedMessage,
    });

    logger.debug('Message splitting result', {
      originalLength: fullMessage.length,
      numberOfParts: messageParts.length,
      format,
      channelId: data.channelId,
    });

    return messageParts;
  }

  /**
   * Safely split messages while preserving formatting and structure
   */
  private splitMessageSafely(
    fullMessage: string,
    format: string,
    parts: { header: string; footer: string; coreMessage: string }
  ): string[] {
    // If message fits within limit, return as single message
    if (fullMessage.length <= SAFE_MESSAGE_LIMIT) {
      return [fullMessage];
    }

    const { header, footer, coreMessage } = parts;
    const headerLength = header.length;
    const footerLength = footer.length;

    // Calculate available space for core content per message part
    // Reserve space for continuation indicators (approx 100 chars)
    const continuationOverhead = 100;
    const availableSpacePerPart =
      SAFE_MESSAGE_LIMIT - headerLength - footerLength - continuationOverhead;

    if (availableSpacePerPart <= 0) {
      logger.warn('Header and footer too long for message splitting', {
        headerLength,
        footerLength,
        availableSpace: availableSpacePerPart,
      });
      // Fallback: split the full message without trying to preserve structure
      return splitMessage(fullMessage, SAFE_MESSAGE_LIMIT);
    }

    // Split the core message content
    const coreMessageParts = splitMessage(coreMessage, availableSpacePerPart);

    // Reassemble with headers/footers and continuation indicators
    const finalParts = coreMessageParts.map((part, index) => {
      const isFirst = index === 0;
      const isLast = index === coreMessageParts.length - 1;
      const partNumber = index + 1;
      const totalParts = coreMessageParts.length;

      let assembledPart = '';

      // Add header for first part or continuation indicator for subsequent parts
      if (isFirst) {
        assembledPart += header;
      } else {
        const continuationHeader = this.formatContinuationHeader(
          partNumber,
          totalParts,
          format,
          true
        );
        assembledPart += continuationHeader + '\n\n';
      }

      // Add core content
      assembledPart += part;

      // Add footer for last part or continuation indicator for non-last parts
      if (isLast) {
        assembledPart += footer;
      } else {
        const continuationFooter = this.formatContinuationFooter(
          partNumber,
          totalParts,
          format
        );
        assembledPart += '\n\n' + continuationFooter;
      }

      return assembledPart;
    });

    return finalParts;
  }

  /**
   * Format continuation header based on message format
   */
  private formatContinuationHeader(
    partNumber: number,
    totalParts: number,
    format: string,
    isFromPrevious: boolean = true
  ): string {
    const text = `📄 Part ${partNumber}/${totalParts}${isFromPrevious ? ' (continued from above)' : ''}`;

    switch (format) {
      case 'markdown':
        return italic(escapeMarkdownV2(text));
      case 'html':
        return `<i>${text}</i>`;
      default:
        return text;
    }
  }

  /**
   * Format continuation footer based on message format
   */
  private formatContinuationFooter(
    partNumber: number,
    totalParts: number,
    format: string
  ): string {
    const text = `📄 Continued in part ${partNumber + 1}/${totalParts}...`;

    switch (format) {
      case 'markdown':
        return italic(escapeMarkdownV2(text));
      case 'html':
        return `<i>${text}</i>`;
      default:
        return text;
    }
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
