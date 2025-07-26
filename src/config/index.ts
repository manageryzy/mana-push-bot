import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    webhookUrl: process.env.WEBHOOK_URL || '',
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    notificationQueueUrl: process.env.NOTIFICATION_QUEUE_URL || '',
  },
  app: {
    stage: process.env.STAGE || 'dev',
    logLevel: process.env.LOG_LEVEL || 'info',
    port: parseInt(process.env.PORT || '3001', 10),
    baseUrl: process.env.BASE_URL || 'http://localhost:3001',
  },
  developer: {
    adminUserIds:
      process.env.ADMIN_USER_IDS?.split(',').map(id => parseInt(id, 10)) || [],
    devChatId: process.env.DEV_CHAT_ID
      ? parseInt(process.env.DEV_CHAT_ID, 10)
      : undefined,
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  },
} as const;

// Validation
export function validateConfig(): void {
  const required = [
    { key: 'TELEGRAM_BOT_TOKEN', value: config.telegram.botToken },
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map(({ key }) => key).join(', ')}`
    );
  }
}
