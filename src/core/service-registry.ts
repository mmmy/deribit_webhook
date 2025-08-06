/**
 * 服务注册配置
 * Service Registration Configuration
 * 
 * 负责将所有应用服务注册到依赖注入容器中
 */

import { ConfigLoader } from '../config';
import { DeribitAuth } from '../services/auth';
import { DeribitClient } from '../services/deribit-client';
import { MockDeribitClient } from '../services/mock-deribit';
import { DeltaManager } from '../database/delta-manager';
import { OptionService } from '../services/option-service';
import { OptionTradingService } from '../services/option-trading';
import { WeChatNotificationService } from '../services/wechat-notification';
import { PositionPollingService } from '../polling/position-poller';

import { DIContainer } from './di-container';
import { SERVICE_TOKENS } from './service-tokens';

/**
 * 注册所有服务到容器
 */
export function registerServices(container: DIContainer): void {
  // 注册ConfigLoader (单例)
  container.register(
    SERVICE_TOKENS.ConfigLoader,
    () => ConfigLoader.getInstance(),
    { singleton: true }
  );

  // 注册DeribitAuth (单例)
  container.register(
    SERVICE_TOKENS.DeribitAuth,
    () => new DeribitAuth(),
    { singleton: true }
  );

  // 注册DeribitClient (单例)
  container.register(
    SERVICE_TOKENS.DeribitClient,
    () => new DeribitClient(),
    { singleton: true }
  );

  // 注册MockDeribitClient (单例)
  container.register(
    SERVICE_TOKENS.MockDeribitClient,
    () => new MockDeribitClient(),
    { singleton: true }
  );

  // 注册DeltaManager (单例)
  container.register(
    SERVICE_TOKENS.DeltaManager,
    () => DeltaManager.getInstance(),
    { singleton: true }
  );

  // 注册OptionService (单例，使用依赖注入)
  container.register(
    SERVICE_TOKENS.OptionService,
    (container) => new OptionService(
      container.resolve(SERVICE_TOKENS.ConfigLoader),
      container.resolve(SERVICE_TOKENS.DeribitAuth),
      container.resolve(SERVICE_TOKENS.DeribitClient),
      container.resolve(SERVICE_TOKENS.MockDeribitClient)
    ),
    { singleton: true }
  );

  // 注册OptionTradingService (单例，使用依赖注入)
  container.register(
    SERVICE_TOKENS.OptionTradingService,
    (container) => new OptionTradingService(
      container.resolve(SERVICE_TOKENS.DeribitAuth),
      container.resolve(SERVICE_TOKENS.ConfigLoader),
      container.resolve(SERVICE_TOKENS.DeribitClient),
      container.resolve(SERVICE_TOKENS.MockDeribitClient),
      container.resolve(SERVICE_TOKENS.DeltaManager)
    ),
    { singleton: true }
  );

  // 注册WeChatNotificationService (单例，使用依赖注入)
  container.register(
    SERVICE_TOKENS.WechatNotificationService,
    (container) => new WeChatNotificationService(
      container.resolve(SERVICE_TOKENS.ConfigLoader)
    ),
    { singleton: true }
  );

  // 注册PositionPollingService (单例，使用依赖注入)
  container.register(
    SERVICE_TOKENS.PositionPollingService,
    (container) => new PositionPollingService(
      container.resolve(SERVICE_TOKENS.ConfigLoader),
      container.resolve(SERVICE_TOKENS.DeribitAuth),
      container.resolve(SERVICE_TOKENS.DeribitClient),
      container.resolve(SERVICE_TOKENS.MockDeribitClient),
      container.resolve(SERVICE_TOKENS.DeltaManager)
    ),
    { singleton: true }
  );

  console.log(`✅ 注册了 ${container.size} 个服务到依赖注入容器`);
}