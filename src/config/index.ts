import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import path from 'path';
import WeChatBot, { WeChatBotConfig, createWeChatBot } from '../services/wechat-bot';
import { DeribitConfig } from '../types';

// Load environment variables
dotenv.config();

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: DeribitConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(): DeribitConfig {
    if (this.config) {
      return this.config;
    }

    try {
      const configPath = process.env.API_KEY_FILE || './config/apikeys.yml';
      const fullPath = path.resolve(configPath);
      const fileContents = readFileSync(fullPath, 'utf8');
      this.config = load(fileContents) as DeribitConfig;

      if (!this.config || !this.config.accounts || this.config.accounts.length === 0) {
        throw new Error('Invalid configuration: No accounts found');
      }

      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public getEnabledAccounts() {
    const config = this.loadConfig();
    return config.accounts.filter(account => account.enabled);
  }

  public getAccountByName(name: string) {
    const config = this.loadConfig();
    return config.accounts.find(account => account.name === name);
  }

  public getApiBaseUrl(): string {
    const useTestEnvironment = process.env.USE_TEST_ENVIRONMENT === 'true';
    if (useTestEnvironment) {
      return process.env.DERIBIT_TEST_API_URL || 'https://test.deribit.com/api/v2';
    }
    return process.env.DERIBIT_API_URL || 'https://www.deribit.com/api/v2';
  }

  public getWebSocketUrl(): string {
    const useTestEnvironment = process.env.USE_TEST_ENVIRONMENT === 'true';
    if (useTestEnvironment) {
      return process.env.DERIBIT_TEST_WS_URL || 'wss://test.deribit.com/ws/api/v2';
    }
    return process.env.DERIBIT_WS_URL || 'wss://www.deribit.com/ws/api/v2';
  }

  /**
   * 获取指定账户的企业微信机器人配置
   * @param accountName 账户名称
   * @returns WeChatBotConfig | null
   */
  private getWeChatBotConfig(accountName: string): WeChatBotConfig | null {
    const account = this.getAccountByName(accountName);
    if (!account || !account.wechat_bot || !account.wechat_bot.webhook_url) {
      return null;
    }

    const wechatConfig = account.wechat_bot;
    if (wechatConfig.enabled === false) {
      return null;
    }

    return {
      webhookUrl: wechatConfig.webhook_url,
      timeout: wechatConfig.timeout || 10000,
      retryCount: wechatConfig.retry_count || 3,
      retryDelay: wechatConfig.retry_delay || 1000
    };
  }

  /**
   * 获取所有启用的企业微信机器人配置
   * @returns Array<{accountName: string, config: WeChatBotConfig}>
   */
  public getAllWeChatBotConfigs(): Array<{accountName: string, config: WeChatBotConfig}> {
    const enabledAccounts = this.getEnabledAccounts();
    const configs: Array<{accountName: string, config: WeChatBotConfig}> = [];

    for (const account of enabledAccounts) {
      const config = this.getWeChatBotConfig(account.name);
      if (config) {
        configs.push({
          accountName: account.name,
          config
        });
      }
    }

    return configs;
  }

  public getAccountWeChatBot(accountName: string): WeChatBot | null {
    const wechatConfig = this.getWeChatBotConfig(accountName);
    if (!wechatConfig) {
      return null;
    }

    try {
      return createWeChatBot(wechatConfig.webhookUrl, wechatConfig);
    } catch (error) {
      console.error(`Failed to create WeChat Bot for account ${accountName}:`, error);
      return null;
    }
  }
}
