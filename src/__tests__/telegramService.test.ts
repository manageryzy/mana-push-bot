import { TelegramService } from '@/services/telegramService';

describe('TelegramService', () => {
  let telegramService: TelegramService;

  beforeEach(() => {
    // Mock environment variables
    process.env.TELEGRAM_BOT_TOKEN = 'test_token';
    telegramService = new TelegramService();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  describe('sendNotification', () => {
    it('should send a notification successfully', async () => {
      // Mock the telegram send method
      const mockSendMessage = jest.fn().mockResolvedValue(true);
      telegramService.getBot().telegram.sendMessage = mockSendMessage;

      const result = await telegramService.sendNotification(
        12345,
        'Test message'
      );

      expect(result).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Test message', {});
    });

    it('should handle send notification errors', async () => {
      // Mock the telegram send method to throw an error
      const mockSendMessage = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));
      telegramService.getBot().telegram.sendMessage = mockSendMessage;

      const result = await telegramService.sendNotification(
        12345,
        'Test message'
      );

      expect(result).toBe(false);
      expect(mockSendMessage).toHaveBeenCalledWith(12345, 'Test message', {});
    });

    it('should split long messages automatically', async () => {
      // Create a message longer than the safe limit (4000 characters)
      const longMessage = 'A'.repeat(5000);

      const mockSendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
      telegramService.getBot().telegram.sendMessage = mockSendMessage;

      const result = await telegramService.sendNotification(12345, longMessage);

      expect(result).toBe(true);
      // Should be called multiple times for message parts
      expect(mockSendMessage.mock.calls.length).toBeGreaterThan(1);

      // Each call should have text less than the limit
      mockSendMessage.mock.calls.forEach(call => {
        const messageText = call[1];
        expect(messageText.length).toBeLessThanOrEqual(4096);
      });
    });

    it('should handle "message too long" error by splitting', async () => {
      // Create a message that's under safe limit but Telegram still rejects
      const message = 'B'.repeat(3500);

      const mockSendMessage = jest
        .fn()
        .mockRejectedValueOnce(new Error('Bad Request: message is too long'))
        .mockResolvedValue({ message_id: 1 });

      telegramService.getBot().telegram.sendMessage = mockSendMessage;

      const result = await telegramService.sendNotification(12345, message);

      expect(result).toBe(true);
      // Should be called multiple times - first fails, then split parts succeed
      expect(mockSendMessage.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('handleWebhook', () => {
    it('should process webhook updates', async () => {
      const webhookData = {
        update_id: 123,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: 'Test', is_bot: false },
          chat: { id: 12345, type: 'private' },
          date: 1640995200,
          text: 'Hello',
        },
      };

      const result = await telegramService.handleWebhook(webhookData);

      expect(result.ok).toBe(true);
      expect(result.processed).toBe(true);
    });

    it('should handle webhook processing errors', async () => {
      // Mock the bot handleUpdate to throw an error
      const mockHandleUpdate = jest
        .fn()
        .mockRejectedValue(new Error('Processing error'));
      telegramService.getBot().handleUpdate = mockHandleUpdate;

      const webhookData = { update_id: 123 };
      const result = await telegramService.handleWebhook(webhookData);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Processing error');
    });
  });
});
