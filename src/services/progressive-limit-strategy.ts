/**
 * 渐进式限价单策略 - 纯函数式实现
 * 通过逐步移动价格来提高成交概率
 */

import { DeribitOrder } from '../types';
import type { DeribitInstrumentDetail } from '../types/deribit-instrument';
import type { DetailedPositionInfo, ExecutionStats, OpenOrderInfo, PositionInfo } from '../types/position-info';
import { correctOrderPrice } from '../utils/price-correction';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';

/**
 * 执行渐进式限价单策略
 * @param params 策略参数
 * @param services 服务依赖
 */
export async function executeProgressiveLimitStrategy(
  params: {
    orderId: string;
    instrumentName: string;
    direction: 'buy' | 'sell';
    quantity: number;
    initialPrice: number;
    accountName: string;
    instrumentDetail: DeribitInstrumentDetail;
    timeout?: number;
    maxStep?: number;
  },
  services: {
    deribitAuth: DeribitAuth;
    deribitClient: DeribitClient;
  }
): Promise<{
  success: boolean;
  finalOrderState?: string;
  executedQuantity?: number;
  averagePrice?: number;
  positionInfo?: DetailedPositionInfo;
  message: string;
}> {
  const { deribitAuth, deribitClient } = services;
  const timeout = params.timeout || 8000; // 默认8秒
  const maxStep = params.maxStep || 3;    // 默认最大3步

  console.log(`🎯 Starting progressive limit strategy for order ${params.orderId}, timeout: ${timeout}ms, maxStep: ${maxStep}`);

  let currentStep = 0;

  while (currentStep < maxStep) {
    // 等待指定时间
    await new Promise(resolve => setTimeout(resolve, timeout));
    currentStep++;

    try {
      // 重新认证以确保token有效（因为策略可能执行30秒以上）
      await deribitAuth.authenticate(params.accountName);
      const tokenInfo = deribitAuth.getTokenInfo(params.accountName);
      if (!tokenInfo) {
        console.error(`❌ Failed to refresh token for account: ${params.accountName}`);
        break;
      }

      // 检查订单状态
      const orderStatus = await checkOrderStatus(params.orderId, tokenInfo.accessToken, deribitClient);
      if (!orderStatus || orderStatus.order_state !== 'open') {
        console.log(`✅ Order ${params.orderId} is no longer open (state: ${orderStatus?.order_state}), stopping strategy`);
        break;
      }

      const filledAmount = orderStatus.filled_amount || 0;

      // 获取最新的盘口价格
      const optionDetails = await deribitClient.getOptionDetails(params.instrumentName);
      if (!optionDetails) {
        console.error(`❌ Failed to get option details for ${params.instrumentName}`);
        continue;
      }

      const bestBidPrice = optionDetails.best_bid_price || 0;
      const bestAskPrice = optionDetails.best_ask_price || 0;

      if (bestBidPrice <= 0 || bestAskPrice <= 0) {
        console.error(`❌ Invalid bid/ask prices: bid=${bestBidPrice}, ask=${bestAskPrice}`);
        continue;
      }

      // 计算新价格
      const newPrice = calculateProgressivePrice(
        params.direction,
        params.initialPrice,
        bestBidPrice,
        bestAskPrice,
        currentStep,
        maxStep
      );

      // 使用correctOrderPrice函数修正新价格
      const priceResult = correctOrderPrice(newPrice, params.instrumentDetail);
      const correctedNewPrice = priceResult.correctedPrice;

      const remainingQuantity = Math.max(orderStatus.amount - filledAmount, 0);

      console.log(`📈 Step ${currentStep}/${maxStep}: Moving price from current to ${correctedNewPrice} (original: ${newPrice}, bid: ${bestBidPrice}, ask: ${bestAskPrice})`);
      console.log(`📦 Remaining quantity before edit: ${remainingQuantity} (filled: ${filledAmount}) | 🔧 Price correction: ${newPrice} → ${correctedNewPrice} (tick size: ${priceResult.tickSize})`);

      // 修改订单价格（只修改价格，不修改数量）
      await updateOrderPrice(params.orderId, correctedNewPrice, tokenInfo.accessToken, deribitClient, orderStatus.amount);

    } catch (error) {
      console.error(`❌ Error in progressive strategy step ${currentStep}:`, error);
      // 继续下一步，不要因为单步失败而停止整个策略
    }
  }

  // 如果达到最大步数还没成交，使用对手价格
  if (currentStep >= maxStep) {
    try {
      console.log(`🚀 Reached max steps, using market price for final execution`);

      await deribitAuth.authenticate(params.accountName);
      const tokenInfo = deribitAuth.getTokenInfo(params.accountName);
      if (!tokenInfo) {
        console.error(`❌ Failed to refresh token for final execution`);
        return {
          success: false,
          message: 'Failed to refresh token for final execution'
        };
      }

      // 检查订单是否还存在
      const orderStatus = await checkOrderStatus(params.orderId, tokenInfo.accessToken, deribitClient);
      if (orderStatus && orderStatus.order_state === 'open') {
        const optionDetails = await deribitClient.getOptionDetails(params.instrumentName);
        if (optionDetails) {
          const rawFinalPrice = params.direction === 'buy'
            ? optionDetails.best_ask_price || params.initialPrice
            : optionDetails.best_bid_price || params.initialPrice;

          // 使用correctOrderPrice函数修正最终价格
          const finalPriceResult = correctOrderPrice(rawFinalPrice, params.instrumentDetail);
          const correctedFinalPrice = finalPriceResult.correctedPrice;

          console.log(`💥 Final price adjustment: ${rawFinalPrice} → ${correctedFinalPrice} (tick size: ${finalPriceResult.tickSize})`);
          await updateOrderPrice(params.orderId, correctedFinalPrice, tokenInfo.accessToken, deribitClient, orderStatus.amount);
        }
      }
    } catch (error) {
      console.error(`❌ Error in final price adjustment:`, error);
    }
  }

  console.log(`🏁 Progressive limit strategy completed for order ${params.orderId}`);

  // 获取最终的订单状态和仓位信息
  try {
    await deribitAuth.authenticate(params.accountName);
    const tokenInfo = deribitAuth.getTokenInfo(params.accountName);
    if (!tokenInfo) {
      return {
        success: false,
        message: 'Failed to authenticate for final position check'
      };
    }

    // 检查最终订单状态
    const finalOrderStatus = await checkOrderStatus(params.orderId, tokenInfo.accessToken, deribitClient);

    let executedQuantity = 0;
    let averagePrice = 0;
    let finalOrderState = 'unknown';

    if (finalOrderStatus) {
      finalOrderState = finalOrderStatus.order_state;
      executedQuantity = finalOrderStatus.filled_amount || 0;
      averagePrice = finalOrderStatus.average_price || 0;
    }

    // 获取当前仓位信息
    const positionInfo = await getDetailedPositionInfo(
      params,
      { executedQuantity, averagePrice, currentStep },
      { deribitClient, tokenInfo }
    );

    const isFullyExecuted = finalOrderState === 'filled';
    const isPartiallyExecuted = executedQuantity > 0 && finalOrderState !== 'filled';

    return {
      success: true,
      finalOrderState,
      executedQuantity,
      averagePrice,
      positionInfo,
      message: isFullyExecuted
        ? `Order fully executed: ${executedQuantity} contracts at average price ${averagePrice}`
        : isPartiallyExecuted
        ? `Order partially executed: ${executedQuantity}/${params.quantity} contracts at average price ${averagePrice}`
        : `Order not executed, final state: ${finalOrderState}`
    };

  } catch (error) {
    console.error(`❌ Error getting final position info:`, error);
    return {
      success: false,
      message: `Strategy completed but failed to get final position info: ${error}`
    };
  }
}

/**
 * 检查订单状态
 */
async function checkOrderStatus(orderId: string, accessToken: string, deribitClient: DeribitClient): Promise<DeribitOrder | null> {
  try {
    // 通过订单ID获取订单状态
    const orderStatus = await deribitClient.getOrderState(accessToken, orderId);
    return orderStatus;
  } catch (error) {
    console.error(`❌ Error checking order status for ${orderId}:`, error);
    return null;
  }
}

/**
 * 计算渐进式价格
 */
function calculateProgressivePrice(
  direction: 'buy' | 'sell',
  initialPrice: number,
  bestBidPrice: number,
  bestAskPrice: number,
  currentStep: number,
  maxStep: number
): number {
  const stepRatio = currentStep / maxStep;
  
  if (direction === 'buy') {
    // 买单：从初始价格逐步向ask价格移动
    return initialPrice + (bestAskPrice - initialPrice) * stepRatio;
  } else {
    // 卖单：从初始价格逐步向bid价格移动
    return initialPrice - (initialPrice - bestBidPrice) * stepRatio;
  }
}

// correctOrderPrice函数已迁移到 src/utils/price-correction.ts

/**
 * 更新订单价格
 */
async function updateOrderPrice(
  orderId: string,
  newPrice: number,
  accessToken: string,
  deribitClient: DeribitClient,
  amount: number
): Promise<void> {
  try {
    await deribitClient.editOrder(accessToken, {
      order_id: orderId,
      amount: amount,
      price: newPrice
    });
    console.log(`✅ Order ${orderId} price updated to ${newPrice}`);
  } catch (error) {
    console.error(`❌ Failed to update order ${orderId} price to ${newPrice}:`, error);
    throw error;
  }
}

/**
 * 获取详细的仓位信息
 */
async function getDetailedPositionInfo(
  params: {
    orderId: string;
    instrumentName: string;
    direction: 'buy' | 'sell';
    quantity: number;
    initialPrice: number;
    accountName: string;
  },
  executionData: {
    executedQuantity: number;
    averagePrice: number;
    currentStep: number;
  },
  services: {
    deribitClient: DeribitClient;
    tokenInfo: any;
  }
): Promise<DetailedPositionInfo> {
  const { deribitClient, tokenInfo } = services;
  const { executedQuantity, averagePrice, currentStep } = executionData;
  
  try {
    const startTime = Date.now();

    // 获取相关的订单信息
    const openOrders = await deribitClient.getOpenOrders(tokenInfo.accessToken, {
      kind: 'option'
    });

    // 获取仓位信息（如果有的话）
    let positions: any[] = [];
    try {
      positions = await deribitClient.getPositions(tokenInfo.accessToken, {
        kind: 'option'
      });
    } catch (posError) {
      console.log(`ℹ️ Positions API not available or no positions found:`, posError);
    }

    // 过滤相关数据
    const relatedOrders = openOrders.filter((order: any) => order.instrument_name === params.instrumentName);
    const relatedPositions = positions.filter((pos: any) => pos.instrument_name === params.instrumentName);

    // 计算汇总信息
    const totalUnrealizedPnl = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.unrealized_pnl || 0), 0);
    const totalRealizedPnl = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.realized_pnl || 0), 0);
    const totalMaintenanceMargin = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.maintenance_margin || 0), 0);
    const totalInitialMargin = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.initial_margin || 0), 0);
    const netDelta = relatedPositions.reduce((sum: number, pos: any) => sum + (pos.delta || 0), 0);

    // 构建详细的仓位信息
    return {
      // 订单相关信息
      relatedOrders: relatedOrders as OpenOrderInfo[],
      totalOpenOrders: openOrders.length,

      // 仓位相关信息
      positions: relatedPositions as PositionInfo[],
      totalPositions: positions.length,

      // 执行统计信息
      executionStats: {
        orderId: params.orderId,
        instrumentName: params.instrumentName,
        direction: params.direction,
        requestedQuantity: params.quantity,
        executedQuantity: executedQuantity,
        averagePrice: averagePrice,
        initialPrice: params.initialPrice,
        finalPrice: averagePrice > 0 ? averagePrice : params.initialPrice,
        totalSteps: currentStep,
        executionTime: Date.now() - startTime,
        priceMovements: [] // 这里可以记录价格移动历史
      } as ExecutionStats,

      // 汇总信息
      summary: {
        totalUnrealizedPnl,
        totalRealizedPnl,
        totalMaintenanceMargin,
        totalInitialMargin,
        netDelta
      },

      // 元数据
      metadata: {
        timestamp: Date.now(),
        accountName: params.accountName,
        currency: params.instrumentName.split('-')[0], // 从工具名称提取货币
        dataSource: 'deribit_api' as const
      }
    };
  } catch (error) {
    console.error(`❌ Error getting position info:`, error);
    return {
      relatedOrders: [],
      totalOpenOrders: 0,
      positions: [],
      totalPositions: 0,
      executionStats: {
        orderId: params.orderId,
        instrumentName: params.instrumentName,
        direction: params.direction,
        requestedQuantity: params.quantity,
        executedQuantity: executedQuantity,
        averagePrice: averagePrice,
        initialPrice: params.initialPrice,
        totalSteps: currentStep,
        executionTime: 0,
        priceMovements: []
      } as ExecutionStats,
      summary: {
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        totalMaintenanceMargin: 0,
        totalInitialMargin: 0,
        netDelta: 0
      },
      metadata: {
        timestamp: Date.now(),
        accountName: params.accountName,
        currency: params.instrumentName.split('-')[0],
        dataSource: 'deribit_api' as const
      },
      error: `Failed to get position info: ${error}`
    };
  }
}
