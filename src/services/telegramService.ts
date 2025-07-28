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
        { command: 'subscribe', description: 'Subscribe to a channel' },
        { command: 'unsubscribe', description: 'Unsubscribe from a channel' },
        { command: 'dev', description: 'Developer menu (admin only)' },
        { command: 'stats', description: 'Bot statistics (admin only)' },
        {
          command: 'channels',
          description: 'List message channels (admin only)',
        },
        {
          command: 'push_url',
          description: 'Get push URL for channel (admin only)',
        },
        {
          command: 'channel_create',
          description: 'Create new channel (admin only)',
        },
        {
          command: 'channel_delete',
          description: 'Delete channel (admin only)',
        },
        {
          command: 'server_start',
          description: 'Start HTTP server (admin only)',
        },
        {
          command: 'server_stop',
          description: 'Stop HTTP server (admin only)',
        },
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

      // Debug logging for incoming updates
      logger.debug('Incoming Telegram update', {
        updateType: ctx.updateType,
        userId: ctx.userId,
        chatId: ctx.chatId,
        messageText:
          ctx.message && 'text' in ctx.message ? ctx.message.text : 'N/A',
        callbackData:
          ctx.callbackQuery && 'data' in ctx.callbackQuery
            ? ctx.callbackQuery.data
            : 'N/A',
        hasMessage: !!ctx.message,
        hasCallbackQuery: !!ctx.callbackQuery,
        fromUsername: ctx.from?.username || 'N/A',
      });

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

      // Enhanced error logging for MarkdownV2 issues
      if (
        errorMessage.includes("can't parse entities") ||
        errorMessage.includes('Bad Request')
      ) {
        logger.error(
          'Telegram parsing error - likely MarkdownV2 escaping issue',
          {
            error: errorMessage,
            stack: errorStack,
            userId: ctx.userId,
            chatId: ctx.chatId,
            updateType: ctx.updateType,
            messageText:
              ctx.message && 'text' in ctx.message ? ctx.message.text : 'N/A',
            callbackData:
              ctx.callbackQuery && 'data' in ctx.callbackQuery
                ? ctx.callbackQuery.data
                : 'N/A',
            fromUsername: ctx.from?.username || 'N/A',
            chatType: ctx.chat?.type || 'N/A',
          }
        );

        // Log the current context state
        logger.error('Context state when error occurred', {
          contextKeys: Object.keys(ctx),
          hasMessage: !!ctx.message,
          hasCallbackQuery: !!ctx.callbackQuery,
          hasInlineQuery: !!ctx.inlineQuery,
          hasChosenInlineResult: !!ctx.chosenInlineResult,
        });
      }

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
        '� *Subscriptions:*',
        '/subscribe <channelId> - Subscribe to a channel',
        '/channels - List available channels (admin only)',
        '',
        '�🔧 *Developer Commands:*',
        '/dev - Show developer menu (admin only)',
        '/stats - Show bot statistics (admin only)',
        '/logs - Show recent logs (admin only)',
        '/reload - Reload configuration (admin only)',
        '',
        '📢 *Channel Management:*',
        '/push_url <channelId> - Get push URL for channel (admin only)',
        '/channel_create <name> <chatId> - Create new channel (admin only)',
        '/channel_delete <channelId> - Delete channel (admin only)',
        '',
        '🌐 *Server Management:*',
        '/server_start - Start HTTP server (admin only)',
        '/server_stop - Stop HTTP server (admin only)',
        '',
        '📨 *Notifications:*',
        'This bot receives notifications via webhook and SQS',
      ].join('\n');

      // Debug logging for help command
      logger.debug('Processing help command', {
        userId: ctx.userId,
        chatId: ctx.chatId,
        messageText:
          ctx.message && 'text' in ctx.message ? ctx.message.text : 'N/A',
        helpTextLength: helpText.length,
        helpTextPreview: helpText.substring(0, 200),
        fullHelpText: helpText,
      });

      // Properly escape the help text using escapeMarkdownV2
      const escapedHelpText = escapeMarkdownV2(helpText);

      // Log the escaped version for debugging
      logger.debug('Help text after escaping', {
        userId: ctx.userId,
        chatId: ctx.chatId,
        escapedTextLength: escapedHelpText.length,
        escapedTextPreview: escapedHelpText.substring(0, 200),
        fullEscapedText: escapedHelpText,
      });

      await ctx.replyWithMarkdownV2(escapedHelpText);
    });

    // Interactive menu command
    this.bot.command('menu', async ctx => {
      const isAdmin = this.developerService.isAdmin(ctx.from?.id);

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
          ...(isAdmin
            ? [
                [
                  { text: '🔧 Developer', callback_data: 'developer' },
                  { text: '📊 Stats', callback_data: 'bot_stats' },
                ],
                [
                  { text: '📢 Channels', callback_data: 'channels' },
                  { text: '🔗 Push URLs', callback_data: 'push_urls' },
                ],
                [
                  { text: '🌐 Server', callback_data: 'server_management' },
                  { text: '📝 Logs', callback_data: 'logs' },
                ],
              ]
            : []),
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
              escapeMarkdownV2('All systems operational!'),
            ].join('\n');

            // Debug logging for the status message
            logger.debug('Editing status message', {
              messageLength: statusMessage.length,
              messageContent: statusMessage,
              chatId: ctx.chatId,
              userId: ctx.userId,
            });

            // Log before attempting to edit message
            logger.debug('About to edit status message via callback', {
              userId: ctx.userId,
              chatId: ctx.chatId,
              messageLength: statusMessage.length,
              messageContent: statusMessage,
              callbackData: 'status',
            });

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
              escapeMarkdownV2('/start - Start the bot'),
              escapeMarkdownV2('/help - Full help message'),
              escapeMarkdownV2('/status - Check bot status'),
              escapeMarkdownV2('/menu - Show this menu'),
              '',
              bold('Features:'),
              escapeMarkdownV2('• Message logging and analysis'),
              escapeMarkdownV2('• Developer notifications'),
              escapeMarkdownV2('• AWS Lambda integration'),
              '',
              escapeMarkdownV2(
                'Need more help? Use /help for detailed commands.'
              ),
            ].join('\n');
            // Log before attempting to edit help message via callback
            logger.debug('About to edit help message via callback', {
              userId: ctx.userId,
              chatId: ctx.chatId,
              messageLength: helpMessage.length,
              messageContent: helpMessage,
              callbackData: 'help',
            });

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
              escapeMarkdownV2(
                'A modern TypeScript Telegram bot running on AWS Lambda.'
              ),
              '',
              bold('Built with:'),
              escapeMarkdownV2('• Telegraf.js'),
              escapeMarkdownV2('• TypeScript'),
              escapeMarkdownV2('• AWS Lambda'),
              escapeMarkdownV2('• Serverless Framework'),
              '',
              escapeMarkdownV2(
                'Created for efficient notification management and real-time messaging.'
              ),
            ].join('\n');
            // Log before attempting to edit about message via callback
            logger.debug('About to edit about message via callback', {
              userId: ctx.userId,
              chatId: ctx.chatId,
              messageLength: aboutMessage.length,
              messageContent: aboutMessage,
              callbackData: 'about',
            });

            await ctx.editMessageText(aboutMessage, {
              parse_mode: 'MarkdownV2',
            });
            break;
          }

          case 'back_to_menu': {
            await ctx.answerCbQuery();
            const isAdmin = this.developerService.isAdmin(ctx.from?.id);

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
                ...(isAdmin
                  ? [
                      [
                        { text: '🔧 Developer', callback_data: 'developer' },
                        { text: '📊 Stats', callback_data: 'bot_stats' },
                      ],
                      [
                        { text: '📢 Channels', callback_data: 'channels' },
                        { text: '🔗 Push URLs', callback_data: 'push_urls' },
                      ],
                      [
                        {
                          text: '🌐 Server',
                          callback_data: 'server_management',
                        },
                        { text: '📝 Logs', callback_data: 'logs' },
                      ],
                    ]
                  : []),
              ],
            };
            await ctx.editMessageText('🎛️ *Main Menu*\n\nChoose an option:', {
              parse_mode: 'MarkdownV2',
              reply_markup: backKeyboard,
            });
            break;
          }

          case 'developer': {
            await ctx.answerCbQuery();
            await this.developerService.handleDevCommand(ctx);
            break;
          }

          case 'bot_stats': {
            await ctx.answerCbQuery();
            await this.developerService.handleStatsCommand(ctx);
            break;
          }

          case 'channels': {
            await ctx.answerCbQuery();
            await this.developerService.handleChannelsCommand(ctx);
            break;
          }

          case 'push_urls': {
            await ctx.answerCbQuery();
            const pushUrlsKeyboard = {
              inline_keyboard: [
                [
                  {
                    text: '📝 Enter Channel ID',
                    callback_data: 'push_url_input',
                  },
                ],
                [{ text: '⬅️ Back to Menu', callback_data: 'back_to_menu' }],
              ],
            };
            await ctx.editMessageText(
              '🔗 *Push URL Management*\n\n' +
                escapeMarkdownV2(
                  'To get a push URL, use:\n/push_url <channelId>\n\nExample: /push_url alerts'
                ),
              {
                parse_mode: 'MarkdownV2',
                reply_markup: pushUrlsKeyboard,
              }
            );
            break;
          }

          case 'server_management': {
            await ctx.answerCbQuery();
            const serverKeyboard = {
              inline_keyboard: [
                [
                  { text: '🚀 Server Status', callback_data: 'server_status' },
                  {
                    text: '⏹️ Server Control',
                    callback_data: 'server_control',
                  },
                ],
                [{ text: '⬅️ Back to Menu', callback_data: 'back_to_menu' }],
              ],
            };
            await ctx.editMessageText(
              '🌐 *Server Management*\n\n' +
                'Manage the HTTP server for message pushing:',
              {
                parse_mode: 'MarkdownV2',
                reply_markup: serverKeyboard,
              }
            );
            break;
          }

          case 'server_status': {
            await ctx.answerCbQuery();
            await this.developerService.handleServerStartCommand(ctx);
            break;
          }

          case 'server_control': {
            await ctx.answerCbQuery();
            const controlKeyboard = {
              inline_keyboard: [
                [
                  { text: '🚀 Start Server', callback_data: 'start_server' },
                  { text: '⏹️ Stop Server', callback_data: 'stop_server' },
                ],
                [
                  {
                    text: '⬅️ Back to Server Menu',
                    callback_data: 'server_management',
                  },
                ],
              ],
            };
            await ctx.editMessageText(
              '🎛️ *Server Control*\n\n' + 'Choose an action:',
              {
                parse_mode: 'MarkdownV2',
                reply_markup: controlKeyboard,
              }
            );
            break;
          }

          case 'start_server': {
            await ctx.answerCbQuery();
            await this.developerService.handleServerStartCommand(ctx);
            break;
          }

          case 'stop_server': {
            await ctx.answerCbQuery();
            await this.developerService.handleServerStopCommand(ctx);
            break;
          }

          case 'logs': {
            await ctx.answerCbQuery();
            await this.developerService.handleLogsCommand(ctx);
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

      // Debug logging for status command
      logger.debug('Processing status command', {
        userId: ctx.userId,
        chatId: ctx.chatId,
        statusTextLength: statusText.length,
        statusTextContent: statusText,
      });

      const escapedStatusText = statusText.replace(/[-.()]/g, '\\$&');

      // Log escaped version
      logger.debug('Status text after escaping', {
        userId: ctx.userId,
        chatId: ctx.chatId,
        escapedLength: escapedStatusText.length,
        escapedContent: escapedStatusText,
      });

      await ctx.replyWithMarkdownV2(escapedStatusText);
    });

    // Developer commands
    this.bot.command('dev', ctx => this.developerService.handleDevCommand(ctx));
    this.bot.command('stats', ctx =>
      this.developerService.handleStatsCommand(ctx)
    );
    this.bot.command('logs', ctx =>
      this.developerService.handleLogsCommand(ctx)
    );
    this.bot.command('reload', ctx =>
      this.developerService.handleReloadCommand(ctx)
    );
    this.bot.command('channels', ctx =>
      this.developerService.handleChannelsCommand(ctx)
    );
    this.bot.command('push_url', ctx =>
      this.developerService.handlePushUrlCommand(ctx)
    );
    this.bot.command('channel_create', ctx =>
      this.developerService.handleChannelCreateCommand(ctx)
    );
    this.bot.command('channel_delete', ctx =>
      this.developerService.handleChannelDeleteCommand(ctx)
    );
    this.bot.command('server_start', ctx =>
      this.developerService.handleServerStartCommand(ctx)
    );
    this.bot.command('server_stop', ctx =>
      this.developerService.handleServerStopCommand(ctx)
    );

    // User commands (non-admin)
    this.bot.command('subscribe', ctx =>
      this.developerService.handleSubscribeCommand(ctx)
    );
    this.bot.command('unsubscribe', ctx =>
      this.developerService.handleUnsubscribeCommand(ctx)
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
      // Add debug logging for the message content
      logger.debug('Sending notification', {
        chatId,
        textLength: text.length,
        textPreview: text.substring(0, 100),
        parseMode: options.parse_mode,
        hasMarkdownV2: options.parse_mode === 'MarkdownV2',
      });

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
        parseMode: options.parse_mode,
        fullText: text, // Log full text to see what caused the error
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

  public async start(): Promise<void> {
    try {
      logger.info('Starting Telegram bot...');
      await this.bot.launch();
      logger.info('Telegram bot started successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start Telegram bot', { error: errorMessage });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      logger.info('Stopping Telegram bot...');
      this.bot.stop();
      logger.info('Telegram bot stopped');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to stop Telegram bot', { error: errorMessage });
    }
  }
}
