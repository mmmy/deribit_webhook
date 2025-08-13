import { getPositionPollingService } from '../core';
import { PollingResult, PositionPollingService } from './position-poller';

/**
 * Polling manager - handles scheduled position and order polling
 */
export class PollingManager {
  private pollingService: PositionPollingService;
  private positionPollingInterval: NodeJS.Timeout | null = null;
  private orderPollingInterval: NodeJS.Timeout | null = null;
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

    // Get polling intervals from environment
    const positionIntervalMinutes = parseInt(process.env.POSITION_POLLING_INTERVAL_MINUTES || '15', 10);
    const orderIntervalMinutes = parseInt(process.env.ORDER_POLLING_INTERVAL_MINUTES || '5', 10);

    const POSITION_POLLING_INTERVAL = positionIntervalMinutes * 60 * 1000;
    const ORDER_POLLING_INTERVAL = orderIntervalMinutes * 60 * 1000;

    console.log(`⏰ Starting polling:`);
    console.log(`   📊 Position polling every ${positionIntervalMinutes} minutes`);
    console.log(`   📋 Order polling every ${orderIntervalMinutes} minutes`);

    // Execute immediately
    this.executeInitialPolling().catch(error => {
      console.error('Initial polling failed:', error);
    });

    // Set up scheduled position polling
    this.positionPollingInterval = setInterval(() => {
      this.pollingService.pollAllAccountsPositions().catch(error => {
        console.error('Position polling failed:', error);
      });
    }, POSITION_POLLING_INTERVAL);

    // Set up scheduled order polling
    this.orderPollingInterval = setInterval(() => {
      this.pollingService.pollAllAccountsPendingOrders().catch(error => {
        console.error('Order polling failed:', error);
      });
    }, ORDER_POLLING_INTERVAL);

    this.isRunning = true;
    return true;
  }

  /**
   * Stop scheduled polling
   */
  stopPolling(): boolean {
    if (!this.isRunning) {
      console.log('⚠️ Polling is not running');
      return false;
    }

    // Clear position polling interval
    if (this.positionPollingInterval) {
      clearInterval(this.positionPollingInterval);
      this.positionPollingInterval = null;
    }

    // Clear order polling interval
    if (this.orderPollingInterval) {
      clearInterval(this.orderPollingInterval);
      this.orderPollingInterval = null;
    }

    this.isRunning = false;

    console.log('⏹️ All polling stopped');
    return true;
  }

  /**
   * 执行初始轮询（立即执行一次）
   */
  private async executeInitialPolling(): Promise<void> {
    try {
      console.log('🔄 Starting initial polling...');

      // 1. 轮询仓位
      console.log('📊 Initial position polling...');
      const positionResults = await this.pollingService.pollAllAccountsPositions();
      console.log(`✅ Initial position polling completed: ${positionResults.length} accounts processed`);

      // 2. 轮询未成交订单
      console.log('📋 Initial order polling...');
      const orderResults = await this.pollingService.pollAllAccountsPendingOrders();
      console.log(`✅ Initial order polling completed: ${orderResults.length} accounts processed`);

      console.log('🎉 Initial polling completed successfully');

    } catch (error) {
      console.error('❌ Initial polling failed:', error);
      throw error;
    }
  }

  /**
   * Manual trigger for polling (both position and order)
   */
  async triggerPolling(): Promise<PollingResult[]> {
    console.log('� Manual polling triggered');
    await this.executeInitialPolling();
    // 返回仓位轮询结果（保持向后兼容）
    return await this.pollingService.pollAllAccountsPositions();
  }

  /**
   * Manual trigger for position polling only
   */
  async triggerPositionPolling(): Promise<PollingResult[]> {
    console.log('� Manual position polling triggered');
    return await this.pollingService.pollAllAccountsPositions();
  }

  /**
   * Manual trigger for order polling only
   */
  async triggerOrderPolling(): Promise<PollingResult[]> {
    console.log('📡 Manual order polling triggered');
    return await this.pollingService.pollAllAccountsPendingOrders();
  }

  /**
   * Get polling status
   */
  getStatus(): {
    isActive: boolean;
    positionIntervalMinutes: number;
    orderIntervalMinutes: number;
    nextPositionPollEstimate: string | null;
    nextOrderPollEstimate: string | null;
  } {
    const positionIntervalMinutes = parseInt(process.env.POSITION_POLLING_INTERVAL_MINUTES || '15', 10);
    const orderIntervalMinutes = parseInt(process.env.ORDER_POLLING_INTERVAL_MINUTES || '5', 10);

    return {
      isActive: this.isRunning,
      positionIntervalMinutes,
      orderIntervalMinutes,
      nextPositionPollEstimate: this.isRunning ?
        new Date(Date.now() + positionIntervalMinutes * 60 * 1000).toISOString() :
        null,
      nextOrderPollEstimate: this.isRunning ?
        new Date(Date.now() + orderIntervalMinutes * 60 * 1000).toISOString() :
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