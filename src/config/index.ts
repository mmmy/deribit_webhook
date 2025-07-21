import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import path from 'path';
import dotenv from 'dotenv';
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

  public getApiBaseUrl(testMode: boolean = true): string {
    if (testMode) {
      return process.env.DERIBIT_TEST_API_URL || 'https://test.deribit.com/api/v2';
    }
    return process.env.DERIBIT_API_URL || 'https://www.deribit.com/api/v2';
  }

  public getWebSocketUrl(testMode: boolean = true): string {
    if (testMode) {
      return process.env.DERIBIT_TEST_WS_URL || 'wss://test.deribit.com/ws/api/v2';
    }
    return process.env.DERIBIT_WS_URL || 'wss://www.deribit.com/ws/api/v2';
  }
}