import { DeltaManager } from '../database/delta-manager';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

function runCleanup(gracePeriodDays: number): void {
  if (isRunning) {
    console.log('⏳ Delta期权清理仍在执行，跳过本次调度');
    return;
  }

  isRunning = true;
  try {
    const deltaManager = DeltaManager.getInstance();
    const deleted = deltaManager.cleanupExpiredOptionRecords(gracePeriodDays);
    const nextRun = new Date(Date.now() + ONE_DAY_MS).toISOString();
    console.log(`🗓️ Delta期权清理任务完成，删除 ${deleted} 条记录。下次执行时间: ${nextRun}`);
  } catch (error) {
    console.error('❌ Delta期权清理任务执行失败:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * 启动每日Delta期权清理任务
 */
export function startDeltaCleanupJob(gracePeriodDays: number = 7): void {
  if (intervalHandle) {
    console.log('ℹ️ Delta期权清理任务已在运行');
    return;
  }

  runCleanup(gracePeriodDays);
  intervalHandle = setInterval(() => runCleanup(gracePeriodDays), ONE_DAY_MS);
  intervalHandle.unref?.();

  console.log('🗓️ Delta期权每日清理任务已启动');
}

/**
 * 停止每日Delta期权清理任务
 */
export function stopDeltaCleanupJob(): void {
  if (!intervalHandle) {
    return;
  }

  clearInterval(intervalHandle);
  intervalHandle = null;
  console.log('🛑 Delta期权每日清理任务已停止');
}
