/**
 * 依赖注入容器
 * Dependency Injection Container
 * 
 * 解决服务实例化模式重复问题，统一管理服务生命周期
 */

// 服务令牌类型
export type ServiceToken<T = any> = symbol | string;

// 服务工厂函数
export type ServiceFactory<T = any> = (container: DIContainer) => T;

// 服务注册选项
export interface ServiceOptions {
  singleton?: boolean;
}

// 服务注册信息
interface ServiceRegistration<T = any> {
  factory: ServiceFactory<T>;
  singleton: boolean;
  instance?: T;
}

/**
 * 依赖注入容器实现
 */
export class DIContainer {
  private services = new Map<ServiceToken, ServiceRegistration>();
  private singletons = new Map<ServiceToken, any>();

  /**
   * 注册服务
   */
  register<T>(
    token: ServiceToken<T>, 
    factory: ServiceFactory<T>, 
    options: ServiceOptions = { singleton: true }
  ): void {
    this.services.set(token, {
      factory,
      singleton: options.singleton ?? true
    });
  }

  /**
   * 解析服务实例
   */
  resolve<T>(token: ServiceToken<T>): T {
    const registration = this.services.get(token);
    
    if (!registration) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    // 如果是单例且已创建实例，直接返回
    if (registration.singleton && this.singletons.has(token)) {
      return this.singletons.get(token);
    }

    // 创建新实例
    const instance = registration.factory(this);

    // 单例模式下缓存实例
    if (registration.singleton) {
      this.singletons.set(token, instance);
    }

    return instance;
  }

  /**
   * 检查服务是否已注册
   */
  has(token: ServiceToken): boolean {
    return this.services.has(token);
  }

  /**
   * 清除所有注册的服务（主要用于测试）
   */
  clear(): void {
    this.services.clear();
    this.singletons.clear();
  }

  /**
   * 获取已注册服务的数量
   */
  get size(): number {
    return this.services.size;
  }
}

// 全局容器实例
export const container = new DIContainer();