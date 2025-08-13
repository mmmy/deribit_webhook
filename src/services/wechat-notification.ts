import { ConfigLoader } from '../config';
import { WeChatBot, createWeChatBot } from './wechat-bot';

/**
 * 企业微信通知服务
 * 用于发送各种类型的通知消息
 */
export class WeChatNotificationService {
  private bots: Map<string, WeChatBot> = new Map();
  private configLoader: ConfigLoader;

  constructor(configLoader?: ConfigLoader) {
    // 支持依赖注入，但保持向后兼容
    this.configLoader = configLoader || ConfigLoader.getInstance();
    this.initializeBots();
  }

  /**
   * 初始化所有账户的企业微信机器人
   */
  private initializeBots(): void {
    try {
      const configs = this.configLoader.getAllWeChatBotConfigs();

      if (configs.length === 0) {
        console.warn('No WeChat Bot configured - notifications will be disabled');
        return;
      }

      for (const { accountName, config } of configs) {
        try {
          const bot = createWeChatBot(config.webhookUrl, config);
          this.bots.set(accountName, bot);
          console.log(`WeChat Bot initialized for account: ${accountName}`);
        } catch (error) {
          console.error(`Failed to initialize WeChat Bot for account ${accountName}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to initialize WeChat Bots:', error);
    }
  }

  /**
   * 检查是否有任何机器人可用
   */
  public isAvailable(): boolean {
    return this.bots.size > 0;
  }

  /**
   * 检查指定账户的机器人是否可用
   */
  public isAccountBotAvailable(accountName: string): boolean {
    return this.bots.has(accountName);
  }

  /**
   * 获取指定账户的机器人
   */
  private getBot(accountName?: string): WeChatBot | null {
    if (accountName) {
      return this.bots.get(accountName) || null;
    }

    // 如果没有指定账户，返回第一个可用的机器人
    const firstBot = this.bots.values().next();
    return firstBot.done ? null : firstBot.value;
  }

  /**
   * 获取所有可用的机器人
   */
  private getAllBots(): WeChatBot[] {
    return Array.from(this.bots.values());
  }

  /**
   * 发送交易通知
   * @param symbol 交易对
   * @param action 操作类型
   * @param price 价格
   * @param quantity 数量
   * @param status 状态
   * @param accountName 账户名称（可选，不指定则发送给所有机器人）
   */
  async sendTradeNotification(
    symbol: string,
    action: 'BUY' | 'SELL',
    price: number,
    quantity: number,
    status: 'SUCCESS' | 'FAILED' | 'PENDING',
    accountName?: string
  ): Promise<void> {
    const bots = accountName ? [this.getBot(accountName)].filter(Boolean) : this.getAllBots();

    if (bots.length === 0) {
      console.warn('WeChat Bot not available - skipping trade notification');
      return;
    }

    const statusEmoji = {
      SUCCESS: '✅',
      FAILED: '❌',
      PENDING: '⏳'
    };

    const actionEmoji = {
      BUY: '📈',
      SELL: '📉'
    };

    const accountInfo = accountName ? `\n👤 **账户**: ${accountName}` : '';
    const content = `${statusEmoji[status]} **交易通知**

${actionEmoji[action]} **操作**: ${action}
📊 **交易对**: ${symbol}
💰 **价格**: ${price}
📦 **数量**: ${quantity}${accountInfo}
⏰ **时间**: ${new Date().toLocaleString('zh-CN')}
📋 **状态**: ${status}`;

    const promises = bots.map(async (bot) => {
      try {
        await bot!.sendMarkdown(content);
      } catch (error) {
        console.error('Failed to send trade notification:', error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 发送系统状态通知
   * @param service 服务名称
   * @param status 状态
   * @param message 消息
   * @param accountName 账户名称（可选，不指定则发送给所有机器人）
   */
  async sendSystemNotification(
    service: string,
    status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'WARNING',
    message: string,
    accountName?: string
  ): Promise<void> {
    const bots = accountName ? [this.getBot(accountName)].filter(Boolean) : this.getAllBots();

    if (bots.length === 0) {
      console.warn('WeChat Bot not available - skipping system notification');
      return;
    }

    const statusEmoji = {
      ONLINE: '🟢',
      OFFLINE: '🔴',
      ERROR: '❌',
      WARNING: '⚠️'
    };

    const content = `${statusEmoji[status]} **系统通知**

🔧 **服务**: ${service}
📊 **状态**: ${status}
💬 **消息**: ${message}
⏰ **时间**: ${new Date().toLocaleString('zh-CN')}`;

    const promises = bots.map(async (bot) => {
      try {
        await bot!.sendMarkdown(content);
      } catch (error) {
        console.error('Failed to send system notification:', error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 发送价格预警通知
   * @param symbol 交易对
   * @param currentPrice 当前价格
   * @param targetPrice 目标价格
   * @param direction 方向
   * @param accountName 账户名称（可选，不指定则发送给所有机器人）
   */
  async sendPriceAlert(
    symbol: string,
    currentPrice: number,
    targetPrice: number,
    direction: 'ABOVE' | 'BELOW',
    accountName?: string
  ): Promise<void> {
    const bots = accountName ? [this.getBot(accountName)].filter(Boolean) : this.getAllBots();

    if (bots.length === 0) {
      console.warn('WeChat Bot not available - skipping price alert');
      return;
    }

    const directionText = direction === 'ABOVE' ? '突破' : '跌破';
    const emoji = direction === 'ABOVE' ? '🚀' : '📉';

    const content = `${emoji} **价格预警**

📊 **交易对**: ${symbol}
💰 **当前价格**: ${currentPrice}
🎯 **目标价格**: ${targetPrice}
📈 **触发条件**: 价格${directionText}目标价格
⏰ **时间**: ${new Date().toLocaleString('zh-CN')}`;

    const promises = bots.map(async (bot) => {
      try {
        await bot!.sendMarkdown(content);
      } catch (error) {
        console.error('Failed to send price alert:', error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 发送错误通知
   * @param error 错误信息
   * @param context 上下文信息
   * @param accountName 账户名称（可选，不指定则发送给所有机器人）
   */
  async sendErrorNotification(error: Error, context?: string, accountName?: string): Promise<void> {
    const bots = accountName ? [this.getBot(accountName)].filter(Boolean) : this.getAllBots();

    if (bots.length === 0) {
      console.warn('WeChat Bot not available - skipping error notification');
      return;
    }

    const content = `❌ **错误通知**

🔧 **上下文**: ${context || '未知'}
💬 **错误信息**: ${error.message}
📋 **错误堆栈**: \`\`\`
${error.stack?.substring(0, 500) || 'No stack trace available'}
\`\`\`
⏰ **时间**: ${new Date().toLocaleString('zh-CN')}`;

    const promises = bots.map(async (bot) => {
      try {
        await bot!.sendMarkdown(content);
      } catch (error) {
        console.error('Failed to send error notification:', error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 发送自定义文本消息
   * @param message 消息内容
   * @param mentionAll 是否@所有人
   * @param accountName 账户名称（可选，不指定则发送给所有机器人）
   */
  async sendCustomMessage(message: string, mentionAll: boolean = false, accountName?: string): Promise<void> {
    const bots = accountName ? [this.getBot(accountName)].filter(Boolean) : this.getAllBots();

    if (bots.length === 0) {
      console.warn('WeChat Bot not available - skipping custom message');
      return;
    }

    const promises = bots.map(async (bot) => {
      try {
        if (mentionAll) {
          await bot!.sendText(message, ['@all']);
        } else {
          await bot!.sendText(message);
        }
      } catch (error) {
        console.error('Failed to send custom message:', error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 发送日报
   * @param data 日报数据
   * @param accountName 账户名称（可选，不指定则发送给所有机器人）
   */
  async sendDailyReport(data: {
    totalTrades: number;
    successfulTrades: number;
    failedTrades: number;
    totalVolume: number;
    totalProfit: number;
  }, accountName?: string): Promise<void> {
    const bots = accountName ? [this.getBot(accountName)].filter(Boolean) : this.getAllBots();

    if (bots.length === 0) {
      console.warn('WeChat Bot not available - skipping daily report');
      return;
    }

    const successRate = data.totalTrades > 0 ?
      ((data.successfulTrades / data.totalTrades) * 100).toFixed(2) : '0.00';

    const profitEmoji = data.totalProfit >= 0 ? '📈' : '📉';

    const content = `📊 **每日交易报告**

📅 **日期**: ${new Date().toLocaleDateString('zh-CN')}
🔢 **总交易数**: ${data.totalTrades}
✅ **成功交易**: ${data.successfulTrades}
❌ **失败交易**: ${data.failedTrades}
📊 **成功率**: ${successRate}%
💰 **总交易量**: ${data.totalVolume.toFixed(2)}
${profitEmoji} **总盈亏**: ${data.totalProfit.toFixed(2)}

⏰ **生成时间**: ${new Date().toLocaleString('zh-CN')}`;

    const promises = bots.map(async (bot) => {
      try {
        await bot!.sendMarkdown(content);
      } catch (error) {
        console.error('Failed to send daily report:', error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 发送未成交订单处理结果通知
   * @param accountName 账户名称
   * @param results 处理结果数组
   * @param requestId 请求ID
   * @param overallSuccess 整体处理是否成功
   * @param errorMessage 错误信息（如果有）
   */
  async sendPendingOrdersNotification(
    accountName: string,
    results: any[],
    requestId: string,
    overallSuccess: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    const bot = this.getBot(accountName);
    if (!bot) {
      console.warn(`WeChat Bot not available for account ${accountName} - skipping pending orders notification`);
      return;
    }

    try {
      let content: string;

      // 检查是否是整体处理失败
      if (!overallSuccess) {
        content = `❌ **未成交订单处理失败**

👤 **账户**: ${accountName}
💬 **失败原因**: ${errorMessage || '未知错误'}
🔄 **请求ID**: ${requestId}
⏰ **失败时间**: ${new Date().toLocaleString('zh-CN')}

⚠️ **请检查系统状态和网络连接**`;
      } else {
        // 整体处理成功，检查具体订单处理结果
        const processedCount = results.length;
        const successCount = results.filter(r => r.result?.success).length;

        if (processedCount === 0) {
          // 没有找到需要处理的订单
          content = `ℹ️ **未成交订单检查完成**

👤 **账户**: ${accountName}
📊 **检查结果**: 未发现需要处理的限价订单
🔄 **请求ID**: ${requestId}
⏰ **检查时间**: ${new Date().toLocaleString('zh-CN')}

✅ **当前无需要优化的订单**`;
        } else if (successCount > 0) {
          // 有成功处理的订单
          content = `🎯 **未成交订单自动处理完成**

👤 **账户**: ${accountName}
📊 **处理结果**: ${successCount}/${processedCount} 订单成功执行渐进式策略
🔄 **请求ID**: ${requestId}
⏰ **处理时间**: ${new Date().toLocaleString('zh-CN')}

**成功处理的订单**:`;

          // 添加成功处理的订单详情
          const successResults = results.filter(r => r.result?.success);
          for (const result of successResults) {
            content += `\n📈 ${result.instrument_name} (${result.order_id})`;
          }

          // 如果有失败的订单，也显示
          const failedResults = results.filter(r => !r.result?.success);
          if (failedResults.length > 0) {
            content += `\n\n**未能处理的订单**:`;
            for (const result of failedResults) {
              content += `\n⚠️ ${result.instrument_name} (${result.order_id})`;
            }
          }

          content += `\n\n✅ **成功订单已自动优化成交，仓位已更新**`;
        } else {
          // 没有成功处理的订单
          content = `⚠️ **未成交订单处理未成功**

👤 **账户**: ${accountName}
📊 **处理结果**: 0/${processedCount} 订单成功执行
🔄 **请求ID**: ${requestId}
⏰ **处理时间**: ${new Date().toLocaleString('zh-CN')}

**未能处理的订单**:`;

          for (const result of results) {
            content += `\n⚠️ ${result.instrument_name} (${result.order_id})`;
          }

          content += `\n\n❌ **可能原因：价差过大或市场条件不适合**`;
        }
      }

      await bot.sendText(content);
      console.log(`✅ Pending orders notification sent for account: ${accountName}`);

    } catch (error) {
      console.error(`❌ Failed to send pending orders notification for account ${accountName}:`, error);
    }
  }
}

// 创建单例实例
export const wechatNotification = new WeChatNotificationService();

export default WeChatNotificationService;
