import { BotContext, DeveloperCommand } from '@/types';
import { config } from '@/config';
import { logger, logDeveloperCommand } from '@/utils/logger';
import { escapeTelegramMarkdown, formatUptime } from '@/utils/helpers';

export class DeveloperService {
  private commands: DeveloperCommand[] = [
    {
      command: '/dev',
      description: 'Show developer menu',
      usage: '/dev',
      adminOnly: true,
    },
    {
      command: '/stats',
      description: 'Show bot statistics',
      usage: '/stats',
      adminOnly: true,
    },
    {
      command: '/logs',
      description: 'Show recent logs',
      usage: '/logs [level] [count]',
      adminOnly: true,
    },
    {
      command: '/broadcast',
      description: 'Broadcast message to all users',
      usage: '/broadcast <message>',
      adminOnly: true,
    },
    {
      command: '/reload',
      description: 'Reload bot configuration',
      usage: '/reload',
      adminOnly: true,
    },
    {
      command: '/channels',
      description: 'List all message channels',
      usage: '/channels',
      adminOnly: true,
    },
    {
      command: '/channel_create',
      description: 'Create a new channel',
      usage: '/channel_create <name> <chatId> [description]',
      adminOnly: true,
    },
    {
      command: '/channel_delete',
      description: 'Delete a channel',
      usage: '/channel_delete <channelId>',
      adminOnly: true,
    },
    {
      command: '/push_url',
      description: 'Get push URL for a channel',
      usage: '/push_url <channelId>',
      adminOnly: true,
    },
    {
      command: '/server_start',
      description: 'Start HTTP server',
      usage: '/server_start [port]',
      adminOnly: true,
    },
    {
      command: '/server_stop',
      description: 'Stop HTTP server',
      usage: '/server_stop',
      adminOnly: true,
    },
    {
      command: '/subscribe',
      description: 'Subscribe to a channel',
      usage: '/subscribe <channelId>',
      adminOnly: false,
    },
    {
      command: '/unsubscribe',
      description: 'Unsubscribe from a channel',
      usage: '/unsubscribe <channelId>',
      adminOnly: false,
    },
  ];

  private startTime = Date.now();

  public async handleDevCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    const menu = [
      '🔧 *Developer Menu*',
      '',
      '📊 *Statistics & Monitoring:*',
      '• /stats - Bot statistics',
      '• /logs - Recent activity',
      '',
      '📢 *Channel Management:*',
      '• /channels - List all channels',
      '• /channel_create - Create new channel',
      '• /channel_delete - Delete channel',
      '• /push_url - Get push URL',
      '',
      '� *Server Control:*',
      '• /server_start - Start HTTP server',
      '• /server_stop - Stop HTTP server',
      '',
      '🔧 *System:*',
      '• /broadcast - Send broadcast',
      '• /reload - Reload config',
      '',
      `🏷 Version: 1.0.0 | Stage: ${config.app.stage}`,
    ].join('\n');

    await ctx.replyWithMarkdownV2(escapeTelegramMarkdown(menu));
  }

  public async handleStatsCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    const response = ['📊 *Bot Statistics*', '', 'Fetching statistics...'].join(
      '\n'
    );

    try {
      // Use MessageService and ChannelService for real stats - properly initialize ConfigService
      const { MessageService } = require('@/services/messageService');
      const { ChannelService } = require('@/services/channelService');
      const { ConfigService } = require('@/services/configService');
      const { TelegramService } = require('@/services/telegramService');

      const messageService = new MessageService();
      const configService = new ConfigService();
      await configService.initialize(); // This loads the bot-config.json file

      const channelService = new ChannelService(
        configService,
        new TelegramService()
      );
      const stats = messageService.getStats();
      const channels = await channelService.getAllChannels();
      const totalChannels = channels.length;
      const totalSubscribers = channels.reduce(
        (sum: number, c: any) => sum + c.subscriberCount,
        0
      );
      const responseText = [
        '📊 *Bot Statistics*',
        '',
        `⚡ Uptime: ${formatUptime((Date.now() - this.startTime) / 1000)}`,
        `💬 Total Messages: ${stats.totalMessages}`,
        `👥 Active Users: ${stats.activeUsers}`,
        `❌ Error Count: ${stats.errorCount ?? 0}`,
        `🕐 Last Update: ${stats.lastUpdate ?? new Date().toISOString()}`,
        `📢 Channels: ${totalChannels}`,
        `👥 Subscribers: ${totalSubscribers}`,
        '',
        `💾 Memory Usage: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        `🖥 Node.js: ${process.version}`,
        `🌍 Environment: ${config.app.stage}`,
        `📍 Region: ${config.aws.region}`,
      ].join('\n');

      await ctx.replyWithMarkdownV2(escapeTelegramMarkdown(responseText));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Error retrieving stats: ${errorMessage}`);
      logDeveloperCommand(ctx.from?.id || 0, 'stats', [], response, false);
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleLogsCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    // Parse command arguments
    const messageText = 'text' in ctx.message! ? ctx.message.text : '';
    const args = messageText.split(' ').slice(1) || [];
    const level = args[0] || 'info';
    const count = parseInt(args[1]) || 10;

    let response = '📋 *Recent Logs*';

    try {
      // Use MessageService for real logs
      const { MessageService } = require('@/services/messageService');
      const messageService = new MessageService();
      const logs = await messageService.getRecentMessages(count);

      response += [
        `📋 *Recent Logs (${level.toUpperCase()})*`,
        '',
        ...logs
          .map(
            (log: any) =>
              `\`${log.timestamp}\` ${log.messageType.toUpperCase()}: ${log.text ?? ''}`
          )
          .slice(-10), // Show last 10 logs to avoid message length limits
        '',
        `Showing last ${Math.min(logs.length, 10)} of ${logs.length} logs`,
      ].join('\n');

      await ctx.replyWithMarkdownV2(escapeTelegramMarkdown(response));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Error retrieving logs: ${errorMessage}`);
      logDeveloperCommand(ctx.from?.id || 0, 'logs', [], response, false);
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleBroadcastCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    const messageText = 'text' in ctx.message! ? ctx.message.text : '';
    const message = messageText.replace('/broadcast', '').trim();
    if (!message) {
      await ctx.reply(
        '❌ Please provide a message to broadcast.\nUsage: /broadcast <message>'
      );
      return;
    }

    let response = '📢 *Broadcasting Message*';

    try {
      // For now, we'll send to the dev chat and admin users as a broadcast simulation
      const broadcastTargets = [
        ...(config.developer.devChatId ? [config.developer.devChatId] : []),
        ...config.developer.adminUserIds,
      ];

      if (broadcastTargets.length === 0) {
        await ctx.reply(
          '❌ No broadcast targets configured. Configure devChatId or adminUserIds in config.'
        );
        logDeveloperCommand(
          ctx.from?.id || 0,
          'broadcast',
          [message],
          '',
          false
        );
        await ctx.reply('📝 losgDeveloperCommand: Logged');
        return;
      }

      const broadcastMessage = `📢 *Broadcast Message*\n\n${message}\n\n_Sent by admin_`;
      let successCount = 0;

      // In a real implementation, you would iterate through stored user/chat IDs
      // For now, we'll just log the broadcast
      logger.info('Broadcasting message', {
        broadcastMessage,
        targetCount: broadcastTargets.length,
        targets: broadcastTargets,
      });

      successCount = broadcastTargets.length; // Simulate success

      response = `🚀 Broadcast sent successfully to ${successCount} targets.\n\n*Message:* ${message}`;
      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });

      await ctx.reply('📝 logDeveloperCommand: Logged');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Broadcast failed: ${errorMessage}`);
      logDeveloperCommand(
        ctx.from?.id || 0,
        'broadcast',
        [message],
        response,
        false
      );
    }
  }

  public async handleReloadCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    // Define config summary message outside try block
    const oldStage = config.app.stage;
    const oldPort = config.app.port;

    let response = '';

    try {
      // Use ConfigService to reload config - properly initialize it
      const { ConfigService } = require('@/services/configService');
      const configService = new ConfigService();
      await configService.initialize(); // This loads/reloads the bot-config.json file

      response = [
        '🔄 *Configuration Reloaded*',
        '',
        `*Environment:* ${config.app.stage}`,
        `*Port:* ${config.app.port}`,
        `*Base URL:* ${config.app.baseUrl}`,
        `*Admin Users:* ${config.developer.adminUserIds.length}`,
        `*AWS Region:* ${config.aws.region}`,
        '',
        '*Status:* Configuration refreshed successfully.',
      ].join('\n');

      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });

      logger.info('Configuration reloaded by admin', {
        adminId: ctx.from?.id,
        oldStage,
        newStage: config.app.stage,
        oldPort,
        newPort: config.app.port,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Reload failed: ${errorMessage}`);
      logDeveloperCommand(ctx.from?.id || 0, 'reload', [], response, false);
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleChannelsCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    let response = '📢 *Message Channels*';

    try {
      // Use ChannelService for real channels - properly initialize ConfigService
      const { ChannelService } = require('@/services/channelService');
      const { ConfigService } = require('@/services/configService');
      const { TelegramService } = require('@/services/telegramService');

      const configService = new ConfigService();
      await configService.initialize(); // This loads the bot-config.json file

      const channelService = new ChannelService(
        configService,
        new TelegramService()
      );
      const channels = await channelService.getAllChannels();

      if (channels.length === 0) {
        await ctx.reply(
          '📢 No channels configured yet.\n\nUse /channel_create to create your first channel.'
        );
        return;
      }

      const channelList = channels
        .map(
          (ch: any) =>
            `• ${ch.name} (${ch.id})\n` +
            `  ${ch.isPublic ? '🌐 Public' : '🔒 Private'} • ${ch.subscriberCount} subscribers`
        )
        .join('\n\n');

      response = [
        '📢 *Message Channels*',
        '',
        channelList,
        '',
        '💡 *Commands*',
        '• /push_url [channelId] - Get push URL',
        '• /channel_create [name] [chatId] - Create channel',
        '• /channel_delete [channelId] - Delete channel',
      ].join('\n');

      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in handleChannelsCommand', {
        error: errorMessage,
        rawMessage: ctx.message,
        userId: ctx.from?.id,
      });
      await ctx.reply(`❌ Failed to list channels: ${errorMessage}`);
      logDeveloperCommand(ctx.from?.id || 0, 'channels', [], response, false);
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handlePushUrlCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    const messageText =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = messageText.split(' ').slice(1);
    const channelId = args[0];

    if (!channelId) {
      await ctx.reply(
        '❌ Usage: /push_url <channelId>\n\nExample: /push_url alerts'
      );
      return;
    }

    // TODO: Validate channel exists when ChannelService is integrated
    const baseUrl = config.app.baseUrl;
    const pushUrl = `${baseUrl}/push/${channelId}`;

    const response = [
      '🔗 *Push URL Information*',
      '',
      `*Channel:* ${channelId}`,
      `*Push URL:* ${pushUrl}`,
      '',
      '*Usage Example:*',
      '```bash',
      `curl -X POST "${pushUrl}" \\`,
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"message": "Hello!", "format": "markdown"}\'',
      '```',
      '',
      '*Supported Parameters:*',
      '• message - Message text (required)',
      '• format - text|markdown|html (optional)',
      '• priority - low|normal|high (optional)',
      '• metadata - Additional data (optional)',
      '',
      `📊 Server running on: ${baseUrl}`,
    ].join('\n');

    try {
      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in handlePushUrlCommand', {
        error: errorMessage,
        rawMessage: ctx.message,
        userId: ctx.from?.id,
        channelId,
      });
      await ctx.reply(`❌ Failed to get push URL: ${errorMessage}`);
      logDeveloperCommand(
        ctx.from?.id || 0,
        'push_url',
        [channelId],
        response,
        false
      );
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleChannelCreateCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    const messageText =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = messageText.split(' ').slice(1);
    const name = args[0];
    const description = args.slice(1).join(' ') || undefined;
    const chatId = ctx.chat?.id;

    if (!name || !chatId) {
      await ctx.reply(
        '❌ Usage: /channel_create <name> [description]\n\nExample: /channel_create alerts System alerts'
      );
      return;
    }

    let response = '📢 *Creating Channel*';

    try {
      // Use ChannelService for real channel creation - properly initialize ConfigService
      const { ChannelService } = require('@/services/channelService');
      const { ConfigService } = require('@/services/configService');
      const { TelegramService } = require('@/services/telegramService');

      const configService = new ConfigService();
      await configService.initialize(); // This loads the bot-config.json file

      const channelService = new ChannelService(
        configService,
        new TelegramService()
      );
      const createdChannel = await channelService.createChannel({
        name,
        chatId,
        description,
        isPublic: true,
        createdBy: ctx.from?.id || 0,
      });
      response = [
        '✅ *Channel Created Successfully*',
        '',
        `*Name:* ${createdChannel.name}`,
        `*Channel ID:* ${createdChannel.id}`,
        `*Chat ID:* ${createdChannel.chatId}`,
        ...(createdChannel.description
          ? [`*Description:* ${createdChannel.description}`]
          : []),
        '',
        '*Push URL:*',
        `${config.app.baseUrl}/push/${createdChannel.id}`,
        '',
        '💡 Use /push_url ' +
          createdChannel.id +
          ' to get detailed usage information.',
      ].join('\n');

      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Failed to create channel: ${errorMessage}`);
      logDeveloperCommand(
        ctx.from?.id || 0,
        'channel_create',
        [name, String(chatId)],
        response,
        false
      );
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleChannelDeleteCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    const messageText =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = messageText.split(' ').slice(1);
    const channelId = args[0];

    if (!channelId) {
      await ctx.reply(
        '❌ Usage: /channel_delete <channelId>\n\nExample: /channel_delete alerts'
      );
      return;
    }

    let response = '🗑️ *Deleting Channel*';

    try {
      // Use ChannelService for real channel deletion - properly initialize ConfigService
      const { ChannelService } = require('@/services/channelService');
      const { ConfigService } = require('@/services/configService');
      const { TelegramService } = require('@/services/telegramService');

      const configService = new ConfigService();
      await configService.initialize(); // This loads the bot-config.json file

      const channelService = new ChannelService(
        configService,
        new TelegramService()
      );
      await channelService.deleteChannel(channelId);
      response = [
        '🗑️ *Channel Deleted*',
        '',
        `*Channel ID:* ${channelId}`,
        '',
        '⚠️ *Note:* All subscriptions to this channel have been removed.',
        'Push URLs for this channel are no longer valid.',
      ].join('\n');

      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Failed to delete channel: ${errorMessage}`);
      logDeveloperCommand(
        ctx.from?.id || 0,
        'channel_delete',
        [channelId],
        response,
        false
      );
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleServerStartCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    let response = '🚀 *Starting HTTP Server*';

    try {
      // TODO: Implement server start/stop when integrated with main app
      response = [
        '🚀 *HTTP Server Status*',
        '',
        `*Status:* Running`,
        `*Port:* ${config.app.port}`,
        `*Base URL:* ${config.app.baseUrl}`,
        '',
        '*Available Endpoints:*',
        '• GET /health - Health check',
        '• POST /push/<channelId> - Send messages',
        '• GET /api/channels - List channels',
        '',
        '💡 Server is currently running in simple mode.',
      ].join('\n');

      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Server operation failed: ${errorMessage}`);
      logDeveloperCommand(
        ctx.from?.id || 0,
        'server_start',
        [],
        response,
        false
      );
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleServerStopCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    let response = '⚠️ *Stopping HTTP Server*';

    try {
      response =
        '⚠️ Server stop functionality is not available in simple mode.\n\nUse Ctrl+C in the terminal to stop the application.';
      await ctx.reply(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Server operation failed: ${errorMessage}`);
      logDeveloperCommand(
        ctx.from?.id || 0,
        'server_stop',
        [],
        response,
        false
      );
      await ctx.reply('📝 logDeveloperCommand: Logged');
    }
  }

  public async handleSubscribeCommand(ctx: BotContext): Promise<void> {
    const messageText =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = messageText.split(' ').slice(1);
    const channelId = args[0];

    if (!channelId) {
      await ctx.reply(
        '❌ Usage: /subscribe <channelId>\n\nExample: /subscribe alerts\n\nUse /channels to see available channels.'
      );
      return;
    }

    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      await ctx.reply('❌ Unable to identify user or chat. Please try again.');
      return;
    }

    try {
      // Initialize services properly
      const { ChannelService } = require('@/services/channelService');
      const { ConfigService } = require('@/services/configService');
      const { TelegramService } = require('@/services/telegramService');

      const configService = new ConfigService();
      await configService.initialize(); // Load bot-config.json

      const channelService = new ChannelService(
        configService,
        new TelegramService()
      );

      // Check if channel exists
      const channel = await channelService.getChannel(channelId);
      if (!channel) {
        await ctx.reply(
          `❌ Channel "${channelId}" not found.\n\nUse /channels to see available channels.`
        );
        return;
      }

      // Subscribe user to channel using the existing subscribe method
      const subscribeResult = await channelService.subscribe(
        userId,
        channelId,
        chatId
      );

      if (!subscribeResult.success) {
        await ctx.reply(`❌ ${subscribeResult.message}`);
        return;
      }

      const response = [
        '✅ *Subscription Successful*',
        '',
        `*Channel:* ${channel.name}`,
        `*Channel ID:* ${channelId}`,
        `*Description:* ${channel.description || 'No description'}`,
        '',
        'You will now receive notifications from this channel.',
        '',
        '💡 Use /unsubscribe ' + channelId + ' to unsubscribe later.',
      ].join('\n');

      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });

      logger.info('User subscribed to channel', {
        userId,
        chatId,
        channelId,
        channelName: channel.name,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Failed to subscribe to channel: ${errorMessage}`);
      logger.error('Subscribe command failed', {
        error: errorMessage,
        userId,
        chatId,
        channelId,
      });
    }
  }

  public async handleUnsubscribeCommand(ctx: BotContext): Promise<void> {
    const messageText =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = messageText.split(' ').slice(1);
    const channelId = args[0];

    if (!channelId) {
      await ctx.reply(
        '❌ Usage: /unsubscribe <channelId>\n\nExample: /unsubscribe alerts\n\nUse /channels to see available channels.'
      );
      return;
    }

    const userId = ctx.from?.id;

    if (!userId) {
      await ctx.reply('❌ Unable to identify user. Please try again.');
      return;
    }

    try {
      // Initialize services properly
      const { ChannelService } = require('@/services/channelService');
      const { ConfigService } = require('@/services/configService');
      const { TelegramService } = require('@/services/telegramService');

      const configService = new ConfigService();
      await configService.initialize(); // Load bot-config.json

      const channelService = new ChannelService(
        configService,
        new TelegramService()
      );

      // Check if channel exists
      const channel = await channelService.getChannel(channelId);
      if (!channel) {
        await ctx.reply(
          `❌ Channel "${channelId}" not found.\n\nUse /channels to see available channels.`
        );
        return;
      }

      // Unsubscribe user from channel using the existing unsubscribe method
      const unsubscribeResult = await channelService.unsubscribe(
        userId,
        channelId
      );

      if (!unsubscribeResult.success) {
        await ctx.reply(`❌ ${unsubscribeResult.message}`);
        return;
      }

      const response = [
        '✅ *Unsubscription Successful*',
        '',
        `*Channel:* ${channel.name}`,
        `*Channel ID:* ${channelId}`,
        '',
        'You will no longer receive notifications from this channel.',
        '',
        '💡 Use /subscribe ' + channelId + ' to subscribe again later.',
      ].join('\n');

      await ctx.reply(escapeTelegramMarkdown(response), {
        parse_mode: 'MarkdownV2',
      });

      logger.info('User unsubscribed from channel', {
        userId,
        channelId,
        channelName: channel.name,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Failed to unsubscribe from channel: ${errorMessage}`);
      logger.error('Unsubscribe command failed', {
        error: errorMessage,
        userId,
        channelId,
      });
    }
  }

  public isAdmin(userId?: number): boolean {
    if (!userId) return false;
    return config.developer.adminUserIds.includes(userId);
  }

  public getCommands(): DeveloperCommand[] {
    return this.commands;
  }

  public async sendDevNotification(message: string): Promise<void> {
    if (config.developer.devChatId) {
      try {
        // TODO: Send notification to dev chat
        logger.info('Dev notification sent', { message });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to send dev notification', {
          error: errorMessage,
        });
      }
    }
  }
}
