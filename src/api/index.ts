/**
 * Deribit API模块索引
 * 统一导出公共接口和私有接口
 */

import { DeribitPublicAPI, type DeribitConfig as PublicConfig } from './deribit-public';
import { DeribitPrivateAPI, type DeribitConfig, type AuthInfo } from './deribit-private';

// 导出类和工厂函数
export { 
  DeribitPublicAPI, 
  createDeribitPublicAPI,
  type DeribitConfig as PublicConfig 
} from './deribit-public';

export { 
  DeribitPrivateAPI, 
  createDeribitPrivateAPI,
  type DeribitConfig,
  type AuthInfo 
} from './deribit-private';

// 常用配置预设
export const DERIBIT_CONFIGS = {
  PRODUCTION: {
    baseUrl: 'https://www.deribit.com/api/v2',
    timeout: 15000
  },
  TEST: {
    baseUrl: 'https://test.deribit.com/api/v2',  
    timeout: 15000
  }
} as const;

// 实用工具函数
export const createAuthInfo = (accessToken: string, tokenType: string = 'Bearer'): AuthInfo => ({
  accessToken,
  tokenType
});

export const getConfigByEnvironment = (isTest: boolean = false): DeribitConfig => {
  return isTest ? DERIBIT_CONFIGS.TEST : DERIBIT_CONFIGS.PRODUCTION;
};

// 简化的API创建函数
export const createDeribitAPIs = (config: DeribitConfig, auth?: AuthInfo) => {
  return {
    public: new DeribitPublicAPI(config),
    private: auth ? new DeribitPrivateAPI(config, auth) : null
  };
};