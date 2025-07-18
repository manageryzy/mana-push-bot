import { Telegraf } from 'telegraf';
import { config } from '@/config';
import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { MessageService } from './messageService';
import { DeveloperService } from './developerService';

export class TelegramService {
  private bot: Telegraf<BotContext>;
  private messageService: MessageService;
  private developerService: DeveloperService;

  constructor() {
    this.bot = new Telegraf<BotContext>(config.telegram.botToken);
    this.messageService = new MessageService();
    this.developerService = new DeveloperService();
    this.setupMiddleware();
    this.setupHandlers();
  }

  private setupMiddleware(): void {
    // Logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();

      // Add user and chat info to context
      if (ctx.from) {
        ctx.userId = ctx.from.id;
      }
      if (ctx.chat) {
        ctx.chatId = ctx.chat.id;
      }
      if (ctx.message) {
        ctx.messageId = ctx.message.message_id;
      }

      await next();

      const responseTime = Date.now() - start;
      logger.info('Request processed', {
        userId: ctx.userId,
        chatId: ctx.chatId,
        responseTime,
      });
    });

    // Error handling middleware
    this.bot.catch((err, ctx) => {
      logger.error('Bot error occurred', {
        error: err.message,
        stack: err.stack,
        userId: ctx.userId,
        chatId: ctx.chatId,
      });
    });
  }

  private setupHandlers(): void {
    // Start command
    this.bot.start(async ctx => {
      await ctx.reply(
        'Welcome to Mana Push Bot! 🤖\\n\\n' +
          'This bot can send notifications and handle various messaging tasks.\\n\\n' +
          'Type /help for available commands.'
      );
    });

    // Help command
    this.bot.help(async ctx => {
      const helpText = [
        '🤖 *Mana Push Bot Commands*',
        '',
        '📝 *General:*',
        '/start \\- Start the bot',
        '/help \\- Show this help message',
        '/status \\- Show bot status',
        '',
        '🔧 *Developer Commands:*',
        '/dev \\- Show developer menu \\(admin only\\)',
        '/stats \\- Show bot statistics \\(admin only\\)',
        '/logs \\- Show recent logs \\(admin only\\)',
        '',
        '📨 *Notifications:*',
        'This bot receives notifications via webhook and SQS',
      ].join('\\n');

      await ctx.replyWithMarkdownV2(helpText);
    });

    // Status command
    this.bot.command('status', async ctx => {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const statusText = [
        '🤖 *Bot Status*',
        '',
        `⏱ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        `💾 Memory: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        `🌍 Environment: ${config.app.stage}`,
        `📊 Node\\.js: ${process.version.replace(/\./g, '\\.')}`,
      ].join('\\n');

      await ctx.replyWithMarkdownV2(statusText);
    });

    // Developer commands
    this.bot.command('dev', ctx => this.developerService.handleDevCommand(ctx));
    this.bot.command('stats', ctx =>
      this.developerService.handleStatsCommand(ctx)
    );
    this.bot.command('logs', ctx =>
      this.developerService.handleLogsCommand(ctx)
    );

    // Message logging for all text messages
    this.bot.on('text', async ctx => {
      await this.messageService.logMessage(ctx);
    });

    // Handle other message types
    this.bot.on(
      ['photo', 'video', 'document', 'audio', 'voice', 'sticker'],
      async ctx => {
        await this.messageService.logMessage(ctx);
      }
    );
  }

  public async handleWebhook(body: any): Promise<any> {
    try {
      logger.info('Webhook received', { updateId: body.update_id });
      await this.bot.handleUpdate(body);
      return { ok: true, processed: true };
    } catch (error) {
      logger.error('Webhook processing error', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  public async sendNotification(
    chatId: number,
    text: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.bot.telegram.sendMessage(chatId, text, options);
      logger.info('Notification sent successfully', {
        chatId,
        text: text.substring(0, 50),
      });
      return true;
    } catch (error) {
      logger.error('Failed to send notification', {
        chatId,
        text: text.substring(0, 50),
        error: error.message,
      });
      return false;
    }
  }

  public async sendPhoto(
    chatId: number,
    photo: string,
    caption?: string,
    options: any = {}
  ): Promise<boolean> {
    try {
      await this.bot.telegram.sendPhoto(chatId, photo, { caption, ...options });
      logger.info('Photo sent successfully', { chatId, caption });
      return true;
    } catch (error) {
      logger.error('Failed to send photo', { chatId, error: error.message });
      return false;
    }
  }

  public getBot(): Telegraf<BotContext> {
    return this.bot;
  }
}
