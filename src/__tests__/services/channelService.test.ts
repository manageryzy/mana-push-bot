import {
  ChannelService,
  Channel,
  ChannelSubscription,
} from '@/services/channelService';
import { ConfigService } from '@/services/configService';
import { TelegramService } from '@/services/telegramService';
import { logger } from '@/utils/logger';

jest.mock('@/utils/logger');
jest.mock('@/services/configService');
jest.mock('@/services/telegramService');

describe('ChannelService', () => {
  let channelService: ChannelService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockTelegramService: jest.Mocked<TelegramService>;
  let mockGetChat: jest.Mock;

  const mockChannels: Channel[] = [
    {
      id: 'general',
      name: 'General',
      description: 'General announcements',
      chatId: -1001234567890,
      isPublic: true,
      createdBy: 123456789,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      subscriberCount: 10,
      messageCount: 50,
    },
    {
      id: 'vip',
      name: 'VIP',
      description: 'VIP only channel',
      chatId: -1009876543210,
      isPublic: false,
      createdBy: 123456789,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      subscriberCount: 3,
      messageCount: 20,
    },
  ];

  const mockSubscriptions: ChannelSubscription[] = [
    {
      userId: 111111111,
      chatId: 111111111,
      channelId: 'general',
      subscribedAt: '2025-01-01T00:00:00.000Z',
      isActive: true,
    },
    {
      userId: 222222222,
      chatId: 222222222,
      channelId: 'general',
      subscribedAt: '2025-01-02T00:00:00.000Z',
      isActive: true,
    },
    {
      userId: 333333333,
      chatId: 333333333,
      channelId: 'general',
      subscribedAt: '2025-01-03T00:00:00.000Z',
      isActive: false, // Inactive subscription
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ConfigService - deep clone to prevent test interference
    mockConfigService = {
      getConfig: jest.fn().mockResolvedValue({
        channels: JSON.parse(JSON.stringify(mockChannels)),
        channelSubscriptions: JSON.parse(JSON.stringify(mockSubscriptions)),
      }),
      updateConfig: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock TelegramService
    mockGetChat = jest
      .fn()
      .mockResolvedValue({ id: -1001234567890, type: 'channel' });
    mockTelegramService = {
      getBot: jest.fn().mockReturnValue({
        telegram: {
          getChat: mockGetChat,
        },
      }),
    } as any;

    channelService = new ChannelService(mockConfigService, mockTelegramService);
  });

  describe('getAllChannels', () => {
    it('should return all channels', async () => {
      const channels = await channelService.getAllChannels();

      expect(channels).toHaveLength(2);
      expect(channels).toEqual(mockChannels);
      expect(mockConfigService.getConfig).toHaveBeenCalled();
    });

    it('should return empty array on error', async () => {
      mockConfigService.getConfig.mockRejectedValueOnce(
        new Error('Config error')
      );

      const channels = await channelService.getAllChannels();

      expect(channels).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Failed to get channels', {
        error: expect.any(Error),
      });
    });
  });

  describe('getChannel', () => {
    it('should return channel by ID', async () => {
      const channel = await channelService.getChannel('general');

      expect(channel).toEqual(mockChannels[0]);
    });

    it('should return null for non-existent channel', async () => {
      const channel = await channelService.getChannel('nonexistent');

      expect(channel).toBeNull();
    });
  });

  describe('getPublicChannels', () => {
    it('should return only public channels', async () => {
      const channels = await channelService.getPublicChannels();

      expect(channels).toHaveLength(1);
      expect(channels[0].id).toBe('general');
      expect(channels[0].isPublic).toBe(true);
    });
  });

  describe('createChannel', () => {
    it('should create a new channel successfully', async () => {
      const createRequest = {
        name: 'Announcements',
        description: 'Important announcements',
        chatId: -1005555555555,
        isPublic: true,
        createdBy: 123456789,
      };

      const channel = await channelService.createChannel(createRequest);

      expect(channel).toMatchObject({
        id: 'announcements',
        name: 'Announcements',
        description: 'Important announcements',
        chatId: -1005555555555,
        isPublic: true,
        createdBy: 123456789,
        subscriberCount: 0,
        messageCount: 0,
      });

      expect(mockGetChat).toHaveBeenCalledWith(-1005555555555);
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith({
        channels: expect.arrayContaining([
          ...mockChannels,
          expect.objectContaining({ id: 'announcements' }),
        ]),
      });
    });

    it('should reject duplicate channel names', async () => {
      const createRequest = {
        name: 'General', // Already exists
        chatId: -1005555555555,
        isPublic: true,
        createdBy: 123456789,
      };

      await expect(channelService.createChannel(createRequest)).rejects.toThrow(
        "Channel with name 'General' already exists"
      );

      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('should reject invalid chat ID', async () => {
      mockGetChat.mockRejectedValueOnce(new Error('Chat not found'));

      const createRequest = {
        name: 'Invalid',
        chatId: -999999999999,
        isPublic: true,
        createdBy: 123456789,
      };

      await expect(channelService.createChannel(createRequest)).rejects.toThrow(
        'Invalid chat ID: -999999999999'
      );
    });

    it('should generate channel ID from name', async () => {
      const createRequest = {
        name: 'Test Channel 123',
        chatId: -1005555555555,
        isPublic: true,
        createdBy: 123456789,
      };

      const channel = await channelService.createChannel(createRequest);

      expect(channel.id).toBe('test-channel-123');
    });
  });

  describe('updateChannel', () => {
    it('should update channel successfully', async () => {
      const updates = {
        name: 'General Updates',
        description: 'Updated description',
      };

      const updated = await channelService.updateChannel('general', updates);

      expect(updated).toMatchObject({
        id: 'general',
        name: 'General Updates',
        description: 'Updated description',
      });

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith({
        channels: expect.arrayContaining([
          expect.objectContaining({
            id: 'general',
            name: 'General Updates',
            description: 'Updated description',
          }),
        ]),
      });
    });

    it('should validate new chat ID when updating', async () => {
      const updates = {
        chatId: -1007777777777,
      };

      await channelService.updateChannel('general', updates);

      expect(mockGetChat).toHaveBeenCalledWith(-1007777777777);
    });

    it('should return null for non-existent channel', async () => {
      const updates = { name: 'New Name' };

      const result = await channelService.updateChannel('nonexistent', updates);

      expect(result).toBeNull();
      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe('deleteChannel', () => {
    it('should delete channel and its subscriptions', async () => {
      const result = await channelService.deleteChannel('general');

      expect(result).toBe(true);
      expect(mockConfigService.updateConfig).toHaveBeenCalledWith({
        channels: [mockChannels[1]], // Only VIP channel remains
        channelSubscriptions: [], // All general channel subscriptions removed
      });
    });

    it('should return false for non-existent channel', async () => {
      const result = await channelService.deleteChannel('nonexistent');

      expect(result).toBe(false);
      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should subscribe user to public channel', async () => {
      const result = await channelService.subscribe(
        444444444,
        'general',
        444444444
      );

      expect(result).toEqual({
        success: true,
        message: "Subscribed to channel 'General'",
      });

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith({
        channelSubscriptions: expect.arrayContaining([
          ...mockSubscriptions,
          expect.objectContaining({
            userId: 444444444,
            chatId: 444444444,
            channelId: 'general',
            isActive: true,
          }),
        ]),
        channels: expect.arrayContaining([
          expect.objectContaining({
            id: 'general',
            subscriberCount: 3, // 2 active + 1 new
          }),
        ]),
      });
    });

    it('should reject subscription to private channel', async () => {
      const result = await channelService.subscribe(
        444444444,
        'vip',
        444444444
      );

      expect(result).toEqual({
        success: false,
        message: 'Channel is private',
      });

      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('should reject duplicate subscription', async () => {
      const result = await channelService.subscribe(
        111111111,
        'general',
        111111111
      );

      expect(result).toEqual({
        success: false,
        message: 'Already subscribed to this channel',
      });
    });

    it('should reactivate inactive subscription', async () => {
      const result = await channelService.subscribe(
        333333333,
        'general',
        999999999
      );

      expect(result).toEqual({
        success: true,
        message: "Subscribed to channel 'General'",
      });

      const updateCall = mockConfigService.updateConfig.mock.calls[0][0];
      const reactivatedSub = updateCall.channelSubscriptions?.find(
        (s: ChannelSubscription) =>
          s.userId === 333333333 && s.channelId === 'general'
      );

      expect(reactivatedSub?.isActive).toBe(true);
      expect(reactivatedSub?.chatId).toBe(999999999); // Updated chat ID
    });

    it('should handle non-existent channel', async () => {
      const result = await channelService.subscribe(
        444444444,
        'nonexistent',
        444444444
      );

      expect(result).toEqual({
        success: false,
        message: 'Channel not found',
      });
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe active user', async () => {
      const result = await channelService.unsubscribe(111111111, 'general');

      expect(result).toEqual({
        success: true,
        message: "Unsubscribed from channel 'General'",
      });

      const updateCall = mockConfigService.updateConfig.mock.calls[0][0];
      const subscription = updateCall.channelSubscriptions?.find(
        (s: ChannelSubscription) =>
          s.userId === 111111111 && s.channelId === 'general'
      );

      expect(subscription?.isActive).toBe(false);
      expect(updateCall.channels?.[0]?.subscriberCount).toBe(1); // 2 active - 1
    });

    it('should reject unsubscribe for non-subscribed user', async () => {
      const result = await channelService.unsubscribe(444444444, 'general');

      expect(result).toEqual({
        success: false,
        message: 'Not subscribed to this channel',
      });

      expect(mockConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('should reject unsubscribe for already inactive subscription', async () => {
      const result = await channelService.unsubscribe(333333333, 'general');

      expect(result).toEqual({
        success: false,
        message: 'Not subscribed to this channel',
      });
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return user active subscriptions', async () => {
      const channels = await channelService.getUserSubscriptions(111111111);

      expect(channels).toHaveLength(1);
      expect(channels[0].id).toBe('general');
    });

    it('should return empty array for user with no subscriptions', async () => {
      const channels = await channelService.getUserSubscriptions(999999999);

      expect(channels).toEqual([]);
    });

    it('should not return channels for inactive subscriptions', async () => {
      const channels = await channelService.getUserSubscriptions(333333333);

      expect(channels).toEqual([]);
    });
  });

  describe('getChannelSubscribers', () => {
    it('should return active subscribers for a channel', async () => {
      const subscribers = await channelService.getChannelSubscribers('general');

      expect(subscribers).toHaveLength(2);
      expect(subscribers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: 111111111, isActive: true }),
          expect.objectContaining({ userId: 222222222, isActive: true }),
        ])
      );
    });

    it('should return empty array for channel with no subscribers', async () => {
      const subscribers = await channelService.getChannelSubscribers('vip');

      expect(subscribers).toEqual([]);
    });

    it('should log subscriber information', async () => {
      await channelService.getChannelSubscribers('general');

      expect(logger.info).toHaveBeenCalledWith(
        'Channel subscribers retrieved',
        expect.objectContaining({
          channelId: 'general',
          subscriberCount: 2,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle config service errors gracefully', async () => {
      mockConfigService.updateConfig.mockRejectedValueOnce(
        new Error('Save failed')
      );

      const result = await channelService.deleteChannel('general');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete channel',
        expect.objectContaining({ channelId: 'general' })
      );
    });

    it('should handle missing config data', async () => {
      mockConfigService.getConfig.mockResolvedValueOnce({});

      const channels = await channelService.getAllChannels();

      expect(channels).toEqual([]);
    });
  });
});
