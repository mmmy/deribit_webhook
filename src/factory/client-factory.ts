/**
 * 客户端工厂模式
 * Client Factory Pattern
 * 
 * 统一管理Mock和真实客户端的创建与选择，消除Mock模式判断逻辑重复
 */

import { DeribitClient } from '../services/deribit-client';
import { MockDeribitClient } from '../services/mock-deribit';
import { DeribitAuth } from '../services/auth';

/**
 * 运行模式枚举
 */
export enum RunMode {
  MOCK = 'mock',
  REAL = 'real'
}

/**
 * 客户端工厂配置接口
 */
export interface ClientFactoryConfig {
  mode: RunMode;
  forceMode?: boolean; // 是否强制使用指定模式，忽略环境变量
}

/**
 * 统一的客户端接口
 * 定义Mock和Real客户端都需要实现的基本方法
 */
export interface IUnifiedClient {
  // 工具相关
  getInstruments(currency: string, kind?: string): Promise<any[]>;
  getInstrument(instrumentName: string): Promise<any>;
  getInstrumentByDelta(currency: string, minExpiredDays: number, targetDelta: number, isCall: boolean, underlying?: string): Promise<any>;
  
  // 账户相关
  getAccountSummary(currency: string): Promise<any>;
  getPositions(accessToken: string, params: any): Promise<any[]>;
  
  // 交易相关
  placeOrder(instrumentName: string, direction: 'buy' | 'sell', amount: number, type: 'limit' | 'market', price?: number, accessToken?: string): Promise<any>;
  
  // 期权详情
  getOptionDetails(instrumentName: string): Promise<any>;
  
  // 标识属性
  readonly isMock: boolean;
  readonly mode: RunMode;
}

/**
 * 客户端工厂类
 */
export class ClientFactory {
  private static instance: ClientFactory;
  private currentMode: RunMode;
  private deribitClient: DeribitClient | null = null;
  private mockClient: MockDeribitClient | null = null;

  private constructor() {
    this.currentMode = this.detectRunMode();
  }

  /**
   * 获取工厂单例实例
   */
  public static getInstance(): ClientFactory {
    if (!ClientFactory.instance) {
      ClientFactory.instance = new ClientFactory();
    }
    return ClientFactory.instance;
  }

  /**
   * 检测当前运行模式
   */
  private detectRunMode(): RunMode {
    return process.env.USE_MOCK_MODE === 'true' ? RunMode.MOCK : RunMode.REAL;
  }

  /**
   * 获取当前运行模式
   */
  public getCurrentMode(): RunMode {
    return this.currentMode;
  }

  /**
   * 检查是否为Mock模式
   */
  public isMockMode(): boolean {
    return this.currentMode === RunMode.MOCK;
  }

  /**
   * 检查是否为真实模式
   */
  public isRealMode(): boolean {
    return this.currentMode === RunMode.REAL;
  }

  /**
   * 设置运行模式（主要用于测试）
   */
  public setMode(mode: RunMode): void {
    this.currentMode = mode;
    console.log(`🔄 Client factory mode changed to: ${mode}`);
  }

  /**
   * 获取统一客户端实例
   * @param config 可选配置，可以临时覆盖模式
   */
  public getClient(config?: ClientFactoryConfig): IUnifiedClient {
    const targetMode = config?.forceMode ? config.mode : this.currentMode;
    
    if (targetMode === RunMode.MOCK) {
      return this.getMockClient();
    } else {
      return this.getRealClient();
    }
  }

  /**
   * 获取Mock客户端
   */
  public getMockClient(): IUnifiedClient {
    if (!this.mockClient) {
      this.mockClient = new MockDeribitClient();
    }
    return new UnifiedMockClient(this.mockClient);
  }

  /**
   * 获取真实客户端
   */
  public getRealClient(): IUnifiedClient {
    if (!this.deribitClient) {
      this.deribitClient = new DeribitClient();
    }
    return new UnifiedRealClient(this.deribitClient);
  }

  /**
   * 根据条件获取客户端
   * @param condition 条件函数，返回true使用Mock，false使用Real
   */
  public getClientByCondition(condition: () => boolean): IUnifiedClient {
    const shouldUseMock = condition();
    return this.getClient({
      mode: shouldUseMock ? RunMode.MOCK : RunMode.REAL,
      forceMode: true
    });
  }

  /**
   * 创建认证客户端（总是使用真实模式，除非强制Mock）
   */
  public getAuthClient(forceMock: boolean = false): DeribitAuth {
    // 认证服务通常不需要Mock，但提供选项以防特殊需求
    return new DeribitAuth();
  }

  /**
   * 重置客户端实例（主要用于测试）
   */
  public reset(): void {
    this.deribitClient = null;
    this.mockClient = null;
    this.currentMode = this.detectRunMode();
  }

  /**
   * 获取运行状态信息
   */
  public getStatus(): {
    currentMode: RunMode;
    isMock: boolean;
    environmentVariable: string;
    hasRealClient: boolean;
    hasMockClient: boolean;
  } {
    return {
      currentMode: this.currentMode,
      isMock: this.isMockMode(),
      environmentVariable: process.env.USE_MOCK_MODE || 'false',
      hasRealClient: this.deribitClient !== null,
      hasMockClient: this.mockClient !== null
    };
  }
}

/**
 * Mock客户端统一包装器
 */
class UnifiedMockClient implements IUnifiedClient {
  public readonly isMock = true;
  public readonly mode = RunMode.MOCK;

  constructor(private mockClient: MockDeribitClient) {}

  async getInstruments(currency: string, kind?: string): Promise<any[]> {
    return this.mockClient.getInstruments(currency, kind);
  }

  async getInstrument(instrumentName: string): Promise<any> {
    return this.mockClient.getInstrument(instrumentName);
  }

  async getInstrumentByDelta(currency: string, minExpiredDays: number, targetDelta: number, isCall: boolean, underlying?: string): Promise<any> {
    return this.mockClient.getInstrumentByDelta(currency, minExpiredDays, targetDelta, isCall, underlying);
  }

  async getAccountSummary(currency: string): Promise<any> {
    return this.mockClient.getAccountSummary(currency);
  }

  async getPositions(accessToken: string, params: any): Promise<any[]> {
    // Mock客户端不需要真实的accessToken
    // MockDeribitClient没有getPositions方法，需要通过其他方式模拟
    return []; // 返回空数组作为模拟数据
  }

  async placeOrder(instrumentName: string, direction: 'buy' | 'sell', amount: number, type: 'limit' | 'market', price?: number, accessToken?: string): Promise<any> {
    return this.mockClient.placeOrder({
      instrument_name: instrumentName,
      direction,
      amount,
      type,
      price
    });
  }

  async getOptionDetails(instrumentName: string): Promise<any> {
    return this.mockClient.getOptionDetails(instrumentName);
  }
}

/**
 * 真实客户端统一包装器
 */
class UnifiedRealClient implements IUnifiedClient {
  public readonly isMock = false;
  public readonly mode = RunMode.REAL;

  constructor(private realClient: DeribitClient) {}

  async getInstruments(currency: string, kind?: string): Promise<any[]> {
    return this.realClient.getInstruments(currency, kind);
  }

  async getInstrument(instrumentName: string): Promise<any> {
    return this.realClient.getInstrument(instrumentName);
  }

  async getInstrumentByDelta(currency: string, minExpiredDays: number, targetDelta: number, isCall: boolean, underlying?: string): Promise<any> {
    return this.realClient.getInstrumentByDelta(currency, minExpiredDays, targetDelta, isCall, underlying);
  }

  async getAccountSummary(currency: string): Promise<any> {
    // DeribitClient没有getAccountSummary方法，需要通过其他方式获取
    // 这里暂时返回空对象，实际应该通过API调用获取
    return {};
  }

  async getPositions(accessToken: string, params: any): Promise<any[]> {
    return this.realClient.getPositions(accessToken, params);
  }

  async placeOrder(instrumentName: string, direction: 'buy' | 'sell', amount: number, type: 'limit' | 'market', price?: number, accessToken?: string): Promise<any> {
    if (!accessToken) {
      throw new Error('Access token is required for real client');
    }
    return this.realClient.placeOrder(instrumentName, direction, amount, type, price, accessToken);
  }

  async getOptionDetails(instrumentName: string): Promise<any> {
    return this.realClient.getOptionDetails(instrumentName);
  }
}

// 导出便捷函数
export const clientFactory = ClientFactory.getInstance();

/**
 * 获取统一客户端的便捷函数
 */
export function getUnifiedClient(config?: ClientFactoryConfig): IUnifiedClient {
  return clientFactory.getClient(config);
}

/**
 * 检查是否为Mock模式的便捷函数
 */
export function isMockMode(): boolean {
  return clientFactory.isMockMode();
}

/**
 * 检查是否为真实模式的便捷函数
 */
export function isRealMode(): boolean {
  return clientFactory.isRealMode();
}

/**
 * 获取当前运行模式的便捷函数
 */
export function getCurrentMode(): RunMode {
  return clientFactory.getCurrentMode();
}

/**
 * 条件式客户端获取
 * @param condition 返回true使用Mock，false使用Real
 */
export function getClientByCondition(condition: () => boolean): IUnifiedClient {
  return clientFactory.getClientByCondition(condition);
}