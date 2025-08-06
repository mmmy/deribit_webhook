/**
 * 账户验证中间件
 * Account Validation Middleware
 * 
 * 提供统一的账户验证逻辑，消除重复的账户检查代码
 */

import { Request, Response, NextFunction } from 'express';
import { ConfigLoader } from '../config';
import type { ApiKeyConfig } from '../types';

/**
 * 账户验证错误类
 */
export class AccountValidationError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;

  constructor(message: string, statusCode: number, errorCode: string) {
    super(message);
    this.name = 'AccountValidationError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

export class AccountNotFoundError extends AccountValidationError {
  constructor(message: string) {
    super(message, 404, 'ACCOUNT_NOT_FOUND');
  }
}

export class AccountDisabledError extends AccountValidationError {
  constructor(message: string) {
    super(message, 403, 'ACCOUNT_DISABLED');
  }
}

/**
 * 扩展Express Request类型以包含验证后的账户信息
 */
declare global {
  namespace Express {
    interface Request {
      validatedAccount?: ApiKeyConfig;
    }
  }
}

/**
 * 账户验证服务类
 */
export class AccountValidationService {
  private configLoader: ConfigLoader | null = null;

  /**
   * 延迟初始化ConfigLoader（避免循环依赖）
   */
  private getConfigLoader(): ConfigLoader {
    if (!this.configLoader) {
      this.configLoader = ConfigLoader.getInstance();
    }
    return this.configLoader;
  }

  /**
   * 验证账户存在性和启用状态
   * @param accountName 账户名称
   * @returns 验证通过的账户对象
   * @throws AccountValidationError 账户不存在或被禁用
   */
  public validateAccount(accountName: string): ApiKeyConfig {
    const account = this.getConfigLoader().getAccountByName(accountName);
    
    if (!account) {
      throw new AccountNotFoundError(`Account not found: ${accountName}`);
    }

    if (!account.enabled) {
      throw new AccountDisabledError(`Account is disabled: ${accountName}`);
    }

    return account;
  }

  /**
   * 异步版本的账户验证（为了保持API一致性）
   * @param accountName 账户名称
   * @returns Promise<ApiKeyConfig>
   */
  public async validateAccountAsync(accountName: string): Promise<ApiKeyConfig> {
    return this.validateAccount(accountName);
  }

  /**
   * 批量验证多个账户
   * @param accountNames 账户名称数组
   * @returns 验证通过的账户对象数组
   */
  public validateMultipleAccounts(accountNames: string[]): ApiKeyConfig[] {
    const validatedAccounts: ApiKeyConfig[] = [];
    
    for (const accountName of accountNames) {
      validatedAccounts.push(this.validateAccount(accountName));
    }
    
    return validatedAccounts;
  }

  /**
   * 检查账户是否存在（不抛出异常）
   * @param accountName 账户名称
   * @returns 账户验证结果
   */
  public checkAccount(accountName: string): { exists: boolean; enabled: boolean; account?: ApiKeyConfig } {
    const account = this.getConfigLoader().getAccountByName(accountName);
    
    if (!account) {
      return { exists: false, enabled: false };
    }

    return {
      exists: true,
      enabled: account.enabled,
      account
    };
  }
}

/**
 * Express中间件：从路径参数中验证账户
 * @param paramName 路径参数名称（默认为'accountName'）
 */
export function validateAccountFromParams(paramName: string = 'accountName') {
  const validationService = new AccountValidationService();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountName = req.params[paramName];
      
      if (!accountName) {
        return res.status(400).json({
          success: false,
          message: `Missing required parameter: ${paramName}`,
          errorCode: 'MISSING_ACCOUNT_PARAMETER',
          timestamp: new Date().toISOString()
        });
      }

      // 验证账户
      const account = validationService.validateAccount(accountName);
      
      // 将验证后的账户信息附加到请求对象
      req.validatedAccount = account;
      
      next();
    } catch (error) {
      if (error instanceof AccountValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          errorCode: error.errorCode,
          accountName: req.params[paramName],
          timestamp: new Date().toISOString()
        });
      }

      // 其他未知错误
      return res.status(500).json({
        success: false,
        message: 'Internal server error during account validation',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Express中间件：从请求体中验证账户
 * @param fieldName 请求体字段名称（默认为'accountName'）
 */
export function validateAccountFromBody(fieldName: string = 'accountName') {
  const validationService = new AccountValidationService();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountName = req.body?.[fieldName];
      
      if (!accountName) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${fieldName}`,
          errorCode: 'MISSING_ACCOUNT_FIELD',
          timestamp: new Date().toISOString()
        });
      }

      // 验证账户
      const account = validationService.validateAccount(accountName);
      
      // 将验证后的账户信息附加到请求对象
      req.validatedAccount = account;
      
      next();
    } catch (error) {
      if (error instanceof AccountValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          errorCode: error.errorCode,
          accountName: req.body?.[fieldName],
          timestamp: new Date().toISOString()
        });
      }

      // 其他未知错误
      return res.status(500).json({
        success: false,
        message: 'Internal server error during account validation',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Express中间件：从查询参数中验证账户
 * @param paramName 查询参数名称（默认为'account'）
 */
export function validateAccountFromQuery(paramName: string = 'account') {
  const validationService = new AccountValidationService();

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountName = req.query[paramName] as string;
      
      if (!accountName) {
        return res.status(400).json({
          success: false,
          message: `Missing required query parameter: ${paramName}`,
          errorCode: 'MISSING_ACCOUNT_QUERY',
          timestamp: new Date().toISOString()
        });
      }

      // 验证账户
      const account = validationService.validateAccount(accountName);
      
      // 将验证后的账户信息附加到请求对象
      req.validatedAccount = account;
      
      next();
    } catch (error) {
      if (error instanceof AccountValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          message: error.message,
          errorCode: error.errorCode,
          accountName: req.query[paramName],
          timestamp: new Date().toISOString()
        });
      }

      // 其他未知错误
      return res.status(500).json({
        success: false,
        message: 'Internal server error during account validation',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  };
}

// 导出单例实例
export const accountValidationService = new AccountValidationService();