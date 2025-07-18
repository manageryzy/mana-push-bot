import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function parseUserId(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

export function escapeTelegramMarkdown(text: string): string {
  // Escape special characters for MarkdownV2
  return text.replace(/[_*[\]()~`>#+=|{}.!-\\]/g, '\\$&');
}

export function escapeMarkdownV2(text: string): string {
  // More comprehensive escaping for MarkdownV2
  return text.replace(/([_*[\]()~`>#+=|{}.!-\\])/g, '\\$1');
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function isValidChatId(chatId: any): boolean {
  return typeof chatId === 'number' && !isNaN(chatId);
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0) parts.push(`${remainingSeconds}s`);

  return parts.join(' ') || '0s';
}

export function validateEnvironment(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    errors.push('TELEGRAM_BOT_TOKEN is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
