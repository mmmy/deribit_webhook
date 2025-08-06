import { PositionPollingService, PollingResult } from './position-poller';
import { getPositionPollingService } from '../core';

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
    this.pollingService.pollAllAccountsPositions().catch(error => {
      console.error('Initial polling failed:', error);
    });

    // Set up scheduled polling
    this.pollingInterval = setInterval(() => {
      this.pollingService.pollAllAccountsPositions().catch(error => {
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
   * Manual trigger for polling
   */
  async triggerPolling(): Promise<PollingResult[]> {
    console.log('📡 Manual positions polling triggered');
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