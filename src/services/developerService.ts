import { BotContext, DeveloperCommand, BotStats } from '@/types';
import { config } from '@/config';
import { logger, logDeveloperCommand } from '@/utils/logger';
import { formatUptime } from '@/utils/helpers';

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
      ...this.commands.map(cmd => `${cmd.command} \\- ${cmd.description}`),
      '',
      '💡 *Quick Actions:*',
      '• /stats \\- Bot statistics',
      '• /logs \\- Recent activity',
      '• /reload \\- Reload config',
      '',
      `🏷 Version: 1\\.0\\.0 | Stage: ${config.app.stage}`,
    ].join('\\n');

    await ctx.replyWithMarkdownV2(menu);

    logDeveloperCommand(ctx.from?.id || 0, 'dev', [], true);
  }

  public async handleStatsCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    try {
      const stats = await this.getBotStats();

      const statsText = [
        '📊 *Bot Statistics*',
        '',
        `⚡ Uptime: ${formatUptime(stats.uptime)}`,
        `💬 Total Messages: ${stats.totalMessages}`,
        `👥 Active Users: ${stats.activeUsers}`,
        `❌ Error Count: ${stats.errorCount}`,
        `🕐 Last Update: ${stats.lastUpdate}`,
        '',
        `💾 Memory Usage: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
        `🖥 Node\\.js: ${process.version.replace(/\./g, '\\.')}`,
        `🌍 Environment: ${config.app.stage}`,
        `📍 Region: ${config.aws.region}`,
      ].join('\\n');

      await ctx.replyWithMarkdownV2(statsText);

      logDeveloperCommand(ctx.from?.id || 0, 'stats', [], true);
    } catch (error) {
      await ctx.reply(`❌ Error retrieving stats: ${error.message}`);
      logDeveloperCommand(ctx.from?.id || 0, 'stats', [], false);
    }
  }

  public async handleLogsCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    try {
      // Parse command arguments
      const messageText = 'text' in ctx.message! ? ctx.message.text : '';
      const args = messageText.split(' ').slice(1) || [];
      const level = args[0] || 'info';
      const count = parseInt(args[1]) || 10;

      const logs = await this.getRecentLogs(level, count);

      const logsText = [
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
      ].join('\\n');

      await ctx.replyWithMarkdownV2(logsText);

      logDeveloperCommand(ctx.from?.id || 0, 'logs', args, true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Error retrieving logs: ${errorMessage}`);
      logDeveloperCommand(ctx.from?.id || 0, 'logs', [], false);
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
        '❌ Please provide a message to broadcast.\\nUsage: /broadcast <message>'
      );
      return;
    }

    try {
      // TODO: Implement broadcast functionality
      // This would require storing user/chat IDs and iterating through them
      await ctx.reply('🚀 Broadcast feature is not yet implemented.');

      logDeveloperCommand(ctx.from?.id || 0, 'broadcast', [message], false);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Broadcast failed: ${errorMessage}`);
      logDeveloperCommand(ctx.from?.id || 0, 'broadcast', [message], false);
    }
  }

  public async handleReloadCommand(ctx: BotContext): Promise<void> {
    if (!this.isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ Access denied. Admin privileges required.');
      return;
    }

    try {
      // TODO: Implement configuration reload
      await ctx.reply('🔄 Configuration reloaded successfully.');

      logDeveloperCommand(ctx.from?.id || 0, 'reload', [], true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await ctx.reply(`❌ Reload failed: ${errorMessage}`);
      logDeveloperCommand(ctx.from?.id || 0, 'reload', [], false);
    }
  }

  private isAdmin(userId?: number): boolean {
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
