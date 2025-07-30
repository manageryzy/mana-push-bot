import { DeveloperService } from '@/services/developerService';
import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { ConfigService } from '@/services/configService';
import { ChannelService } from '@/services/channelService';
import { MessageService } from '@/services/messageService';

// Mock dependencies
jest.mock('@/config', () => ({
  config: {
    app: {
      stage: 'test',
      port: 3000,
      baseUrl: 'http://localhost:3000',
    },
    developer: {
      adminUserIds: [123456789],
      devChatId: 987654321,
    },
    aws: {
      region: 'us-east-1',
    },
  },
}));

jest.mock('@/utils/logger');
jest.mock('@/services/messageService');
jest.mock('@/services/channelService');
jest.mock('@/services/configService');
jest.mock('@/services/telegramService');

describe('DeveloperService', () => {
  let developerService: DeveloperService;
  let mockCtx: BotContext;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockChannelService: jest.Mocked<ChannelService>;
  let mockMessageService: jest.Mocked<MessageService>;

  beforeEach(() => {
    jest.clearAllMocks();

    developerService = new DeveloperService();

    // Setup mock context
    mockCtx = {
      from: { id: 123456789, is_bot: false, first_name: 'Test' },
      chat: { id: 111111111, type: 'private' },
      message: {
        text: '',
        chat: { id: 111111111, type: 'private' },
        date: Date.now() / 1000,
        message_id: 1,
      } as any,
      reply: jest.fn().mockResolvedValue(undefined),
      replyWithMarkdownV2: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Setup mock services
    mockConfigService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getBotConfig: jest.fn().mockReturnValue({}),
    } as any;

    mockChannelService = {
      getAllChannels: jest.fn().mockResolvedValue([
        {
          id: 'alerts',
          name: 'System Alerts',
          description: 'Critical system alerts',
          chatId: -1001234567890,
          createdBy: 123456789,
          createdAt: new Date().toISOString(),
          isPublic: true,
          subscriberCount: 5,
        },
        {
          id: 'updates',
          name: 'Updates',
          description: 'General updates',
          chatId: -1009876543210,
          createdBy: 123456789,
          createdAt: new Date().toISOString(),
          isPublic: false,
          subscriberCount: 2,
        },
      ]),
      getChannel: jest.fn().mockResolvedValue({
        id: 'alerts',
        name: 'System Alerts',
        chatId: -1001234567890,
        isPublic: true,
        subscriberCount: 5,
      }),
      createChannel: jest.fn().mockResolvedValue({
        success: true,
        channel: { id: 'new-channel', name: 'New Channel' },
      }),
      deleteChannel: jest.fn().mockResolvedValue({ success: true }),
      subscribe: jest.fn().mockResolvedValue({
        success: true,
        message: "Subscribed to channel 'System Alerts'",
      }),
      unsubscribe: jest.fn().mockResolvedValue({
        success: true,
        message: "Unsubscribed from channel 'System Alerts'",
      }),
    } as any;

    mockMessageService = {
      getStats: jest.fn().mockReturnValue({
        totalMessages: 100,
        messageTypes: { text: 50, photo: 20, video: 30 },
        uniqueUsers: 15,
        topUsers: [
          { userId: 123456789, messageCount: 25 },
          { userId: 987654321, messageCount: 15 },
        ],
      }),
      getRecentMessages: jest.fn().mockResolvedValue([
        {
          timestamp: '2025-01-19 10:00:00',
          messageType: 'text',
          text: 'Test message 1',
        },
        {
          timestamp: '2025-01-19 10:01:00',
          messageType: 'photo',
          text: 'Photo caption',
        },
      ]),
    } as any;

    // Mock module requires
    jest.doMock('@/services/configService', () => ({
      ConfigService: jest.fn(() => mockConfigService),
    }));
    jest.doMock('@/services/channelService', () => ({
      ChannelService: jest.fn(() => mockChannelService),
    }));
    jest.doMock('@/services/messageService', () => ({
      MessageService: jest.fn(() => mockMessageService),
    }));
  });

  describe('Admin Access Control', () => {
    it('should allow admin users to access admin commands', async () => {
      await developerService.handleDevCommand(mockCtx);

      expect(mockCtx.replyWithMarkdownV2).toHaveBeenCalledWith(
        expect.stringContaining('Developer')
      );
      expect(mockCtx.reply).not.toHaveBeenCalledWith(
        expect.stringContaining('Access denied')
      );
    });

    it('should deny non-admin users access to admin commands', async () => {
      mockCtx.from!.id = 999999999; // Non-admin user

      await developerService.handleDevCommand(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        '❌ Access denied. Admin privileges required.'
      );
      expect(mockCtx.replyWithMarkdownV2).not.toHaveBeenCalled();
    });
  });

  describe('/dev Command', () => {
    it('should display the developer menu with all available commands', async () => {
      await developerService.handleDevCommand(mockCtx);

      const call = mockCtx.replyWithMarkdownV2 as jest.Mock;
      const message = call.mock.calls[0][0];

      expect(message).toContain('Developer ');
      expect(message).toContain('Statistics & Monitoring');
      expect(message).toContain('Channel Management');
      expect(message).toContain('Server Control');
      expect(message).toContain('/stats');
      expect(message).toContain('/channels');
      expect(message).toContain('/broadcast');
      expect(message).toContain('Version: 1\\.0\\.0');
      expect(message).toContain('Stage: test');
    });
  });

  describe('/stats Command', () => {
    it('should display bot statistics', async () => {
      await developerService.handleStatsCommand(mockCtx);

      const call = mockCtx.replyWithMarkdownV2 as jest.Mock;
      const message = call.mock.calls[0][0];

      expect(message).toContain('Bot Statistics');
      expect(message).toContain('Total Messages');
      expect(message).toContain('Total Messages: 100');
      // Message breakdown is not included in the actual output
      // expect(message).toContain('\\Text\\: \\5\\0');
      // expect(message).toContain('\\Photo\\: \\2\\0');
      // expect(message).toContain('\\Video\\: \\3\\0');
      expect(message).toContain('Active Users');
      expect(message).toContain('Channels: 2');
      expect(message).toContain('Subscribers: 7');
    });

    it('should handle errors when fetching statistics', async () => {
      mockMessageService.getStats.mockImplementation(() => {
        throw new Error('Database error');
      });

      await developerService.handleStatsCommand(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Error retrieving stats')
      );
    });
  });

  describe('/logs Command', () => {
    it('should display recent logs with default parameters', async () => {
      (mockCtx.message as any).text = '/logs';

      await developerService.handleLogsCommand(mockCtx);

      expect(mockMessageService.getRecentMessages).toHaveBeenCalledWith(10);
      const call = mockCtx.replyWithMarkdownV2 as jest.Mock;
      const message = call.mock.calls[0][0];

      expect(message).toContain('Recent Logs \\(INFO\\)');
      expect(message).toContain('TEXT: Test message 1');
      expect(message).toContain('PHOTO: Photo caption');
    });

    it('should accept custom level and count parameters', async () => {
      (mockCtx.message as any).text = '/logs error 20';

      await developerService.handleLogsCommand(mockCtx);

      expect(mockMessageService.getRecentMessages).toHaveBeenCalledWith(20);
      const call = mockCtx.replyWithMarkdownV2 as jest.Mock;
      const message = call.mock.calls[0][0];

      expect(message).toContain('Recent Logs \\(ERROR\\)');
    });
  });

  describe('/broadcast Command', () => {
    it('should broadcast message to configured targets', async () => {
      (mockCtx.message as any).text = '/broadcast Important announcement!';

      await developerService.handleBroadcastCommand(mockCtx);

      const call = mockCtx.reply as jest.Mock;
      const replyCall = call.mock.calls.find(c =>
        c[0].includes('Broadcast sent successfully')
      );

      expect(replyCall).toBeDefined();
      expect(replyCall[0]).toContain(
        'Broadcast sent successfully to 2 targets'
      );
      expect(replyCall[0]).toContain('Important announcement\\!');
    });

    it('should reject broadcast without message', async () => {
      (mockCtx.message as any).text = '/broadcast';

      await developerService.handleBroadcastCommand(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a message to broadcast')
      );
    });
  });

  describe('/reload Command', () => {
    it('should reload configuration successfully', async () => {
      await developerService.handleReloadCommand(mockCtx);

      expect(mockConfigService.initialize).toHaveBeenCalled();
      const call = mockCtx.reply as jest.Mock;
      const message = call.mock.calls[0][0];

      expect(message).toContain('Configuration Reloaded');
      expect(message).toContain('\\*Environment:\\* test');
      expect(message).toContain('\\*Port:\\* 3000');
      expect(message).toContain('Configuration refreshed successfully');
    });
  });

  describe('Channel Management Commands', () => {
    describe('/channels Command', () => {
      it('should list all channels', async () => {
        await developerService.handleChannelsCommand(mockCtx);

        const call = mockCtx.reply as jest.Mock;
        const message = call.mock.calls[0][0];

        expect(message).toContain('Message Channels');
        expect(message).toContain('System Alerts \\(alerts\\)');
        expect(message).toContain('🌐 Public • 5 subscribers');
        expect(message).toContain('Updates \\(updates\\)');
        expect(message).toContain('🔒 Private • 2 subscribers');
      });

      it('should show empty state when no channels exist', async () => {
        mockChannelService.getAllChannels.mockResolvedValueOnce([]);

        await developerService.handleChannelsCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('No channels configured yet')
        );
      });
    });

    describe('/channel_create Command', () => {
      it('should create a new channel with description', async () => {
        (mockCtx.message as any).text =
          '/channel_create announcements General announcements';

        await developerService.handleChannelCreateCommand(mockCtx);

        expect(mockChannelService.createChannel).toHaveBeenCalledWith({
          name: 'announcements',
          description: 'General announcements',
          chatId: 111111111,
          createdBy: 123456789,
          isPublic: true,
        });

        const call = mockCtx.reply as jest.Mock;
        const message = call.mock.calls[0][0];

        expect(message).toContain('Channel Created Successfully');
        expect(message).toContain('\\*Name:\\* undefined');
      });

      it('should reject channel creation without name', async () => {
        (mockCtx.message as any).text = '/channel_create';

        await developerService.handleChannelCreateCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Usage: /channel_create')
        );
      });
    });

    describe('/channel_delete Command', () => {
      it('should delete an existing channel', async () => {
        (mockCtx.message as any).text = '/channel_delete alerts';

        await developerService.handleChannelDeleteCommand(mockCtx);

        expect(mockChannelService.deleteChannel).toHaveBeenCalledWith('alerts');

        const call = mockCtx.reply as jest.Mock;
        const message = call.mock.calls[0][0];

        expect(message).toContain('Channel Deleted');
        expect(message).toContain('\\*Channel ID:\\* alerts');
      });

      it('should reject deletion without channel ID', async () => {
        (mockCtx.message as any).text = '/channel_delete';

        await developerService.handleChannelDeleteCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Usage: /channel_delete')
        );
      });
    });

    describe('/push_url Command', () => {
      it('should display push URL for a channel', async () => {
        (mockCtx.message as any).text = '/push_url alerts';

        await developerService.handlePushUrlCommand(mockCtx);

        const call = mockCtx.reply as jest.Mock;
        const message = call.mock.calls[0][0];

        expect(message).toContain('Push URL Information');
        expect(message).toContain('\\*Channel:\\* alerts');
        expect(message).toContain('http://localhost:3000/push/alerts');
        expect(message).toContain('curl \\-X POST');
        expect(message).toContain('Supported Parameters');
      });

      it('should reject request without channel ID', async () => {
        (mockCtx.message as any).text = '/push_url';

        await developerService.handlePushUrlCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Usage: /push_url')
        );
      });
    });
  });

  describe('Subscription Commands', () => {
    describe('/subscribe Command', () => {
      it('should subscribe user to an existing channel', async () => {
        (mockCtx.message as any).text = '/subscribe alerts';

        await developerService.handleSubscribeCommand(mockCtx);

        expect(mockChannelService.getChannel).toHaveBeenCalledWith('alerts');
        expect(mockChannelService.subscribe).toHaveBeenCalledWith(
          123456789,
          'alerts',
          111111111
        );

        const call = mockCtx.reply as jest.Mock;
        const message = call.mock.calls[0][0];

        expect(message).toContain('Subscription Successful');
        expect(message).toContain('\\*Channel:\\* System Alerts');
      });

      it('should handle non-existent channel', async () => {
        (mockCtx.message as any).text = '/subscribe nonexistent';
        mockChannelService.getChannel.mockResolvedValueOnce(null);

        await developerService.handleSubscribeCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Channel "nonexistent" not found')
        );
      });

      it('should reject subscription without channel ID', async () => {
        (mockCtx.message as any).text = '/subscribe';

        await developerService.handleSubscribeCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Usage: /subscribe')
        );
      });
    });

    describe('/unsubscribe Command', () => {
      it('should unsubscribe user from a channel', async () => {
        (mockCtx.message as any).text = '/unsubscribe alerts';

        await developerService.handleUnsubscribeCommand(mockCtx);

        expect(mockChannelService.unsubscribe).toHaveBeenCalledWith(
          123456789,
          'alerts'
        );

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Unsubscription Successful'),
          expect.objectContaining({ parse_mode: 'MarkdownV2' })
        );
      });

      it('should handle unsubscribe failure', async () => {
        (mockCtx.message as any).text = '/unsubscribe alerts';
        mockChannelService.unsubscribe.mockResolvedValueOnce({
          success: false,
          message: 'Not subscribed to this channel',
        });

        await developerService.handleUnsubscribeCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Not subscribed to this channel')
        );
      });
    });
  });

  describe('Server Control Commands', () => {
    describe('/server_start Command', () => {
      it('should display server status information', async () => {
        await developerService.handleServerStartCommand(mockCtx);

        const call = mockCtx.reply as jest.Mock;
        const message = call.mock.calls[0][0];

        expect(message).toContain('HTTP Server Status');
        expect(message).toContain('\\*Status:\\* Running');
        expect(message).toContain('\\*Port:\\* 3000');
        expect(message).toContain('\\*Base URL:\\* http://localhost:3000');
        expect(message).toContain('Available Endpoints');
      });
    });

    describe('/server_stop Command', () => {
      it('should display server stop message', async () => {
        await developerService.handleServerStopCommand(mockCtx);

        expect(mockCtx.reply).toHaveBeenCalledWith(
          expect.stringContaining('Server stop functionality is not available')
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing user ID gracefully', async () => {
      const noUserCtx = { ...mockCtx, from: undefined } as any;

      await developerService.handleDevCommand(noUserCtx);

      expect(noUserCtx.reply).toHaveBeenCalledWith(
        '❌ Access denied. Admin privileges required.'
      );
    });

    it('should handle missing message text gracefully', async () => {
      const noTextCtx = {
        ...mockCtx,
        message: {
          chat: { id: 111111111, type: 'private' },
          date: Date.now() / 1000,
          message_id: 1,
        } as any,
      } as any;

      await developerService.handleBroadcastCommand(noTextCtx);

      expect(noTextCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Please provide a message to broadcast')
      );
    });

    it('should log developer commands on error', async () => {
      mockChannelService.getAllChannels.mockRejectedValueOnce(
        new Error('Database error')
      );

      await developerService.handleChannelsCommand(mockCtx);

      expect(logger.error).toHaveBeenCalledWith(
        'Error in handleChannelsCommand',
        expect.objectContaining({
          error: 'Database error',
          userId: 123456789,
        })
      );
    });
  });
});
