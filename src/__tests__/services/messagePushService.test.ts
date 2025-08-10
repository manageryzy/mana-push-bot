import {
  MessagePushService,
  PushMessageData,
} from '@/services/messagePushService';
import { TelegramService } from '@/services/telegramService';
import { ChannelService } from '@/services/channelService';
import { ConfigService } from '@/services/configService';
import { logger } from '@/utils/logger';

jest.mock('@/utils/logger');
jest.mock('@/services/telegramService');
jest.mock('@/services/channelService');
jest.mock('@/services/configService');

describe('MessagePushService', () => {
  let messagePushService: MessagePushService;
  let mockTelegramService: jest.Mocked<TelegramService>;
  let mockChannelService: jest.Mocked<ChannelService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockSendMessage: jest.Mock;

  const mockChannel = {
    id: 'alerts',
    name: 'System Alerts',
    chatId: -1001234567890,
    isPublic: true,
    subscriberCount: 3,
    messageCount: 10,
  };

  const mockSubscribers = [
    {
      userId: 111111111,
      chatId: 111111111,
      channelId: 'alerts',
      isActive: true,
    },
    {
      userId: 222222222,
      chatId: 222222222,
      channelId: 'alerts',
      isActive: true,
    },
    {
      userId: 333333333,
      chatId: 333333333,
      channelId: 'alerts',
      isActive: true,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Telegram service
    mockSendMessage = jest.fn().mockResolvedValue({ message_id: 12345 });
    mockTelegramService = {
      getBot: jest.fn().mockReturnValue({
        telegram: {
          sendMessage: mockSendMessage,
        },
      }),
    } as any;

    // Mock Channel service
    mockChannelService = {
      getChannel: jest.fn().mockResolvedValue(mockChannel),
      getChannelSubscribers: jest.fn().mockResolvedValue(mockSubscribers),
      incrementMessageCount: jest.fn().mockResolvedValue(undefined),
      getAllChannels: jest
        .fn()
        .mockResolvedValue([
          mockChannel,
          { ...mockChannel, id: 'updates', name: 'Updates', messageCount: 5 },
        ]),
    } as any;

    // Mock Config service
    mockConfigService = {
      getStats: jest.fn().mockResolvedValue({
        totalMessages: 100,
        successfulPushes: 95,
        failedPushes: 5,
        averageResponseTime: 250,
        lastPushTime: '2025-01-19T10:00:00.000Z',
      }),
    } as any;

    messagePushService = new MessagePushService(
      mockTelegramService,
      mockChannelService,
      mockConfigService
    );
  });

  describe('pushToChannel', () => {
    const basePushData: PushMessageData = {
      channelId: 'alerts',
      message: 'Test alert message',
      format: 'markdown',
      priority: 'normal',
      timestamp: '2025-01-19T10:00:00.000Z',
    };

    it('should push message to channel successfully', async () => {
      const result = await messagePushService.pushToChannel(basePushData);

      expect(result).toEqual({
        success: true,
        messageId: 12345,
        messageIds: [12345],
        numberOfParts: 1,
        channelId: 'alerts',
        timestamp: expect.any(String),
        recipientCount: 4, // 1 channel + 3 subscribers
      });

      // Verify channel message
      expect(mockSendMessage).toHaveBeenCalledWith(
        -1001234567890,
        expect.stringContaining('Test alert message'),
        expect.objectContaining({
          parse_mode: 'MarkdownV2',
          link_preview_options: { is_disabled: true },
        })
      );

      // Verify subscriber messages
      expect(mockSendMessage).toHaveBeenCalledTimes(4); // 1 channel + 3 subscribers
      expect(mockChannelService.incrementMessageCount).toHaveBeenCalledWith(
        'alerts'
      );
    });

    it('should handle high priority messages with special formatting', async () => {
      const highPriorityData: PushMessageData = {
        ...basePushData,
        priority: 'high',
        message: 'Critical system failure!',
      };

      await messagePushService.pushToChannel(highPriorityData);

      expect(mockSendMessage).toHaveBeenCalledWith(
        -1001234567890,
        expect.stringContaining('🚨'),
        expect.any(Object)
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        -1001234567890,
        expect.stringContaining('HIGH PRIORITY'),
        expect.any(Object)
      );
    });

    it('should handle low priority messages with info formatting', async () => {
      const lowPriorityData: PushMessageData = {
        ...basePushData,
        priority: 'low',
        message: 'Routine maintenance completed',
      };

      await messagePushService.pushToChannel(lowPriorityData);

      expect(mockSendMessage).toHaveBeenCalledWith(
        -1001234567890,
        expect.stringContaining('📋'),
        expect.any(Object)
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        -1001234567890,
        expect.stringContaining('Info'),
        expect.any(Object)
      );
    });

    it('should include metadata in message', async () => {
      const dataWithMetadata: PushMessageData = {
        ...basePushData,
        metadata: {
          source: 'monitoring-system',
          severity: 'warning',
          server: 'web-01',
        },
      };

      await messagePushService.pushToChannel(dataWithMetadata);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('source');
      expect(sentMessage).toContain('monitoring\\-system');
      expect(sentMessage).toContain('severity');
      expect(sentMessage).toContain('warning');
    });

    it('should handle HTML format', async () => {
      const htmlData: PushMessageData = {
        ...basePushData,
        format: 'html',
        message: '<b>Bold</b> and <i>italic</i> text',
      };

      await messagePushService.pushToChannel(htmlData);

      expect(mockSendMessage).toHaveBeenCalledWith(
        -1001234567890,
        expect.any(String),
        expect.objectContaining({
          parse_mode: 'HTML',
        })
      );
    });

    it('should handle plain text format', async () => {
      const textData: PushMessageData = {
        ...basePushData,
        format: 'text',
        message: 'Plain text message with *asterisks*',
      };

      await messagePushService.pushToChannel(textData);

      expect(mockSendMessage).toHaveBeenCalledWith(
        -1001234567890,
        expect.stringContaining('*asterisks*'), // Not escaped
        expect.not.objectContaining({
          parse_mode: expect.anything(),
        })
      );
    });

    it('should return error for non-existent channel', async () => {
      mockChannelService.getChannel.mockResolvedValueOnce(null);

      const result = await messagePushService.pushToChannel(basePushData);

      expect(result).toEqual({
        success: false,
        error: 'Channel not found',
        channelId: 'alerts',
        timestamp: expect.any(String),
        recipientCount: 0,
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should handle channel with no subscribers', async () => {
      mockChannelService.getChannelSubscribers.mockResolvedValueOnce([]);

      const result = await messagePushService.pushToChannel(basePushData);

      expect(result.success).toBe(true);
      expect(result.recipientCount).toBe(1); // Only channel message
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle partial subscriber failures gracefully', async () => {
      // Make second subscriber fail
      mockSendMessage
        .mockResolvedValueOnce({ message_id: 12345 }) // Channel
        .mockResolvedValueOnce({ message_id: 12346 }) // Subscriber 1
        .mockRejectedValueOnce(new Error('User blocked bot')) // Subscriber 2
        .mockResolvedValueOnce({ message_id: 12347 }); // Subscriber 3

      const result = await messagePushService.pushToChannel(basePushData);

      expect(result.success).toBe(true);
      expect(result.recipientCount).toBe(3); // 1 channel + 2 successful subscribers
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send message parts to subscriber',
        expect.objectContaining({
          userId: 222222222,
        })
      );
    });

    it('should handle Telegram API errors', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Chat not found'));

      const result = await messagePushService.pushToChannel(basePushData);

      expect(result).toEqual({
        success: false,
        error: 'Chat not found',
        channelId: 'alerts',
        timestamp: expect.any(String),
        recipientCount: 0,
      });

      // Should update failed push stats
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to push message',
        expect.any(Object)
      );
    });
  });

  describe('queueMessage', () => {
    it('should queue messages and process them', async () => {
      const messages: PushMessageData[] = [
        {
          channelId: 'alerts',
          message: 'Message 1',
          format: 'text',
          timestamp: new Date().toISOString(),
        },
        {
          channelId: 'alerts',
          message: 'Message 2',
          format: 'markdown',
          timestamp: new Date().toISOString(),
        },
        {
          channelId: 'alerts',
          message: 'Message 3',
          format: 'html',
          timestamp: new Date().toISOString(),
        },
      ];

      // Queue messages
      for (const msg of messages) {
        await messagePushService.queueMessage(msg);
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(mockSendMessage).toHaveBeenCalledTimes(12); // 3 messages * (1 channel + 3 subscribers)
      expect(logger.info).toHaveBeenCalledWith('Queue processing completed');
    });

    it('should handle queue processing errors gracefully', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('API error'));

      await messagePushService.queueMessage({
        channelId: 'alerts',
        message: 'Failing message',
        format: 'text',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to push message',
        expect.any(Object)
      );
    });

    it('should prevent concurrent queue processing', async () => {
      // Queue multiple messages rapidly
      const promises = Array.from({ length: 5 }, (_, i) =>
        messagePushService.queueMessage({
          channelId: 'alerts',
          message: `Message ${i}`,
          format: 'text',
          timestamp: new Date().toISOString(),
        })
      );

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should process all messages sequentially
      expect(mockSendMessage).toHaveBeenCalledTimes(20); // 5 messages * 4 recipients
    });
  });

  describe('getStats', () => {
    it('should return comprehensive statistics', async () => {
      const stats = await messagePushService.getStats();

      expect(stats).toEqual({
        totalMessages: 100,
        successfulPushes: 95,
        failedPushes: 5,
        channelsActive: 2,
        subscribersTotal: 6, // 3 per channel
        averageResponseTime: 250,
        lastPushTime: '2025-01-19T10:00:00.000Z',
        topChannels: [
          {
            channelId: 'alerts',
            name: 'System Alerts',
            messageCount: 10,
            subscriberCount: 3,
          },
          {
            channelId: 'updates',
            name: 'Updates',
            messageCount: 5,
            subscriberCount: 3,
          },
        ],
      });
    });

    it('should handle stats retrieval errors', async () => {
      mockConfigService.getStats.mockRejectedValueOnce(new Error('DB error'));

      const stats = await messagePushService.getStats();

      expect(stats).toEqual({
        totalMessages: 0,
        successfulPushes: 0,
        failedPushes: 0,
        channelsActive: 0,
        subscribersTotal: 0,
        averageResponseTime: 0,
        topChannels: [],
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get push stats',
        expect.any(Object)
      );
    });
  });

  describe('Message Formatting', () => {
    it('should properly escape Markdown V2 special characters', async () => {
      const data: PushMessageData = {
        channelId: 'alerts',
        message: 'Alert: CPU > 90% (critical) - check server_1',
        format: 'markdown',
        timestamp: new Date().toISOString(),
      };

      await messagePushService.pushToChannel(data);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('\\>');
      expect(sentMessage).toContain('\\(');
      expect(sentMessage).toContain('\\)');
      expect(sentMessage).toContain('\\_');
    });

    it('should add timestamp footer to messages', async () => {
      const timestamp = '2025-01-19T15:30:00.000Z';
      const data: PushMessageData = {
        channelId: 'alerts',
        message: 'Test message',
        format: 'markdown',
        timestamp,
      };

      await messagePushService.pushToChannel(data);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      expect(sentMessage).toContain('━━━━━━━━━━━━━━━━━━━━');
      expect(sentMessage).toContain('1/19/2025');
    });

    it('should properly handle Unicode escape sequences in HTML format', async () => {
      const data: PushMessageData = {
        channelId: 'alerts',
        message:
          "\\u4ea4\\u6613\\u5bf9 ('DOT/USDT:USDT', 'QTUM/USDT:USDT') | \\u7d2f\\u8ba1\\u6536\\u76ca: 1.06% | \\u590f\\u666e\\u6bd4\\u7387: 1.29",
        format: 'html',
        timestamp: new Date().toISOString(),
      };

      await messagePushService.pushToChannel(data);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      // Check that Unicode escapes are decoded to actual Chinese characters
      expect(sentMessage).toContain('交易对');
      expect(sentMessage).toContain('累计收益');
      expect(sentMessage).toContain('夏普比率');
      // Check that HTML special characters in user content are properly escaped
      expect(sentMessage).toContain('&#39;'); // ' should be escaped as &#39;
      // Check that our formatting HTML tags are preserved (not escaped)
      expect(sentMessage).toContain('<i>Sent:'); // Our HTML tags should not be escaped
      expect(sentMessage).not.toContain('&lt;i&gt;'); // Should not be escaped
    });

    it('should properly handle Unicode escape sequences in markdown format', async () => {
      const data: PushMessageData = {
        channelId: 'alerts',
        message: '\\u4ea4\\u6613\\u5bf9: \\u6210\\u529f',
        format: 'markdown',
        timestamp: new Date().toISOString(),
      };

      await messagePushService.pushToChannel(data);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      // Check that Unicode escapes are decoded and then escaped for MarkdownV2
      expect(sentMessage).toContain('交易对');
      expect(sentMessage).toContain('成功');
    });

    it('should properly handle Unicode escape sequences in plain text format', async () => {
      const data: PushMessageData = {
        channelId: 'alerts',
        message: '\\u4ea4\\u6613\\u5bf9 (DOT/USDT) \\u6210\\u529f',
        format: 'text',
        timestamp: new Date().toISOString(),
      };

      await messagePushService.pushToChannel(data);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      // Check that Unicode escapes are decoded to actual Chinese characters
      expect(sentMessage).toContain('交易对');
      expect(sentMessage).toContain('成功');
    });

    it('should handle Unicode escapes in metadata', async () => {
      const data: PushMessageData = {
        channelId: 'alerts',
        message: 'Trading alert',
        format: 'html',
        metadata: {
          '\\u4ea4\\u6613\\u5bf9': 'DOT/USDT',
          '\\u72b6\\u6001': '\\u6210\\u529f',
        },
        timestamp: new Date().toISOString(),
      };

      await messagePushService.pushToChannel(data);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      // Check that metadata keys and values are properly decoded
      expect(sentMessage).toContain('交易对');
      expect(sentMessage).toContain('状态');
      expect(sentMessage).toContain('成功');
      // Check that metadata formatting uses HTML tags
      expect(sentMessage).toContain('<b>交易对</b>');
      expect(sentMessage).toContain('<b>状态</b>');
    });

    it('should properly escape HTML in user content while preserving formatting tags', async () => {
      const data: PushMessageData = {
        channelId: 'alerts',
        message:
          'Alert: <script>alert("xss")</script> & other <dangerous> content',
        format: 'html',
        priority: 'high',
        timestamp: new Date().toISOString(),
      };

      await messagePushService.pushToChannel(data);

      const sentMessage = mockSendMessage.mock.calls[0][1];
      // Check that dangerous HTML in user content is escaped
      expect(sentMessage).toContain('&lt;script&gt;');
      expect(sentMessage).toContain('&lt;dangerous&gt;');
      expect(sentMessage).toContain('&amp;'); // & should be escaped
      // Check that our formatting HTML tags are preserved
      expect(sentMessage).toContain('<b>HIGH PRIORITY</b>');
      expect(sentMessage).toContain('<i>Sent:');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle high-volume message bursts', async () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        channelId: 'alerts',
        message: `Alert ${i}: System monitoring event`,
        format: 'markdown' as const,
        priority: i % 10 === 0 ? ('high' as const) : ('normal' as const),
        timestamp: new Date().toISOString(),
      }));

      const promises = messages.map(msg =>
        messagePushService.pushToChannel(msg)
      );
      const results = await Promise.all(promises);

      const successful = results.filter(r => r.success).length;
      expect(successful).toBe(50);
      expect(mockChannelService.incrementMessageCount).toHaveBeenCalledTimes(
        50
      );
    });

    it('should handle rate limiting with retries', async () => {
      // Simulate rate limit error then success
      mockSendMessage
        .mockRejectedValueOnce(new Error('Too Many Requests'))
        .mockResolvedValue({ message_id: 12345 });

      const data: PushMessageData = {
        channelId: 'alerts',
        message: 'Rate limited message',
        format: 'text',
        timestamp: new Date().toISOString(),
      };

      const result = await messagePushService.pushToChannel(data);

      // First attempt should fail
      expect(result.success).toBe(false);
      expect(result.error).toBe('Too Many Requests');
    });
  });
});
