import { Telegraf } from 'telegraf';
import { config } from '@/config';
import { BotContext } from '@/types';
import { logger } from '@/utils/logger';
import { bold, escapeMarkdownV2 } from '@/utils/telegramFormatting';
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
    this.setupBotMenu();
  }

  private async setupBotMenu(): Promise<void> {
    try {
      // Set bot commands for the menu
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'help', description: 'Show help message' },
        { command: 'status', description: 'Show bot status' },
        { command: 'menu', description: 'Show main menu' },
        { command: 'dev', description: 'Developer menu (admin only)' },
        { command: 'stats', description: 'Bot statistics (admin only)' },
      ]);
      logger.info('Bot menu commands set successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to set bot menu commands', { error: errorMessage });
    }
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const errorStack = err instanceof Error ? err.stack : undefined;
      logger.error('Bot error occurred', {
        error: errorMessage,
        stack: errorStack,
        userId: ctx.userId,
        chatId: ctx.chatId,
      });
    });
  }

  private setupHandlers(): void {
    // Start command with improved message
    this.bot.start(async ctx => {
      await ctx.reply(
        'Welcome to Mana Push Bot! 🤖\n\n' +
          'This bot can send notifications and handle various messaging tasks.\n\n' +
          'Type /help for available commands or /menu for interactive options.'
      );
    });

    // Help command with fixed line breaks
    this.bot.help(async ctx => {
      const helpText = [
        '🤖 *Mana Push Bot Commands*',
        '',
        '📝 *General:*',
        '/start - Start the bot',
        '/help - Show this help message',
        '/status - Show bot status',
        '/menu - Show interactive menu',
        '',
        '🔧 *Developer Commands:*',
        '/dev - Show developer menu (admin only)',
        '/stats - Show bot statistics (admin only)',
        '/logs - Show recent logs (admin only)',
        '',
        '📨 *Notifications:*',
        'This bot receives notifications via webhook and SQS',
      ].join('\n');

      await ctx.replyWithMarkdownV2(helpText.replace(/[-.()]/g, '\\$&'));
    });

    // Interactive menu command
    this.bot.command('menu', async ctx => {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '📊 Status', callback_data: 'status' },
            { text: '❓ Help', callback_data: 'help' },
          ],
          [
            { text: '🔧 Settings', callback_data: 'settings' },
            { text: '📝 About', callback_data: 'about' },
          ],
        ],
      };

      await ctx.reply('🎛️ ' + bold('Main Menu') + '\n\nChoose an option:', {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard,
      });
    });

    // Handle callback queries from inline keyboards
    this.bot.on('callback_query', async ctx => {
      const callbackQuery = ctx.callbackQuery;
      if (!('data' in callbackQuery)) {
        await ctx.answerCbQuery();
        return;
      }

      const data = callbackQuery.data;

      try {
        switch (data) {
          case 'status': {
            await ctx.answerCbQuery();
            const uptime = process.uptime();
            const memoryUsage = process.memoryUsage();
            const statusMessage = [
              bold('Bot Status: Online') + ' ✅',
              '',
              escapeMarkdownV2(
                `⏱ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
              ),
              escapeMarkdownV2(
                `💾 Memory: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
              ),
              escapeMarkdownV2(`🌍 Environment: ${config.app.stage}`),
              '',
              'All systems operational' + escapeMarkdownV2('!'),
            ].join('\n');
            await ctx.editMessageText(statusMessage, {
              parse_mode: 'MarkdownV2',
            });
            break;
          }

          case 'help': {
            await ctx.answerCbQuery();
            const helpMessage = [
              bold('Quick Help'),
              '',
              '/start ' + escapeMarkdownV2('- Start the bot'),
              '/help ' + escapeMarkdownV2('- Full help message'),
              '/status ' + escapeMarkdownV2('- Check bot status'),
              '/menu ' + escapeMarkdownV2('- Show this menu'),
              '',
              bold('Features:'),
              escapeMarkdownV2('• Message logging and analysis'),
              escapeMarkdownV2('• Developer notifications'),
              escapeMarkdownV2('• AWS Lambda integration'),
              '',
              'Need more help' +
                escapeMarkdownV2('? Use /help for detailed commands.'),
            ].join('\n');
            await ctx.editMessageText(helpMessage, {
              parse_mode: 'MarkdownV2',
            });
            break;
          }

          case 'settings': {
            await ctx.answerCbQuery();
            const settingsKeyboard = {
              inline_keyboard: [
                [
                  {
                    text: '🔔 Notifications',
                    callback_data: 'settings_notifications',
                  },
                ],
                [{ text: '🌐 Language', callback_data: 'settings_language' }],
                [{ text: '⬅️ Back to Menu', callback_data: 'back_to_menu' }],
              ],
            };
            await ctx.editMessageText(
              '⚙️ *Settings*\n\nChoose a setting to configure:',
              {
                parse_mode: 'MarkdownV2',
                reply_markup: settingsKeyboard,
              }
            );
            break;
          }

          case 'about': {
            await ctx.answerCbQuery();
            const aboutMessage = [
              bold('Mana Push Bot v1.0.0') + ' 🤖',
              '',
              'A modern TypeScript Telegram bot running on AWS Lambda' +
                escapeMarkdownV2('.'),
              '',
              bold('Built with:'),
              escapeMarkdownV2('• Telegraf.js'),
              escapeMarkdownV2('• TypeScript'),
              escapeMarkdownV2('• AWS Lambda'),
              escapeMarkdownV2('• Serverless Framework'),
              '',
              'Created for efficient notification management and real' +
                escapeMarkdownV2('-time messaging.'),
            ].join('\n');
            await ctx.editMessageText(aboutMessage, {
              parse_mode: 'MarkdownV2',
            });
            break;
          }

          case 'back_to_menu': {
            await ctx.answerCbQuery();
            const backKeyboard = {
              inline_keyboard: [
                [
                  { text: '📊 Status', callback_data: 'status' },
                  { text: '❓ Help', callback_data: 'help' },
                ],
                [
                  { text: '🔧 Settings', callback_data: 'settings' },
                  { text: '📝 About', callback_data: 'about' },
                ],
              ],
            };
            await ctx.editMessageText('🎛️ *Main Menu*\n\nChoose an option:', {
              parse_mode: 'MarkdownV2',
              reply_markup: backKeyboard,
            });
            break;
          }

          default:
            await ctx.answerCbQuery('Feature coming soon!');
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Callback query error', { error: errorMessage, data });
        await ctx.answerCbQuery('An error occurred');
      }
    });

    // Status command with fixed line breaks
    this.bot.command('status', async ctx => {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const statusText = [
        '🤖 *Bot Status*',
        '',
        `⏱ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        `💾 Memory: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        `🌍 Environment: ${config.app.stage}`,
        `📊 Node.js: ${process.version}`,
      ].join('\n');

      await ctx.replyWithMarkdownV2(statusText.replace(/[-.()]/g, '\\$&'));
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Webhook processing error', { error: errorMessage });
      return { ok: false, error: errorMessage };
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send notification', {
        chatId,
        text: text.substring(0, 50),
        error: errorMessage,
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to send photo', { chatId, error: errorMessage });
      return false;
    }
  }

  public getBot(): Telegraf<BotContext> {
    return this.bot;
  }
}
