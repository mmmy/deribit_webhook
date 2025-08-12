/**
 * 订单支持函数 - 纯函数版本
 * 将原来的 handleNonImmediateOrder, recordPositionInfoToDatabase, sendOrderNotification 重构为纯函数
 */

import { ConfigLoader } from '../config';
import { DeltaManager } from '../database/delta-manager';
import { DeltaRecordType } from '../database/types';
import { OptionTradingParams } from '../types';
import type { DetailedPositionInfo } from '../types/position-info';

// 依赖注入接口
export interface OrderSupportDependencies {
  deltaManager: DeltaManager;
  configLoader: ConfigLoader;
}

// 订单通知信息接口
export interface OrderNotificationInfo {
  instrumentName: string;
  direction: string;
  quantity: number;
  price: number;
  orderId: string;
  orderState: string;
  filledAmount: number;
  averagePrice: number;
  success: boolean;
  extraMsg?: string;
  bestBidPrice?: number;
  bestAskPrice?: number;
}

/**
 * 处理非立即成交的订单，将其记录到delta数据库
 * @param orderResult 订单结果
 * @param params 交易参数
 * @param instrumentName 合约名称
 * @param quantity 数量
 * @param price 价格
 * @param dependencies 依赖注入
 */
export async function handleNonImmediateOrder(
  orderResult: any,
  params: OptionTradingParams,
  instrumentName: string,
  quantity: number,
  price: number,
  dependencies: OrderSupportDependencies
): Promise<void> {
  try {
    console.log(`🔍 handleNonImmediateOrder called with delta1: ${params.delta1}, delta2: ${params.delta2}, tv_id: ${params.tv_id}`);

    // 检查是否为开仓订单且有delta1或delta2参数
    const isOpeningOrder = ['open', 'open_long', 'open_short'].includes(params.action);
    const hasDelta1 = params.delta1 !== undefined;
    const hasDelta2 = params.delta2 !== undefined;
    const orderState = orderResult.order?.order_state;

    console.log(`📊 Order checks: opening=${isOpeningOrder}, hasDelta1=${hasDelta1}, hasDelta2=${hasDelta2}, orderState=${orderState}`);

    // 如果是开仓订单且有delta1或delta2参数，则记录到数据库
    // 无论订单是否立即成交，都要记录Delta值
    if (isOpeningOrder && (hasDelta1 || hasDelta2)) {
      console.log(`📝 Recording opening order to delta database (state: ${orderState})`);

      // 创建delta记录
      // 如果订单立即成交，记录为仓位；否则记录为订单
      const recordType = orderState === 'filled' ? DeltaRecordType.POSITION : DeltaRecordType.ORDER;
      const deltaRecord = {
        account_id: params.accountName,
        instrument_name: instrumentName,
        target_delta: params.delta2 || 0, // delta2记录到target_delta字段，如果没有则默认为0
        move_position_delta: params.delta1 || 0, // delta1记录到move_position_delta字段，如果没有则默认为0
        min_expire_days: params.n || null, // 使用n参数作为最小到期天数，如果没有则为null
        order_id: recordType === DeltaRecordType.ORDER ? (orderResult.order?.order_id || '') : null,
        tv_id: params.tv_id || null, // 从webhook payload中获取TradingView信号ID
        action: params.action, // 记录交易动作
        record_type: recordType
      };

      dependencies.deltaManager.createRecord(deltaRecord);
      console.log(`✅ Delta record created as ${recordType} for ${orderResult.order?.order_id} with delta1=${params.delta1} (move_position_delta), delta2=${params.delta2} (target_delta), tv_id=${params.tv_id}`);
    }
  } catch (error) {
    console.error('❌ Failed to handle non-immediate order:', error);
    // 不抛出错误，避免影响主要的交易流程
  }
}

/**
 * 将仓位信息记录到delta数据库中
 * 如果已存在合约信息，则更新；否则新增记录
 * @param strategyResult 策略结果
 * @param params 交易参数
 * @param dependencies 依赖注入
 */
export async function recordPositionInfoToDatabase(
  strategyResult: {
    success: boolean;
    finalOrderState?: string;
    executedQuantity?: number;
    averagePrice?: number;
    positionInfo?: DetailedPositionInfo;
    message: string;
  },
  params: OptionTradingParams,
  dependencies: OrderSupportDependencies
): Promise<void> {
  try {
    if (!strategyResult.success || !strategyResult.positionInfo) {
      console.log(`ℹ️ 跳过数据库记录：策略未成功或无仓位信息`);
      return;
    }

    const posInfo = strategyResult.positionInfo;
    const executionStats = posInfo.executionStats;

    // 检查是否有实际成交
    if (!executionStats.executedQuantity || executionStats.executedQuantity <= 0) {
      console.log(`ℹ️ 跳过数据库记录：无实际成交 (executedQuantity: ${executionStats.executedQuantity})`);
      return;
    }

    // 从仓位信息中提取Delta值
    let targetDelta = 0;
    let movePositionDelta = 0;

    // 优先使用原始参数中的delta值
    if (params.delta2 !== undefined) {
      targetDelta = params.delta2;
    }
    if (params.delta1 !== undefined) {
      movePositionDelta = params.delta1;
    }

    // 如果原始参数没有delta值，尝试从仓位信息中获取
    if (targetDelta === 0 && posInfo.positions.length > 0) {
      // 计算净Delta值作为target_delta
      targetDelta = posInfo.summary.netDelta || 0;
    }

    // 创建或更新delta记录
    const deltaRecord = {
      account_id: posInfo.metadata.accountName,
      instrument_name: executionStats.instrumentName,
      target_delta: Math.max(-1, Math.min(1, targetDelta)), // 确保在[-1, 1]范围内
      move_position_delta: Math.max(-1, Math.min(1, movePositionDelta)), // 确保在[-1, 1]范围内
      min_expire_days: params.n || null, // 使用n参数作为最小到期天数，如果没有则为null
      tv_id: params.tv_id || null, // 从webhook payload中获取TradingView信号ID
      action: params.action, // 记录交易动作
      record_type: DeltaRecordType.POSITION // 策略完成后记录为仓位
    };

    // 使用upsert操作：如果存在则更新，否则创建
    const record = dependencies.deltaManager.upsertRecord(deltaRecord);

    console.log(`✅ 仓位信息已记录到delta数据库:`, {
      id: record.id,
      account_id: record.account_id,
      instrument_name: record.instrument_name,
      target_delta: record.target_delta,
      move_position_delta: record.move_position_delta,
      tv_id: record.tv_id,
      executed_quantity: executionStats.executedQuantity,
      average_price: executionStats.averagePrice
    });

  } catch (error) {
    console.error(`❌ 记录仓位信息到数据库失败:`, error);
    // 不抛出错误，避免影响主要的交易流程
  }
}

/**
 * 发送订单通知到企业微信
 * @param accountName 账户名称
 * @param orderInfo 订单信息
 * @param dependencies 依赖注入
 */
export async function sendOrderNotification(
  accountName: string,
  orderInfo: OrderNotificationInfo,
  dependencies: OrderSupportDependencies
): Promise<void> {
  try {
    const account = dependencies.configLoader.getAccountByName(accountName);
    if (!account) {
      console.warn(`⚠️ Account ${accountName} not found, skipping WeChat notification`);
      return;
    }

    const bot = dependencies.configLoader.getAccountWeChatBot(accountName);
    if (!bot) {
      console.log(`📱 No WeChat bot configured for account ${accountName}, skipping notification`);
      return;
    }

    // 构建通知内容
    const statusIcon = orderInfo.success ? '✅' : '❌';
    const statusText = orderInfo.success ? '成功' : '失败';
    const directionText = orderInfo.direction === 'buy' ? '买入' : '卖出';
    const orderStateText = getOrderStateText(orderInfo.orderState);

    const notificationContent = `${statusIcon} **期权交易${statusText}**

👤 账户: ${accountName}
🎯 合约: ${orderInfo.instrumentName}
📊 操作: ${directionText} ${orderInfo.quantity} 张
💰 价格: $${orderInfo.price}${orderInfo.bestBidPrice !== undefined && orderInfo.bestAskPrice !== undefined ? ` | 买1: $${orderInfo.bestBidPrice} 卖1: $${orderInfo.bestAskPrice}` : ''}
🆔 订单ID: ${orderInfo.orderId}
📈 状态: ${orderStateText}
${orderInfo.extraMsg ? `ℹ️ ${orderInfo.extraMsg}` : ''}
${orderInfo.filledAmount > 0 ? `✅ 成交数量: ${orderInfo.filledAmount} 张` : ''}
${orderInfo.averagePrice > 0 ? `💵 成交均价: $${orderInfo.averagePrice}` : ''}
⏰ 时间: ${new Date().toLocaleString('zh-CN')}`;

    await bot.sendMarkdown(notificationContent);
    console.log(`📱 Order notification sent to WeChat for account: ${accountName}`);
  } catch (error) {
    console.error(`❌ Failed to send order notification for account ${accountName}:`, error);
  }
}

/**
 * 获取订单状态的中文描述
 * @param orderState 订单状态
 * @returns 中文描述
 */
export function getOrderStateText(orderState: string): string {
  const stateMap: { [key: string]: string } = {
    'open': '未成交',
    'filled': '已成交',
    'rejected': '已拒绝',
    'cancelled': '已取消',
    'untriggered': '未触发',
    'triggered': '已触发',
    'unknown': '未知状态'
  };
  return stateMap[orderState] || orderState;
}
