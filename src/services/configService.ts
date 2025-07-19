import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@/utils/logger';
import { Channel, ChannelSubscription } from '@/services/channelService';

export interface BotConfig {
  channels?: Channel[];
  channelSubscriptions?: ChannelSubscription[];
  settings?: {
    defaultFormat?: 'text' | 'markdown' | 'html';
    maxMessageLength?: number;
    rateLimitPerUser?: number;
    allowGuestAccess?: boolean;
  };
  stats?: {
    totalMessages?: number;
    totalUsers?: number;
    startedAt?: string;
    successfulPushes?: number;
    failedPushes?: number;
    averageResponseTime?: number;
    lastPushTime?: string;
  };
}

export class ConfigService {
  private configPath: string;
  private config: BotConfig = {};
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(configPath: string = './config/bot-config.json') {
    this.configPath = path.resolve(configPath);
  }

  async initialize(): Promise<void> {
    try {
      await this.ensureConfigDirectory();
      await this.loadConfig();
      logger.info('ConfigService initialized', { configPath: this.configPath });
    } catch (error) {
      logger.error('Failed to initialize ConfigService', { error });
      throw error;
    }
  }

  async getConfig(): Promise<BotConfig> {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<BotConfig>): Promise<void> {
    try {
      this.config = {
        ...this.config,
        ...updates,
      };

      // Debounce save operations
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }

      this.saveTimeout = setTimeout(async () => {
        await this.saveConfig();
        this.saveTimeout = null;
      }, 1000);
    } catch (error) {
      logger.error('Failed to update config', { error });
      throw error;
    }
  }

  async resetConfig(): Promise<void> {
    try {
      this.config = {
        channels: [],
        channelSubscriptions: [],
        settings: {
          defaultFormat: 'markdown',
          maxMessageLength: 4096,
          rateLimitPerUser: 10,
          allowGuestAccess: false,
        },
        stats: {
          totalMessages: 0,
          totalUsers: 0,
          startedAt: new Date().toISOString(),
        },
      };

      await this.saveConfig();
      logger.info('Config reset to defaults');
    } catch (error) {
      logger.error('Failed to reset config', { error });
      throw error;
    }
  }

  async backup(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.configPath}.backup.${timestamp}`;

      await fs.copyFile(this.configPath, backupPath);
      logger.info('Config backed up', { backupPath });

      return backupPath;
    } catch (error) {
      logger.error('Failed to backup config', { error });
      throw error;
    }
  }

  async restore(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.configPath);
      await this.loadConfig();
      logger.info('Config restored from backup', { backupPath });
    } catch (error) {
      logger.error('Failed to restore config', { backupPath, error });
      throw error;
    }
  }

  private async ensureConfigDirectory(): Promise<void> {
    const configDir = path.dirname(this.configPath);
    try {
      await fs.access(configDir);
    } catch {
      await fs.mkdir(configDir, { recursive: true });
      logger.info('Created config directory', { configDir });
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);
      logger.debug('Config loaded from file');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, create default
        await this.resetConfig();
        logger.info('Created default config file');
      } else {
        logger.error('Failed to load config file', { error });
        throw error;
      }
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, configData, 'utf-8');
      logger.debug('Config saved to file');
    } catch (error) {
      logger.error('Failed to save config file', { error });
      throw error;
    }
  }

  // Utility methods for common operations
  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const settings = this.config.settings || {};
    return (settings as any)[key] ?? defaultValue;
  }

  async updateSetting(key: string, value: any): Promise<void> {
    const settings = this.config.settings || {};
    await this.updateConfig({
      settings: {
        ...settings,
        [key]: value,
      },
    });
  }

  async incrementStat(key: string, increment: number = 1): Promise<void> {
    const stats = this.config.stats || {};
    const currentValue = (stats as any)[key] || 0;
    await this.updateConfig({
      stats: {
        ...stats,
        [key]: currentValue + increment,
      },
    });
  }

  async getStats(): Promise<Record<string, any>> {
    return this.config.stats || {};
  }
}
