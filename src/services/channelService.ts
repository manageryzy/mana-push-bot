import { logger } from '@/utils/logger';
import { ConfigService } from '@/services/configService';
import { TelegramService } from '@/services/telegramService';

export interface Channel {
  id: string;
  name: string;
  description?: string;
  chatId: number;
  isPublic: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  subscriberCount: number;
  messageCount: number;
}

export interface ChannelSubscription {
  userId: number;
  chatId: number;
  channelId: string;
  subscribedAt: string;
  isActive: boolean;
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
  chatId: number;
  isPublic: boolean;
  createdBy: number;
}

export interface UpdateChannelRequest {
  name?: string;
  description?: string;
  chatId?: number;
  isPublic?: boolean;
}

export class ChannelService {
  private configService: ConfigService;
  private telegramService: TelegramService;

  constructor(configService: ConfigService, telegramService: TelegramService) {
    this.configService = configService;
    this.telegramService = telegramService;
  }

  async getAllChannels(): Promise<Channel[]> {
    try {
      const config = await this.configService.getConfig();
      return config.channels || [];
    } catch (error) {
      logger.error('Failed to get channels', { error });
      return [];
    }
  }

  async getChannel(channelId: string): Promise<Channel | null> {
    try {
      const channels = await this.getAllChannels();
      return channels.find(c => c.id === channelId) || null;
    } catch (error) {
      logger.error('Failed to get channel', { channelId, error });
      return null;
    }
  }

  async getPublicChannels(): Promise<Channel[]> {
    try {
      const channels = await this.getAllChannels();
      return channels.filter(c => c.isPublic);
    } catch (error) {
      logger.error('Failed to get public channels', { error });
      return [];
    }
  }

  async createChannel(request: CreateChannelRequest): Promise<Channel> {
    try {
      const config = await this.configService.getConfig();
      const channels = config.channels || [];

      // Check if channel name already exists
      const existingChannel = channels.find(c => c.name === request.name);
      if (existingChannel) {
        throw new Error(`Channel with name '${request.name}' already exists`);
      }

      // Validate chat ID exists
      try {
        await this.telegramService.getBot().telegram.getChat(request.chatId);
      } catch (error) {
        throw new Error(`Invalid chat ID: ${request.chatId}`);
      }

      const now = new Date().toISOString();
      const newChannel: Channel = {
        id: this.generateChannelId(request.name),
        name: request.name,
        ...(request.description ? { description: request.description } : {}),
        chatId: request.chatId,
        isPublic: request.isPublic,
        createdBy: request.createdBy,
        createdAt: now,
        updatedAt: now,
        subscriberCount: 0,
        messageCount: 0,
      };

      channels.push(newChannel);
      await this.configService.updateConfig({ channels });

      logger.info('Channel created', {
        channelId: newChannel.id,
        name: newChannel.name,
        createdBy: request.createdBy,
      });

      return newChannel;
    } catch (error) {
      logger.error('Failed to create channel', { request, error });
      throw error;
    }
  }

  async updateChannel(
    channelId: string,
    updates: UpdateChannelRequest
  ): Promise<Channel | null> {
    try {
      const config = await this.configService.getConfig();
      const channels = config.channels || [];

      const channelIndex = channels.findIndex(c => c.id === channelId);
      if (channelIndex === -1) {
        return null;
      }

      const channel = channels[channelIndex];

      // Validate chat ID if provided
      if (updates.chatId && updates.chatId !== channel.chatId) {
        try {
          await this.telegramService.getBot().telegram.getChat(updates.chatId);
        } catch (error) {
          throw new Error(`Invalid chat ID: ${updates.chatId}`);
        }
      }

      // Check if name is changing and not conflicting
      if (updates.name && updates.name !== channel.name) {
        const existingChannel = channels.find(
          c => c.name === updates.name && c.id !== channelId
        );
        if (existingChannel) {
          throw new Error(`Channel with name '${updates.name}' already exists`);
        }
      }

      const updatedChannel: Channel = {
        ...channel,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      channels[channelIndex] = updatedChannel;
      await this.configService.updateConfig({ channels });

      logger.info('Channel updated', { channelId, updates });
      return updatedChannel;
    } catch (error) {
      logger.error('Failed to update channel', { channelId, updates, error });
      throw error;
    }
  }

  async deleteChannel(channelId: string): Promise<boolean> {
    try {
      const config = await this.configService.getConfig();
      const channels = config.channels || [];
      const subscriptions = config.channelSubscriptions || [];

      const channelIndex = channels.findIndex(c => c.id === channelId);
      if (channelIndex === -1) {
        return false;
      }

      // Remove channel
      channels.splice(channelIndex, 1);

      // Remove all subscriptions to this channel
      const filteredSubscriptions = subscriptions.filter(
        s => s.channelId !== channelId
      );

      await this.configService.updateConfig({
        channels,
        channelSubscriptions: filteredSubscriptions,
      });

      logger.info('Channel deleted', { channelId });
      return true;
    } catch (error) {
      logger.error('Failed to delete channel', { channelId, error });
      return false;
    }
  }

  async subscribe(
    userId: number,
    channelId: string,
    chatId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      const channel = await this.getChannel(channelId);
      if (!channel) {
        return { success: false, message: 'Channel not found' };
      }

      // Check if channel is public or user has access
      if (!channel.isPublic) {
        // TODO: Add permission check for private channels
        return { success: false, message: 'Channel is private' };
      }

      const config = await this.configService.getConfig();
      const subscriptions = config.channelSubscriptions || [];

      // Check if already subscribed
      const existingSubscription = subscriptions.find(
        s => s.userId === userId && s.channelId === channelId && s.isActive
      );

      if (existingSubscription) {
        return {
          success: false,
          message: 'Already subscribed to this channel',
        };
      }

      // Add or reactivate subscription
      const inactiveSubscription = subscriptions.find(
        s => s.userId === userId && s.channelId === channelId && !s.isActive
      );

      if (inactiveSubscription) {
        inactiveSubscription.isActive = true;
        inactiveSubscription.chatId = chatId; // Update chatId in case it changed
        inactiveSubscription.subscribedAt = new Date().toISOString();
      } else {
        const newSubscription: ChannelSubscription = {
          userId,
          chatId,
          channelId,
          subscribedAt: new Date().toISOString(),
          isActive: true,
        };
        subscriptions.push(newSubscription);
      }

      // Update subscriber count
      const channels = config.channels || [];
      const channelIndex = channels.findIndex(c => c.id === channelId);
      if (channelIndex !== -1) {
        channels[channelIndex].subscriberCount = subscriptions.filter(
          s => s.channelId === channelId && s.isActive
        ).length;
      }

      await this.configService.updateConfig({
        channelSubscriptions: subscriptions,
        channels,
      });

      logger.info('User subscribed to channel', { userId, channelId });
      return {
        success: true,
        message: `Subscribed to channel '${channel.name}'`,
      };
    } catch (error) {
      logger.error('Failed to subscribe to channel', {
        userId,
        channelId,
        error,
      });
      return { success: false, message: 'Failed to subscribe' };
    }
  }

  async unsubscribe(
    userId: number,
    channelId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const config = await this.configService.getConfig();
      const subscriptions = config.channelSubscriptions || [];

      const subscription = subscriptions.find(
        s => s.userId === userId && s.channelId === channelId && s.isActive
      );

      if (!subscription) {
        return { success: false, message: 'Not subscribed to this channel' };
      }

      subscription.isActive = false;

      // Update subscriber count
      const channels = config.channels || [];
      const channelIndex = channels.findIndex(c => c.id === channelId);
      if (channelIndex !== -1) {
        channels[channelIndex].subscriberCount = subscriptions.filter(
          s => s.channelId === channelId && s.isActive
        ).length;
      }

      await this.configService.updateConfig({
        channelSubscriptions: subscriptions,
        channels,
      });

      const channel = await this.getChannel(channelId);
      logger.info('User unsubscribed from channel', { userId, channelId });
      return {
        success: true,
        message: `Unsubscribed from channel '${channel?.name || channelId}'`,
      };
    } catch (error) {
      logger.error('Failed to unsubscribe from channel', {
        userId,
        channelId,
        error,
      });
      return { success: false, message: 'Failed to unsubscribe' };
    }
  }

  async getUserSubscriptions(userId: number): Promise<Channel[]> {
    try {
      const config = await this.configService.getConfig();
      const subscriptions = config.channelSubscriptions || [];
      const channels = config.channels || [];

      const activeSubscriptions = subscriptions.filter(
        s => s.userId === userId && s.isActive
      );

      return channels.filter(c =>
        activeSubscriptions.some(s => s.channelId === c.id)
      );
    } catch (error) {
      logger.error('Failed to get user subscriptions', { userId, error });
      return [];
    }
  }

  async getChannelSubscribers(
    channelId: string
  ): Promise<ChannelSubscription[]> {
    try {
      // Always reload config from disk to ensure we have the latest subscription status
      await this.configService.reloadConfig();

      const config = await this.configService.getConfig();
      const subscriptions = config.channelSubscriptions || [];

      // Apply backward compatibility ONLY for subscriptions that completely lack chatId
      let hasUpdates = false;
      const fixedSubscriptions = subscriptions.map(s => {
        if (s.chatId === undefined || s.chatId === null) {
          hasUpdates = true;
          logger.info(
            'Applying backward compatibility for subscription missing chatId',
            {
              userId: s.userId,
              channelId: s.channelId,
            }
          );
          return {
            ...s,
            chatId: s.userId, // Use userId as chatId for backward compatibility
          };
        }
        return s;
      });

      // If we made fixes, save them back to the config
      if (hasUpdates) {
        await this.configService.updateConfig({
          channelSubscriptions: fixedSubscriptions,
        });
        logger.info('Fixed missing chatId fields in subscriptions', {
          fixedCount: fixedSubscriptions.filter(s => s.chatId === s.userId)
            .length,
        });
      }

      const result = fixedSubscriptions.filter(
        s => s.channelId === channelId && s.isActive
      );

      // Debug logging to see what subscribers are returned
      logger.info('Channel subscribers retrieved', {
        channelId,
        subscriberCount: result.length,
        subscribers: result.map(s => ({ userId: s.userId, chatId: s.chatId })),
      });

      return result;
    } catch (error) {
      logger.error('Failed to get channel subscribers', { channelId, error });
      return [];
    }
  }

  async incrementMessageCount(channelId: string): Promise<void> {
    try {
      const config = await this.configService.getConfig();
      const channels = config.channels || [];

      const channelIndex = channels.findIndex(c => c.id === channelId);
      if (channelIndex !== -1) {
        channels[channelIndex].messageCount++;
        channels[channelIndex].updatedAt = new Date().toISOString();
        await this.configService.updateConfig({ channels });
      }
    } catch (error) {
      logger.error('Failed to increment message count', { channelId, error });
    }
  }

  private generateChannelId(name: string): string {
    // Create a URL-safe channel ID from the name
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}
