import { BotContext, MessageLog } from '@/types';
import { logger, logMessage } from '@/utils/logger';
import { generateId, formatTimestamp } from '@/utils/helpers';

export class MessageService {
  private messageStats = {
    totalMessages: 0,
    messageTypes: new Map<string, number>(),
    userActivity: new Map<number, number>(),
  };

  public async logMessage(ctx: BotContext): Promise<void> {
    try {
      const message = ctx.message;
      if (!message || !ctx.from || !ctx.chat) return;

      const messageType = this.getMessageType(message);

      // Create message log entry
      const messageLog: MessageLog = {
        id: generateId(),
        timestamp: formatTimestamp(),
        userId: ctx.from.id,
        chatId: ctx.chat.id,
        messageId: message.message_id,
        text: 'text' in message ? message.text : undefined,
        messageType,
        metadata: {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          chatType: ctx.chat.type,
          chatTitle: 'title' in ctx.chat ? ctx.chat.title : undefined,
        },
      };

      // Log the message
      logMessage(
        messageLog.userId,
        messageLog.chatId,
        messageLog.messageId,
        messageLog.text,
        messageLog.messageType,
        messageLog.metadata
      );

      // Update statistics
      this.updateStats(messageLog);

      // Store message if needed (you can implement database storage here)
      await this.storeMessage(messageLog);
    } catch (error) {
      logger.error('Error logging message', { error: error.message });
    }
  }

  private getMessageType(message: any): string {
    if (message.text) return 'text';
    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.document) return 'document';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if (message.sticker) return 'sticker';
    if (message.location) return 'location';
    if (message.contact) return 'contact';
    return 'unknown';
  }

  private updateStats(messageLog: MessageLog): void {
    this.messageStats.totalMessages++;

    const currentCount =
      this.messageStats.messageTypes.get(messageLog.messageType) || 0;
    this.messageStats.messageTypes.set(
      messageLog.messageType,
      currentCount + 1
    );

    const userCount =
      this.messageStats.userActivity.get(messageLog.userId) || 0;
    this.messageStats.userActivity.set(messageLog.userId, userCount + 1);
  }

  private async storeMessage(messageLog: MessageLog): Promise<void> {
    // TODO: Implement database storage (DynamoDB, RDS, etc.)
    // For now, just log that we would store it
    logger.debug('Message logged', {
      id: messageLog.id,
      userId: messageLog.userId,
      messageType: messageLog.messageType,
    });
  }

  public getStats(): any {
    return {
      totalMessages: this.messageStats.totalMessages,
      messageTypes: Object.fromEntries(this.messageStats.messageTypes),
      activeUsers: this.messageStats.userActivity.size,
      topUsers: Array.from(this.messageStats.userActivity.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, messageCount: count })),
    };
  }

  public async searchMessages(query: {
    userId?: number;
    chatId?: number;
    messageType?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<MessageLog[]> {
    // TODO: Implement database search
    // For now, return empty array
    logger.info('Message search requested', query);
    return [];
  }

  public async getRecentMessages(limit: number = 50): Promise<MessageLog[]> {
    // TODO: Implement database query
    // For now, return empty array
    logger.info('Recent messages requested', { limit });
    return [];
  }
}
