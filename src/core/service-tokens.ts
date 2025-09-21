/**
 * 服务令牌定义
 * Service Token Definitions
 * 
 * 定义所有需要注入的服务的唯一标识符
 */

// 核心服务令牌
export const SERVICE_TOKENS = {
  // 配置相关
  ConfigLoader: Symbol('ConfigLoader'),
  
  // 认证相关
  DeribitAuth: Symbol('DeribitAuth'),
  AuthenticationService: Symbol('AuthenticationService'),
  
  // 客户端相关
  DeribitClient: Symbol('DeribitClient'),
  
  // 业务服务
  DeltaManager: Symbol('DeltaManager'),
  OptionService: Symbol('OptionService'),
  OptionTradingService: Symbol('OptionTradingService'),
  
  // 工具服务
  WechatNotificationService: Symbol('WechatNotificationService'),
  PositionPollingService: Symbol('PositionPollingService'),
  ResponseFormatter: Symbol('ResponseFormatter')
} as const;

// 服务令牌类型
export type ServiceTokens = typeof SERVICE_TOKENS;
export type ServiceTokenKey = keyof ServiceTokens;