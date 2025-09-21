/**
 * 认证服务抽象
 * Authentication Service Abstraction
 * 
 * 提供统一的认证流程管理，消除认证代码重复
 */

import { accountValidationService } from '../middleware/account-validation';
import type { ApiKeyConfig, AuthToken } from '../types';
import { DeribitAuth } from './auth';

/**
 * 认证错误类
 */
export class AuthenticationError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly accountName: string;

  constructor(message: string, accountName: string, statusCode: number = 401, errorCode: string = 'AUTHENTICATION_FAILED') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.accountName = accountName;
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(accountName: string) {
    super(`Authentication token expired for account: ${accountName}`, accountName, 401, 'TOKEN_EXPIRED');
  }
}

export class TokenNotFoundError extends AuthenticationError {
  constructor(accountName: string) {
    super(`No authentication token found for account: ${accountName}`, accountName, 401, 'TOKEN_NOT_FOUND');
  }
}

/**
 * 认证结果接口
 */
export interface AuthenticationResult {
  success: boolean;
  token?: AuthToken;
  account?: ApiKeyConfig;
  error?: string;
  errorCode?: string;
}

/**
 * 统一认证服务类
 */
export class AuthenticationService {
  private static instance: AuthenticationService;
  private deribitAuth: DeribitAuth;

  private constructor() {
    this.deribitAuth = new DeribitAuth();
  }

  /**
   * 获取认证服务单例实例
   */
  public static getInstance(): AuthenticationService {
    if (!AuthenticationService.instance) {
      AuthenticationService.instance = new AuthenticationService();
    }
    return AuthenticationService.instance;
  }

  /**
   * 统一认证方法 - 包含账户验证和认证流程
   * @param accountName 账户名称
   * @param skipValidation 是否跳过账户验证（默认false）
   * @returns 认证结果
   */
  public async authenticate(accountName: string, skipValidation: boolean = false): Promise<AuthenticationResult> {
    try {
      // 1. 账户验证（除非跳过）
      let account: ApiKeyConfig | undefined;
      if (!skipValidation) {
        account = accountValidationService.validateAccount(accountName);
      }

      // 2. 真实模式认证
      console.log(`🔐 Authenticating account: ${accountName}`);
      const token = await this.deribitAuth.authenticate(accountName);
      
      console.log(`✅ Authentication successful for account: ${accountName}`);
      return {
        success: true,
        token,
        account
      };

    } catch (error) {
      console.error(`❌ Authentication failed for account ${accountName}:`, error);
      
      let authError: AuthenticationError;
      if (error instanceof AuthenticationError) {
        authError = error;
      } else {
        authError = new AuthenticationError(
          error instanceof Error ? error.message : 'Unknown authentication error',
          accountName
        );
      }

      return {
        success: false,
        account: skipValidation ? undefined : accountValidationService.checkAccount(accountName).account,
        error: authError.message,
        errorCode: authError.errorCode
      };
    }
  }

  /**
   * 获取已缓存的Token信息
   * @param accountName 账户名称
   * @returns Token信息或null
   */
  public getTokenInfo(accountName: string): AuthToken | null {
    return this.deribitAuth.getTokenInfo(accountName);
  }

  /**
   * 确保认证状态有效（获取或刷新Token）
   * @param accountName 账户名称
   * @param forceRefresh 是否强制刷新Token
   * @returns 有效的Token信息
   */
  public async ensureAuthenticated(accountName: string, forceRefresh: boolean = false): Promise<AuthToken> {
    // 检查现有Token
    let tokenInfo = this.deribitAuth.getTokenInfo(accountName);
    
    if (!tokenInfo || forceRefresh) {
      // Token不存在或强制刷新，重新认证
      const result = await this.authenticate(accountName, true); // 跳过账户验证避免重复
      if (!result.success || !result.token) {
        throw new AuthenticationError(
          result.error || 'Failed to authenticate',
          accountName
        );
      }
      return result.token;
    }

    // 检查Token是否即将过期（提前5分钟刷新）
    const expiresAt = tokenInfo.expiresAt;
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
    
    if (expiresAt <= fiveMinutesFromNow) {
      try {
        console.log(`🔄 Token expiring soon for account ${accountName}, refreshing...`);
        tokenInfo = await this.deribitAuth.refreshToken(accountName);
      } catch (error) {
        console.warn(`⚠️ Token refresh failed for ${accountName}, re-authenticating...`);
        const result = await this.authenticate(accountName, true);
        if (!result.success || !result.token) {
          throw new TokenExpiredError(accountName);
        }
        return result.token;
      }
    }

    return tokenInfo;
  }

  /**
   * 测试账户连接状态
   * @param accountName 账户名称（可选，测试所有账户）
   * @returns 连接测试结果
   */
  public async testConnection(accountName?: string): Promise<boolean> {
    try {
      return await this.deribitAuth.testConnection(accountName);
    } catch (error) {
      console.error(`❌ Connection test failed for account ${accountName}:`, error);
      return false;
    }
  }

  /**
   * 批量认证多个账户
   * @param accountNames 账户名称数组
   * @returns 认证结果数组
   */
  public async batchAuthenticate(accountNames: string[]): Promise<AuthenticationResult[]> {
    const results = await Promise.allSettled(
      accountNames.map(accountName => this.authenticate(accountName))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          account: accountValidationService.checkAccount(accountNames[index]).account,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
          errorCode: 'BATCH_AUTH_FAILED'
        };
      }
    });
  }

  /**
   * 清除账户的缓存Token
   * @param accountName 账户名称
   */
  public clearToken(accountName: string): void {
    // 清除DeribitAuth中的缓存Token
    this.deribitAuth.clearToken(accountName);
  }

  /**
   * 获取认证服务状态信息
   */
  public getStatus(): {
    cachedTokens: number;
    service: string;
  } {
    return {
      cachedTokens: Object.keys(this.deribitAuth).length, // Simple approximation
      service: 'Unified Authentication Service'
    };
  }

  /**
   * 重置认证服务（主要用于测试）
   */
  public reset(): void {
    this.deribitAuth = new DeribitAuth();
  }
}

/**
 * 便捷的认证函数
 */

// 导出便捷函数但不立即创建单例实例

/**
 * 获取认证服务单例实例的便捷函数
 */
export function getAuthenticationService(): AuthenticationService {
  return AuthenticationService.getInstance();
}

/**
 * 导出认证服务单例实例（延迟初始化）
 */
export const authenticationService = {
  get instance() {
    return AuthenticationService.getInstance();
  }
};

/**
 * 快速认证函数
 * @param accountName 账户名称
 * @returns 认证结果
 */
export async function quickAuthenticate(accountName: string): Promise<AuthenticationResult> {
  return getAuthenticationService().authenticate(accountName);
}

/**
 * 确保认证状态的便捷函数
 * @param accountName 账户名称
 * @returns 有效的Token
 */
export async function ensureAuth(accountName: string): Promise<AuthToken> {
  return getAuthenticationService().ensureAuthenticated(accountName);
}

/**
 * 获取Token的便捷函数
 * @param accountName 账户名称
 * @returns Token信息或抛出异常
 */
export function getAuthToken(accountName: string): AuthToken {
  const token = getAuthenticationService().getTokenInfo(accountName);
  if (!token) {
    throw new TokenNotFoundError(accountName);
  }
  return token;
}

/**
 * 安全的Token获取函数（不抛出异常）
 * @param accountName 账户名称
 * @returns Token信息或null
 */
export function getAuthTokenSafely(accountName: string): AuthToken | null {
  return getAuthenticationService().getTokenInfo(accountName);
}