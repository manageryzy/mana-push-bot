import { Context } from 'telegraf';

export interface BotContext extends Context {
  // Extended context properties can be added here
  userId?: number;
  chatId?: number;
  messageId?: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: any;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  photo?: any[];
  document?: any;
  video?: any;
  audio?: any;
  voice?: any;
  sticker?: any;
  location?: any;
  contact?: any;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  description?: string;
}

export interface NotificationPayload {
  id: string;
  type: 'message' | 'broadcast' | 'alert';
  target: {
    chatId?: number;
    userId?: number;
    channelId?: string;
  };
  content: {
    text?: string;
    html?: string;
    markdown?: string;
    media?: {
      type: 'photo' | 'video' | 'document' | 'audio';
      url: string;
      caption?: string;
    };
  };
  metadata?: {
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    scheduled?: string; // ISO date string
    expires?: string; // ISO date string
    retry_count?: number;
    source?: string;
  };
  created_at: string;
}

export interface MessageLog {
  id: string;
  timestamp: string;
  userId: number;
  chatId: number;
  messageId: number;
  text?: string;
  messageType: string;
  metadata: {
    username?: string;
    firstName?: string;
    lastName?: string;
    chatType: string;
    chatTitle?: string;
  };
}

export interface DeveloperCommand {
  command: string;
  description: string;
  usage: string;
  adminOnly?: boolean;
}

export interface BotStats {
  totalMessages: number;
  activeUsers: number;
  errorCount: number;
  uptime: number;
  lastUpdate: string;
}

export interface WebhookResponse {
  ok: boolean;
  error?: string;
  processed?: boolean;
}
