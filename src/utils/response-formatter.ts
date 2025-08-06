/**
 * 统一响应格式化工具
 * Unified Response Formatting Utility
 * 
 * 提供标准化的API响应格式，消除响应格式重复代码
 */

import { Response } from 'express';

/**
 * 标准API响应接口
 */
export interface StandardResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  timestamp: string;
  requestId?: string;
  meta?: Record<string, any>;
}

/**
 * 成功响应接口
 */
export interface SuccessResponse<T = any> extends StandardResponse<T> {
  success: true;
  data: T;
}

/**
 * 错误响应接口
 */
export interface ErrorResponse extends StandardResponse {
  success: false;
  error: string;
  statusCode?: number;
}

/**
 * 响应构建器选项
 */
export interface ResponseOptions<T = any> {
  message?: string;
  data?: T;
  error?: string | Error;
  requestId?: string;
  meta?: Record<string, any>;
  timestamp?: string;
}

/**
 * 统一响应格式化工具类
 */
export class ResponseFormatter {
  
  /**
   * 生成时间戳
   */
  private static getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 标准化错误信息
   */
  private static formatError(error: string | Error | unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  /**
   * 构建标准响应对象
   */
  private static buildResponse<T>(
    success: boolean,
    statusCode: number,
    options: ResponseOptions<T> = {}
  ): StandardResponse<T> {
    const response: StandardResponse<T> = {
      success,
      timestamp: options.timestamp || this.getTimestamp()
    };

    // 添加消息
    if (options.message) {
      response.message = options.message;
    }

    // 添加数据（成功响应）
    if (success && options.data !== undefined) {
      response.data = options.data;
    }

    // 添加错误信息（失败响应）
    if (!success && options.error) {
      response.error = this.formatError(options.error);
    }

    // 添加请求ID
    if (options.requestId) {
      response.requestId = options.requestId;
    }

    // 添加元数据
    if (options.meta) {
      response.meta = options.meta;
    }

    return response;
  }

  /**
   * 发送成功响应
   * @param res Express响应对象
   * @param statusCode HTTP状态码（默认200）
   * @param options 响应选项
   */
  public static success<T>(
    res: Response,
    statusCode: number = 200,
    options: ResponseOptions<T> = {}
  ): Response {
    const response = this.buildResponse(true, statusCode, options);
    return res.status(statusCode).json(response);
  }

  /**
   * 发送错误响应
   * @param res Express响应对象
   * @param statusCode HTTP状态码
   * @param options 响应选项
   */
  public static error(
    res: Response,
    statusCode: number,
    options: ResponseOptions = {}
  ): Response {
    const response = this.buildResponse(false, statusCode, options);
    return res.status(statusCode).json(response);
  }

  // ========== 常用的快捷方法 ==========

  /**
   * 200 OK - 成功响应
   */
  public static ok<T>(res: Response, data: T, options: Omit<ResponseOptions<T>, 'data'> = {}): Response {
    return this.success(res, 200, { ...options, data });
  }

  /**
   * 201 Created - 创建成功
   */
  public static created<T>(res: Response, data: T, options: Omit<ResponseOptions<T>, 'data'> = {}): Response {
    return this.success(res, 201, { ...options, data, message: options.message || 'Resource created successfully' });
  }

  /**
   * 400 Bad Request - 请求错误
   */
  public static badRequest(res: Response, error: string | Error, options: Omit<ResponseOptions, 'error'> = {}): Response {
    return this.error(res, 400, { ...options, error, message: options.message || 'Bad Request' });
  }

  /**
   * 401 Unauthorized - 认证失败
   */
  public static unauthorized(res: Response, error: string | Error = 'Unauthorized', options: Omit<ResponseOptions, 'error'> = {}): Response {
    return this.error(res, 401, { ...options, error, message: options.message || 'Authentication failed' });
  }

  /**
   * 403 Forbidden - 权限不足
   */
  public static forbidden(res: Response, error: string | Error = 'Forbidden', options: Omit<ResponseOptions, 'error'> = {}): Response {
    return this.error(res, 403, { ...options, error, message: options.message || 'Access denied' });
  }

  /**
   * 404 Not Found - 资源未找到
   */
  public static notFound(res: Response, error: string | Error = 'Not Found', options: Omit<ResponseOptions, 'error'> = {}): Response {
    return this.error(res, 404, { ...options, error, message: options.message || 'Resource not found' });
  }

  /**
   * 422 Unprocessable Entity - 验证失败
   */
  public static validationError(res: Response, error: string | Error, options: Omit<ResponseOptions, 'error'> = {}): Response {
    return this.error(res, 422, { ...options, error, message: options.message || 'Validation failed' });
  }

  /**
   * 500 Internal Server Error - 服务器内部错误
   */
  public static internalError(res: Response, error: string | Error = 'Internal Server Error', options: Omit<ResponseOptions, 'error'> = {}): Response {
    return this.error(res, 500, { ...options, error, message: options.message || 'Internal server error' });
  }

  // ========== 业务场景特定的快捷方法 ==========

  /**
   * 认证错误 - 统一认证失败响应
   */
  public static authError(res: Response, accountName?: string, error: string | Error = 'Authentication failed'): Response {
    const meta = accountName ? { accountName } : undefined;
    return this.unauthorized(res, error, { meta });
  }

  /**
   * 账户验证错误 - 账户不存在或禁用
   */
  public static accountError(res: Response, accountName: string, error: string | Error): Response {
    return this.notFound(res, error, { meta: { accountName } });
  }

  /**
   * 参数验证错误 - 请求参数无效
   */
  public static paramError(res: Response, missingFields: string[]): Response {
    return this.badRequest(res, `Missing required fields: ${missingFields.join(', ')}`, {
      meta: { missingFields }
    });
  }

  /**
   * 业务逻辑错误 - 业务规则验证失败
   */
  public static businessError(res: Response, error: string | Error, details?: Record<string, any>): Response {
    return this.validationError(res, error, { meta: details });
  }

  /**
   * Mock模式响应 - 标识Mock模式的响应
   */
  public static mockResponse<T>(res: Response, data: T, message: string = 'Mock mode response'): Response {
    return this.ok(res, data, {
      message,
      meta: { mockMode: true }
    });
  }
}

// ========== 便捷的导出函数 ==========

/**
 * 响应格式化器实例（别名）
 */
export const ApiResponse = ResponseFormatter;

/**
 * 快捷的成功响应函数
 * @param res Express响应对象
 * @param data 响应数据
 * @param message 响应消息
 */
export function sendSuccess<T>(res: Response, data: T, message?: string): Response {
  return ResponseFormatter.ok(res, data, { message });
}

/**
 * 快捷的错误响应函数
 * @param res Express响应对象
 * @param statusCode HTTP状态码
 * @param error 错误信息
 * @param message 响应消息
 */
export function sendError(res: Response, statusCode: number, error: string | Error, message?: string): Response {
  return ResponseFormatter.error(res, statusCode, { error, message });
}

/**
 * Express中间件：添加响应格式化器到res对象
 */
export function responseFormatterMiddleware(req: any, res: Response, next: any): void {
  // 添加格式化器方法到响应对象
  res.success = <T>(data: T, message?: string) => ResponseFormatter.ok(res, data, { message });
  res.error = (statusCode: number, error: string | Error, message?: string) => ResponseFormatter.error(res, statusCode, { error, message });
  res.badRequest = (error: string | Error) => ResponseFormatter.badRequest(res, error);
  res.unauthorized = (error?: string | Error) => ResponseFormatter.unauthorized(res, error);
  res.forbidden = (error?: string | Error) => ResponseFormatter.forbidden(res, error);
  res.notFound = (error?: string | Error) => ResponseFormatter.notFound(res, error);
  res.internalError = (error?: string | Error) => ResponseFormatter.internalError(res, error);

  next();
}

// ========== TypeScript类型扩展（可选） ==========
declare global {
  namespace Express {
    interface Response {
      success?<T>(data: T, message?: string): Response;
      error?(statusCode: number, error: string | Error, message?: string): Response;
      badRequest?(error: string | Error): Response;
      unauthorized?(error?: string | Error): Response;
      forbidden?(error?: string | Error): Response;
      notFound?(error?: string | Error): Response;
      internalError?(error?: string | Error): Response;
    }
  }
}