import { 
  ConfigLoader, 
  DeribitAuth, 
  DeribitClient, 
  DeltaManager, 
  MockDeribitClient 
} from '../services';
import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from '../api';
import { executePositionAdjustment } from '../services/position-adjustment';

export interface PollingResult {
  accountName: string;
  success: boolean;
  mockMode?: boolean;
  data?: any[];
  error?: string;
  timestamp: string;
}

/**
 * Position polling service - handles automated position monitoring and adjustment
 */
export class PositionPollingService {
  private configLoader: ConfigLoader;
  private deribitAuth: DeribitAuth;
  private deribitClient: DeribitClient;
  private mockClient: MockDeribitClient;
  private deltaManager: DeltaManager;
  private useMockMode: boolean;

  constructor(
    configLoader?: ConfigLoader,
    deribitAuth?: DeribitAuth,
    deribitClient?: DeribitClient,
    mockClient?: MockDeribitClient,
    deltaManager?: DeltaManager
  ) {
    // 支持依赖注入，但保持向后兼容
    this.configLoader = configLoader || ConfigLoader.getInstance();
    this.deribitAuth = deribitAuth || new DeribitAuth();
    this.deribitClient = deribitClient || new DeribitClient();
    this.mockClient = mockClient || new MockDeribitClient();
    this.deltaManager = deltaManager || DeltaManager.getInstance();
    this.useMockMode = process.env.USE_MOCK_MODE === 'true';
  }

  /**
   * Poll positions for all enabled accounts
   */
  async pollAllAccountsPositions(): Promise<PollingResult[]> {
    const requestId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      console.log(`🔄 [${requestId}] Starting positions polling for all enabled accounts`);

      const accounts = this.configLoader.getEnabledAccounts();
      if (accounts.length === 0) {
        console.log(`⚠️ [${requestId}] No enabled accounts found for polling`);
        return [];
      }

      const results: PollingResult[] = [];

      for (const account of accounts) {
        try {
          console.log(`📊 [${requestId}] Polling account: ${account.name}`);

          if (this.useMockMode) {
            // Mock mode: generate simulated data
            const mockPositions = this.generateMockPositions();
            
            results.push({
              accountName: account.name,
              success: true,
              mockMode: true,
              data: mockPositions,
              timestamp: new Date().toISOString()
            });

            console.log(`✅ [${requestId}] Mock data generated for ${account.name}: ${mockPositions.length} positions`);
          } else {
            // Real mode: call Deribit API
            const positionsData = await this.fetchRealPositions(account.name, requestId);
            
            if (positionsData.success && positionsData.data) {
              // Analyze positions for delta adjustments
              await this.analyzePositionsForAdjustment(positionsData.data, account.name, requestId);
            }

            results.push(positionsData);
          }

        } catch (accountError) {
          console.error(`❌ [${requestId}] Failed to poll account ${account.name}:`, accountError);
          results.push({
            accountName: account.name,
            success: false,
            error: accountError instanceof Error ? accountError.message : 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Summary results
      const successCount = results.filter(r => r.success).length;
      const totalPositions = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.data?.length || 0), 0);

      console.log(`📊 [${requestId}] Polling completed: ${successCount}/${accounts.length} accounts successful, ${totalPositions} total positions`);

      return results;

    } catch (error) {
      console.error(`💥 [${requestId}] Polling error:`, error);
      throw error;
    }
  }

  /**
   * Generate mock position data for testing
   */
  private generateMockPositions(): any[] {
    const currencies = ['BTC', 'ETH', 'SOL'];
    return currencies.map(currency => ({
      instrument_name: `${currency}-8AUG25-${currency === 'BTC' ? '113000' : currency === 'ETH' ? '3500' : '200'}-C`,
      size: Math.random() * 20 - 10, // -10 to 10
      direction: Math.random() > 0.5 ? 'buy' : 'sell',
      average_price: Math.random() * 0.05,
      mark_price: Math.random() * 0.05,
      unrealized_pnl: (Math.random() - 0.5) * 2,
      delta: (Math.random() - 0.5) * 2
    })).filter(pos => pos.size !== 0); // Only keep non-zero positions
  }

  /**
   * Fetch real position data from Deribit API
   */
  private async fetchRealPositions(accountName: string, requestId: string): Promise<PollingResult> {
    try {
      await this.deribitAuth.authenticate(accountName);
      const tokenInfo = this.deribitAuth.getTokenInfo(accountName);

      if (!tokenInfo) {
        throw new Error(`Authentication failed for ${accountName}`);
      }

      const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
      const apiConfig = getConfigByEnvironment(isTestEnv);
      const authInfo = createAuthInfo(tokenInfo.accessToken);
      const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

      // Get all option positions (not specifying currency returns all currencies' options)
      const allPositions = await privateAPI.getPositions({
        kind: 'option'
      });

      // Only keep positions with size != 0
      const activePositions = allPositions.filter(pos => pos.size !== 0);

      console.log(`✅ [${requestId}] Real data fetched for ${accountName}: ${activePositions.length} active positions`);

      return {
        accountName,
        success: true,
        mockMode: false,
        data: activePositions,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ [${requestId}] Failed to fetch positions for ${accountName}:`, error);
      return {
        accountName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Analyze positions for delta adjustments
   */
  private async analyzePositionsForAdjustment(positions: any[], accountName: string, requestId: string): Promise<void> {
    for (const pos of positions) {
      try {
        // Calculate position delta per unit = pos.delta / pos.size
        const positionDelta = pos.delta && pos.size !== 0 ? pos.delta / pos.size : 0;

        // Query Delta database records for this position
        const deltaRecords = this.deltaManager.getRecords({
          account_id: accountName,
          instrument_name: pos.instrument_name
        });

        if (deltaRecords.length > 0) {
          // Find the latest record
          const latestRecord = deltaRecords.sort((a, b) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return timeB - timeA;
          })[0];

          if (latestRecord.min_expire_days != null && latestRecord.move_position_delta !== undefined) {
            const targetDeltaAbs = Math.abs(latestRecord.target_delta || 0);
            const positionDeltaAbs = Math.abs(positionDelta);

            // If |move_position_delta| < |position delta|, trigger adjustment
            if (targetDeltaAbs < positionDeltaAbs) {
              console.log(`📊 [${requestId}] Position Delta Analysis - ${accountName}:`);
              console.log(`   🎯 Instrument: ${pos.instrument_name}`);
              console.log(`   📈 Position Size: ${pos.size}`);
              console.log(`   🔢 Position Delta: ${pos.delta?.toFixed(4) || 'N/A'}`);
              console.log(`   📐 Delta per Unit: ${positionDelta.toFixed(4)}`);
              console.log(`   🎯 Target Delta: ${latestRecord.target_delta}`);
              console.log(`   📊 Move Position Delta: ${latestRecord.move_position_delta || 0}`);
              console.log(`   ⚖️ Condition: |${latestRecord.move_position_delta || 0}| < |${positionDelta.toFixed(4)}| = ${targetDeltaAbs < positionDeltaAbs ? 'TRUE' : 'FALSE'}`);

              // Send notification to WeChat
              await this.sendAdjustmentNotification(accountName, pos, latestRecord, requestId);

              // Trigger position adjustment
              const tokenInfo = this.deribitAuth.getTokenInfo(accountName);
              if (tokenInfo) {
                const adjustmentResult = await executePositionAdjustment(
                  {
                    requestId,
                    accountName,
                    currentPosition: pos,
                    deltaRecord: latestRecord,
                    accessToken: tokenInfo.accessToken
                  },
                  {
                    deribitClient: this.deribitClient,
                    deltaManager: this.deltaManager,
                    deribitAuth: this.deribitAuth,
                    mockClient: this.mockClient,
                    configLoader: this.configLoader
                  }
                );

                // Send result notifications
                await this.sendAdjustmentResultNotification(accountName, adjustmentResult, requestId);
              }
            }
          }
        }

      } catch (posError) {
        console.warn(`⚠️ [${requestId}] Failed to analyze position ${pos.instrument_name}:`, posError);
      }
    }
  }

  /**
   * Send adjustment start notification to WeChat
   */
  private async sendAdjustmentNotification(accountName: string, position: any, record: any, requestId: string): Promise<void> {
    try {
      const bot = this.configLoader.getAccountWeChatBot(accountName);
      if (bot) {
        const positionDelta = position.delta && position.size !== 0 ? position.delta / position.size : 0;
        
        const notificationContent = `🔄 **Delta 仓位调整开始**
👤 **账户**: ${accountName}
🎯 **合约**: ${position.instrument_name}
📈 **仓位大小**: ${position.size}
🔢 **仓位Delta**: ${position.delta?.toFixed(4) || 'N/A'}
📐 **单位Delta**: ${positionDelta.toFixed(4)}
🎯 **目标Delta**: ${Math.abs(record.target_delta || 0)}
📊 **移动仓位Delta**: ${record.move_position_delta || 0}
📅 **记录创建时间**: ${record.created_at ? new Date(record.created_at).toLocaleString('zh-CN') : '未知'}
🆔 **记录ID**: ${record.id}
🔄 **请求ID**: ${requestId}
⏰ **开始时间**: ${new Date().toLocaleString('zh-CN')}`;

        await bot.sendMarkdown(notificationContent);
        console.log(`📱 [${requestId}] WeChat notification sent for account: ${accountName}`);
      }
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to send WeChat notification for account ${accountName}:`, error);
    }
  }

  /**
   * Send adjustment result notification to WeChat
   */
  private async sendAdjustmentResultNotification(accountName: string, result: any, requestId: string): Promise<void> {
    try {
      const bot = this.configLoader.getAccountWeChatBot(accountName);
      if (!bot) return;

      if (result.success) {
        // Success notification
        const successContent = `✅ **Delta 仓位调整成功**

👤 **账户**: ${accountName}
📊 **调整详情**: ${result.oldInstrument} → ${result.newInstrument}
📈 **仓位变化**: ${result.adjustmentSummary?.oldSize} → ${result.adjustmentSummary?.newDirection} ${result.adjustmentSummary?.newQuantity}
🎯 **目标Delta**: ${result.adjustmentSummary?.targetDelta}
🔄 **请求ID**: ${requestId}
⏰ **完成时间**: ${new Date().toLocaleString('zh-CN')}

🎉 **调整已成功完成！**`;

        await bot.sendMarkdown(successContent);
        console.log(`📱 [${requestId}] Success notification sent for account: ${accountName}`);
      } else {
        // Error notification
        const errorContent = `❌ **Delta 仓位调整失败**

👤 **账户**: ${accountName}
💬 **失败原因**: ${result.reason}
${result.error ? `📋 **错误详情**: \`\`\`\n${result.error}\n\`\`\`` : ''}
🔄 **请求ID**: ${requestId}
⏰ **失败时间**: ${new Date().toLocaleString('zh-CN')}

⚠️ **请检查系统状态并手动处理**`;

        await bot.sendMarkdown(errorContent);
        console.log(`📱 [${requestId}] Error notification sent for account: ${accountName}`);
      }
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to send result notification for account ${accountName}:`, error);
    }
  }
}