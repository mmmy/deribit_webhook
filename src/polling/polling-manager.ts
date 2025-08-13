import { getPositionPollingService } from '../core';
import { PollingResult, PositionPollingService } from './position-poller';

/**
 * Polling manager - handles scheduled position polling
 */
export class PollingManager {
  private pollingService: PositionPollingService;
  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.pollingService = getPositionPollingService();
  }

  /**
   * Start scheduled polling
   */
  startPolling(): boolean {
    if (this.isRunning) {
      console.log('⚠️ Polling is already running');
      return false;
    }

    // Get polling interval from environment (default: 15 minutes)
    const pollingIntervalMinutes = parseInt(process.env.POLLING_INTERVAL_MINUTES || '15', 10);
    const POLLING_INTERVAL = pollingIntervalMinutes * 60 * 1000;

    console.log(`⏰ Starting positions polling every ${pollingIntervalMinutes} minutes`);

    // Execute immediately
    this.executePollingCycle().catch(error => {
      console.error('Initial polling failed:', error);
    });

    // Set up scheduled polling
    this.pollingInterval = setInterval(() => {
      this.executePollingCycle().catch(error => {
        console.error('Scheduled polling failed:', error);
      });
    }, POLLING_INTERVAL);

    this.isRunning = true;
    return true;
  }

  /**
   * Stop scheduled polling
   */
  stopPolling(): boolean {
    if (!this.isRunning || !this.pollingInterval) {
      console.log('⚠️ Polling is not running');
      return false;
    }

    clearInterval(this.pollingInterval);
    this.pollingInterval = null;
    this.isRunning = false;
    
    console.log('⏹️ Positions polling stopped');
    return true;
  }

  /**
   * 执行完整的轮询周期（仓位 + 未成交订单）
   */
  private async executePollingCycle(): Promise<void> {
    try {
      console.log('🔄 Starting polling cycle...');

      // 1. 轮询仓位
      console.log('📊 Polling positions...');
      const positionResults = await this.pollingService.pollAllAccountsPositions();
      console.log(`✅ Position polling completed: ${positionResults.length} accounts processed`);

      // 2. 轮询未成交订单
      console.log('📋 Polling pending orders...');
      const orderResults = await this.pollingService.pollAllAccountsPendingOrders();
      console.log(`✅ Pending orders polling completed: ${orderResults.length} accounts processed`);

      console.log('🎉 Polling cycle completed successfully');

    } catch (error) {
      console.error('❌ Polling cycle failed:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for polling
   */
  async triggerPolling(): Promise<PollingResult[]> {
    console.log('📡 Manual polling triggered');
    await this.executePollingCycle();
    // 返回仓位轮询结果（保持向后兼容）
    return await this.pollingService.pollAllAccountsPositions();
  }

  /**
   * Get polling status
   */
  getStatus(): {
    isActive: boolean;
    intervalMinutes: number;
    nextPollEstimate: string | null;
  } {
    const intervalMinutes = parseInt(process.env.POLLING_INTERVAL_MINUTES || '15', 10);
    
    return {
      isActive: this.isRunning,
      intervalMinutes,
      nextPollEstimate: this.isRunning ? 
        new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString() :
        null
    };
  }

  /**
   * Check if polling is active
   */
  isActive(): boolean {
    return this.isRunning;
  }
}