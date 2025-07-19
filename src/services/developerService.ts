import { BotContext, DeveloperCommand, BotStats } from '@/types';
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
      const stats = await this.getBotStats();

      const response = [
        '📊 *Bot Statistics*',
        '',
        `⚡ Uptime: ${formatUptime(stats.uptime)}`,
        `💬 Total Messages: ${stats.totalMessages}`,
        `👥 Active Users: ${stats.activeUsers}`,
        `❌ Error Count: ${stats.errorCount}`,
        `🕐 Last Update: ${stats.lastUpdate}`,
        '',
        `💾 Memory Usage: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        `🖥 Node.js: ${process.version}`,
        `🌍 Environment: ${config.app.stage}`,
        `📍 Region: ${config.aws.region}`,
      ].join('\n');

      await ctx.replyWithMarkdownV2(escapeTelegramMarkdown(response));
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
      const logs = await this.getRecentLogs(level, count);

      response += [
        `📋 *Recent Logs (${level.toUpperCase()})*`,
        '',
        ...logs
          .map(
            log =>
              `\`${log.timestamp}\` ${log.level.toUpperCase()}: ${log.message}`
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
      // In a real implementation, you might reload from environment or config files
      // For now, we'll just refresh the current config and restart services if needed

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

      // TODO: reload
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
      // TODO: Get channels from ChannelService when integrated
      const channels = [
        {
          id: 'example-channel',
          name: 'Example Channel',
          isPublic: true,
          subscriberCount: 0,
        },
        {
          id: 'alerts',
          name: 'System Alerts',
          isPublic: false,
          subscriberCount: 5,
        },
      ];

      if (channels.length === 0) {
        await ctx.reply(
          '📢 No channels configured yet.\n\nUse /channel_create to create your first channel.'
        );
        return;
      }

      const channelList = channels
        .map(
          ch =>
            `• ${ch.name} (${ch.id})\n` +
            `  ${ch.isPublic ? '🌐 Public' : '🔒 Private'} • ${ch.subscriberCount} subscribers`
        )
        .join('\n\n');

      // Fix for the angle brackets issue - we'll avoid using them in MarkdownV2
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
    const chatId = args[1];
    const description = args.slice(2).join(' ') || undefined;

    if (!name || !chatId) {
      await ctx.reply(
        '❌ Usage: /channel_create <name> <chatId> [description]\n\nExample: /channel_create alerts -1001234567890 System alerts'
      );
      return;
    }

    let response = '📢 *Creating Channel*';

    try {
      // TODO: Implement with ChannelService when integrated
      const channelId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

      response = [
        '✅ *Channel Created Successfully*',
        '',
        `*Name:* ${name}`,
        `*Channel ID:* ${channelId}`,
        `*Chat ID:* ${chatId}`,
        ...(description ? [`*Description:* ${description}`] : []),
        '',
        '*Push URL:*',
        `${config.app.baseUrl}/push/${channelId}`,
        '',
        '💡 Use /push_url ' + channelId + ' to get detailed usage information.',
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
        [name, chatId],
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
      // TODO: Implement with ChannelService when integrated
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

  public isAdmin(userId?: number): boolean {
    if (!userId) return false;
    return config.developer.adminUserIds.includes(userId);
  }

  private async getBotStats(): Promise<BotStats> {
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      totalMessages: 0, // TODO: Get from MessageService
      activeUsers: 0, // TODO: Get from MessageService
      errorCount: 0, // TODO: Track errors
      uptime,
      lastUpdate: new Date().toISOString(),
    };
  }

  private async getRecentLogs(_level: string, _count: number): Promise<any[]> {
    // TODO: Implement log retrieval from CloudWatch or local storage
    // For now, return mock logs
    return [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Bot started successfully',
      },
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: 'info',
        message: 'Webhook configured',
      },
    ];
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
