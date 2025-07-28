/**
 * 数据库模块导出
 */

export { DeltaManager } from './delta-manager';
export * from './types';

// 便捷的默认实例
import { DeltaManager } from './delta-manager';
export const deltaManager = DeltaManager.getInstance();
