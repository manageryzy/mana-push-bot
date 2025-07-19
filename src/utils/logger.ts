import winston from 'winston';
import { config } from '@/config';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
  })
);

export const logger = winston.createLogger({
  level: config.app.logLevel,
  format: logFormat,
  defaultMeta: { service: 'mana-push-bot' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Log message utility for Telegram messages
export function logMessage(
  userId: number,
  chatId: number,
  messageId: number,
  text: string | undefined,
  messageType: string,
  metadata: any = {}
): void {
  logger.info('Telegram message received', {
    userId,
    chatId,
    messageId,
    text: text?.substring(0, 100), // Truncate long messages
    messageType,
    metadata,
  });
}

// Log notification sending
export function logNotification(
  target: any,
  content: any,
  success: boolean,
  error?: string
): void {
  logger.info('Notification sent', {
    target,
    content: typeof content === 'string' ? content.substring(0, 100) : content,
    success,
    error,
  });
}

// Log developer command usage
export function logDeveloperCommand(
  userId: number,
  command: string,
  args: string[],
  response: any,
  success: boolean
): void {
  logger.info('Developer command executed', {
    userId,
    command,
    args,
    response,
    success,
  });
}
