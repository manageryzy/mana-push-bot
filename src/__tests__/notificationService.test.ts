import { NotificationService } from '@/services/notificationService';
import { TelegramService } from '@/services/telegramService';
import { NotificationPayload } from '@/types';

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  SQS: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    }),
    getQueueAttributes: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Attributes: {
          ApproximateNumberOfMessages: '0',
          ApproximateNumberOfMessagesNotVisible: '0',
        },
      }),
    }),
  })),
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockTelegramService: jest.Mocked<TelegramService>;

  beforeEach(() => {
    mockTelegramService = {
      sendNotification: jest.fn(),
      sendPhoto: jest.fn(),
    } as any;

    notificationService = new NotificationService(mockTelegramService);
  });

  describe('processNotification', () => {
    const validPayload: NotificationPayload = {
      id: 'test-id',
      type: 'message',
      target: { chatId: 12345 },
      content: { text: 'Test message' },
      created_at: '2023-01-01T00:00:00.000Z',
    };

    it('should process a valid notification', async () => {
      mockTelegramService.sendNotification.mockResolvedValue(true);

      const result =
        await notificationService.processNotification(validPayload);

      expect(result).toBe(true);
      expect(mockTelegramService.sendNotification).toHaveBeenCalledWith(
        12345,
        'Test message',
        {}
      );
    });

    it('should reject invalid payloads', async () => {
      const invalidPayload = { ...validPayload, type: undefined } as any;

      const result =
        await notificationService.processNotification(invalidPayload);

      expect(result).toBe(false);
      expect(mockTelegramService.sendNotification).not.toHaveBeenCalled();
    });

    it('should handle expired notifications', async () => {
      const expiredPayload = {
        ...validPayload,
        metadata: {
          expires: '2020-01-01T00:00:00.000Z', // Past date
        },
      };

      const result =
        await notificationService.processNotification(expiredPayload);

      expect(result).toBe(false);
      expect(mockTelegramService.sendNotification).not.toHaveBeenCalled();
    });

    it('should process alert notifications with special formatting', async () => {
      const alertPayload: NotificationPayload = {
        ...validPayload,
        type: 'alert',
        content: { text: 'Alert message' },
      };

      mockTelegramService.sendNotification.mockResolvedValue(true);

      const result =
        await notificationService.processNotification(alertPayload);

      expect(result).toBe(true);
      expect(mockTelegramService.sendNotification).toHaveBeenCalledWith(
        12345,
        '🚨 *ALERT*\\n\\nAlert message',
        {
          parse_mode: 'MarkdownV2',
          disable_notification: false,
        }
      );
    });

    it('should process photo notifications', async () => {
      const photoPayload: NotificationPayload = {
        ...validPayload,
        content: {
          media: {
            type: 'photo',
            url: 'https://example.com/photo.jpg',
            caption: 'Test photo',
          },
        },
      };

      mockTelegramService.sendPhoto.mockResolvedValue(true);

      const result =
        await notificationService.processNotification(photoPayload);

      expect(result).toBe(true);
      expect(mockTelegramService.sendPhoto).toHaveBeenCalledWith(
        12345,
        'https://example.com/photo.jpg',
        'Test photo'
      );
    });
  });

  describe('queueNotification', () => {
    it('should queue notifications successfully', async () => {
      const payload: NotificationPayload = {
        id: 'test-id',
        type: 'message',
        target: { chatId: 12345 },
        content: { text: 'Test message' },
        created_at: '2023-01-01T00:00:00.000Z',
      };

      const result = await notificationService.queueNotification(payload);

      expect(result).toBe(true);
    });
  });
});
