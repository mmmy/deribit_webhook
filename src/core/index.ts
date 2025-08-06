/**
 * 依赖注入容器初始化与服务访问
 * Dependency Injection Container Initialization & Service Access
 */

import { container } from './di-container';
import { registerServices } from './service-registry';
import { SERVICE_TOKENS } from './service-tokens';

// 导入类型用于类型检查
import type { ConfigLoader } from '../config';
import type { DeribitAuth } from '../services/auth';
import type { DeribitClient } from '../services/deribit-client';
import type { MockDeribitClient } from '../services/mock-deribit';
import type { DeltaManager } from '../database/delta-manager';
import type { OptionService } from '../services/option-service';
import type { OptionTradingService } from '../services/option-trading';
import type { WeChatNotificationService } from '../services/wechat-notification';
import type { PositionPollingService } from '../polling/position-poller';
import type { ClientFactory } from '../factory/client-factory';
import type { AuthenticationService } from '../services/authentication-service';
import type { ResponseFormatter } from '../utils/response-formatter';

// 标记容器是否已初始化
let isInitialized = false;

/**
 * 初始化依赖注入容器
 */
export function initializeContainer(): void {
  if (isInitialized) {
    console.log('⚠️ 依赖注入容器已初始化，跳过重复初始化');
    return;
  }

  try {
    // 注册所有服务
    registerServices(container);
    
    isInitialized = true;
    console.log('🎉 依赖注入容器初始化完成');
  } catch (error) {
    console.error('❌ 依赖注入容器初始化失败:', error);
    throw error;
  }
}

/**
 * 获取服务实例的便捷函数
 */
export function getService<T>(token: symbol): T {
  if (!isInitialized) {
    initializeContainer();
  }
  return container.resolve<T>(token);
}

/**
 * 重置容器（主要用于测试）
 */
export function resetContainer(): void {
  container.clear();
  isInitialized = false;
}

// 导出常用的服务获取器（带类型安全）
export const getConfigLoader = (): ConfigLoader => getService(SERVICE_TOKENS.ConfigLoader);
export const getDeribitAuth = (): DeribitAuth => getService(SERVICE_TOKENS.DeribitAuth);
export const getDeribitClient = (): DeribitClient => getService(SERVICE_TOKENS.DeribitClient);
export const getMockDeribitClient = (): MockDeribitClient => getService(SERVICE_TOKENS.MockDeribitClient);
export const getDeltaManager = (): DeltaManager => getService(SERVICE_TOKENS.DeltaManager);
export const getOptionService = (): OptionService => getService(SERVICE_TOKENS.OptionService);
export const getOptionTradingService = (): OptionTradingService => getService(SERVICE_TOKENS.OptionTradingService);
export const getWeChatNotificationService = (): WeChatNotificationService => getService(SERVICE_TOKENS.WechatNotificationService);
export const getPositionPollingService = (): PositionPollingService => getService(SERVICE_TOKENS.PositionPollingService);
export const getClientFactory = (): ClientFactory => getService(SERVICE_TOKENS.ClientFactory);
export const getAuthenticationService = (): AuthenticationService => getService(SERVICE_TOKENS.AuthenticationService);
export const getResponseFormatter = () => getService(SERVICE_TOKENS.ResponseFormatter);

// 导出容器实例和令牌
export { container, SERVICE_TOKENS };