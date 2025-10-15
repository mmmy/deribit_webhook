/**
 * 纯函数版本的期权下单功能
 * 将原来的 placeOptionOrder 方法重构为纯函数
 */

import { ConfigLoader } from '../config';
import { OptionTradingParams, OptionTradingResult } from '../types';
import { correctOrderParameters, correctOrderPrice } from '../utils/price-correction';
import { calculateSpreadRatio, calculateSpreadTickMultiple, formatSpreadRatioAsPercentage } from '../utils/spread-calculation';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';
import { MockDeribitClient } from './mock-deribit';
import {
  handleNonImmediateOrder as handleNonImmediateOrderPure,
  OrderNotificationInfo,
  OrderSupportDependencies,
  recordPositionInfoToDatabase as recordPositionInfoToDatabasePure,
  sendOrderNotification as sendOrderNotificationPure
} from './order-support-functions';

// 依赖注入接口
export interface PlaceOrderDependencies {
  deribitAuth: DeribitAuth;
  deribitClient: DeribitClient;
  mockClient: MockDeribitClient;
  configLoader: ConfigLoader;
  orderSupportDependencies: OrderSupportDependencies;
}

/**
 * 纯函数版本的期权下单
 * @param instrumentName 期权工具名称
 * @param params 交易参数
 * @param useMockMode 是否使用模拟模式
 * @param dependencies 依赖注入
 * @returns 交易结果
 */
export async function placeOptionOrder(
  instrumentName: string,
  params: OptionTradingParams,
  useMockMode: boolean,
  dependencies: PlaceOrderDependencies
): Promise<OptionTradingResult> {
  console.log(`📋 Placing order for instrument: ${instrumentName}`);
  
  try {
    if (useMockMode) {
      return await handleMockOrder(instrumentName, params, dependencies);
    } else {
      return await handleRealOrder(instrumentName, params, dependencies);
    }
  } catch (error) {
    return await handleOrderError(instrumentName, params, error, dependencies);
  }
}

function isReduceOnlyAction(action: OptionTradingParams['action']): boolean {
  return [
    'close_long',
    'close_short',
    'reduce_long',
    'reduce_short',
    'stop_long',
    'stop_short'
  ].includes(action);
}

/**
 * 处理模拟订单
 */
async function handleMockOrder(
  instrumentName: string,
  params: OptionTradingParams,
  dependencies: PlaceOrderDependencies
): Promise<OptionTradingResult> {
  console.log(`[MOCK] Placing ${params.direction} order for ${params.quantity} contracts of ${instrumentName}`);

  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 200));

  // 模拟订单结果（非立即成交）
  const mockOrderResult = {
    order: {
      order_id: `mock_order_${Date.now()}`,
      order_state: 'open', // 模拟非立即成交状态
      filled_amount: 0,
      average_price: 0
    }
  };

  // 检查是否为非立即成交的开仓订单，如果是则记录到delta数据库
  console.log(`🔍 Checking for delta2 parameter: ${params.delta2}`);
  await handleNonImmediateOrderPure(mockOrderResult, params, instrumentName, params.quantity, params.price || 0.05, dependencies.orderSupportDependencies);

  return {
    success: true,
    orderId: mockOrderResult.order.order_id,
    message: `Successfully placed ${params.action} ${params.direction} order`,
    instrumentName,
    executedQuantity: params.quantity,
    executedPrice: params.price || 0.05
  };
}

/**
 * 处理真实订单
 */
async function handleRealOrder(
  instrumentName: string,
  params: OptionTradingParams,
  dependencies: PlaceOrderDependencies
): Promise<OptionTradingResult> {
  console.log(`[REAL] Placing ${params.direction} order for ${params.quantity} contracts of ${instrumentName}`);
  const reduceOnly = isReduceOnlyAction(params.action);
  
  // 1. 获取账户信息和认证
  const account = dependencies.configLoader.getAccountByName(params.accountName);
  if (!account) {
    throw new Error(`Account not found: ${params.accountName}`);
  }
  
  await dependencies.deribitAuth.authenticate(params.accountName);
  const tokenInfo = dependencies.deribitAuth.getTokenInfo(params.accountName);
  if (!tokenInfo) {
    throw new Error(`Authentication failed for account: ${params.accountName}`);
  }
  
  // 2. 获取期权工具信息和价格信息
  const instrumentInfo = await dependencies.deribitClient.getInstrument(instrumentName);
  if (!instrumentInfo) {
    throw new Error(`Failed to get instrument info for ${instrumentName}`);
  }

  const optionDetails = await dependencies.deribitClient.getOptionDetails(instrumentName);
  if (!optionDetails) {
    throw new Error(`Failed to get option details for ${instrumentName}`);
  }

  // 3. 计算入场价格和订单数量
  const { entryPrice, finalQuantity, finalPrice } = calculateOrderParameters(
    params,
    instrumentInfo,
    optionDetails
  );

  // 4. 计算价差并决定策略
  const spreadRatio = calculateSpreadRatio(optionDetails.best_bid_price, optionDetails.best_ask_price);
  console.log('盘口价差:', formatSpreadRatioAsPercentage(spreadRatio));

  const spreadRatioThreshold = parseFloat(process.env.SPREAD_RATIO_THRESHOLD || '0.15');
  const spreadTickThreshold = parseInt(process.env.SPREAD_TICK_MULTIPLE_THRESHOLD || '2', 10);

  // 使用新的综合价差判断逻辑
  const { isSpreadReasonable } = await import('../utils/spread-calculation');
  const isReasonable = isSpreadReasonable(
    optionDetails.best_bid_price,
    optionDetails.best_ask_price,
    instrumentInfo.tick_size,
    spreadRatioThreshold,
    spreadTickThreshold
  );

  console.log(`价差检查: 比率=${formatSpreadRatioAsPercentage(spreadRatio)}, 步进倍数=${((optionDetails.best_ask_price - optionDetails.best_bid_price) / instrumentInfo.tick_size).toFixed(1)}, 合理=${isReasonable}`);

  if (!isReasonable) {
    return await handleWideSpreadOrder(instrumentName, params, finalQuantity, finalPrice, spreadRatio, instrumentInfo, optionDetails, tokenInfo.accessToken, dependencies, reduceOnly);
  } else {
    return await handleNarrowSpreadOrder(instrumentName, params, finalQuantity, finalPrice, spreadRatio, instrumentInfo, optionDetails, tokenInfo.accessToken, dependencies, reduceOnly);
  }
}

/**
 * 计算订单参数
 */
function calculateOrderParameters(
  params: OptionTradingParams,
  instrumentInfo: any,
  optionDetails: any
): { entryPrice: number; finalQuantity: number; finalPrice: number } {
  // 计算入场价格 (买一 + 卖一) / 2
  const entryPrice = (optionDetails.best_bid_price + optionDetails.best_ask_price) / 2;
  console.log(`📊 Entry price calculated: ${entryPrice} (bid: ${optionDetails.best_bid_price}, ask: ${optionDetails.best_ask_price})`);
  console.log(`📊 Instrument info: tick_size=${instrumentInfo.tick_size}, min_trade_amount=${instrumentInfo.min_trade_amount}`);

  // 计算下单数量
  let orderQuantity = params.quantity;

  // 如果qtyType是cash，将美元金额转换为合约数量
  if (params.qtyType === 'cash') {
    if (instrumentInfo.settlement_currency === 'USDC') {
      // USDC期权：qtyType=cash表示USDC价值，直接使用不需要换算
      orderQuantity = params.quantity / entryPrice;
      console.log(`💰 USDC Cash mode: converting $${params.quantity} to ${orderQuantity} contracts by dividing by entry price ${entryPrice}`);
    } else {
      // 传统期权：需要根据期权价格和指数价格换算
      orderQuantity = params.quantity / (entryPrice * optionDetails.index_price);
      console.log(`💰 Cash mode: converting $${params.quantity} to ${orderQuantity} contracts at price ${entryPrice}`);
    }
  } else if (params.qtyType === 'fixed') { // fixed表示是合约数量
    console.log(`💰 Fixed mode: using ${params.quantity} contracts directly`);
    if (instrumentInfo.settlement_currency === 'USDC') {
      orderQuantity = params.quantity * (params.price || optionDetails.index_price);
    } else {
      orderQuantity = params.quantity / entryPrice;
    }
  }

  if (orderQuantity <= 0) {
    throw new Error(`Invalid order quantity: ${orderQuantity}`);
  }

  // 修正订单参数以符合Deribit要求
  const correctedParams = correctOrderParameters(entryPrice, orderQuantity, instrumentInfo);
  console.log(`🔧 Parameter correction: price ${entryPrice} → ${correctedParams.correctedPrice}, amount ${orderQuantity} → ${correctedParams.correctedAmount}`);

  return {
    entryPrice,
    finalQuantity: correctedParams.correctedAmount,
    finalPrice: correctedParams.correctedPrice
  };
}

/**
 * 处理价差过大的订单（直接下单）
 */
async function handleWideSpreadOrder(
  instrumentName: string,
  params: OptionTradingParams,
  finalQuantity: number,
  finalPrice: number,
  spreadRatio: number,
  instrumentInfo: any,
  optionDetails: any,
  accessToken: string,
  dependencies: PlaceOrderDependencies,
  reduceOnly: boolean
): Promise<OptionTradingResult> {
  const orderResult = await dependencies.deribitClient.placeOrder(
    instrumentName,
    params.direction,
    finalQuantity,
    'limit',
    finalPrice,
    accessToken,
    reduceOnly
  );
  console.log(`✅ Order placed successfully:`, orderResult);

  // 检查是否为非立即成交的开仓订单，如果是则记录到delta数据库
  await handleNonImmediateOrderPure(orderResult, params, instrumentName, finalQuantity, finalPrice, dependencies.orderSupportDependencies);

  // 发送通知到企业微信
  const spreadPercentage = (spreadRatio * 100).toFixed(1);
  const extraMsg = `盘口价差过大: ${spreadPercentage}%`;

  // 计算步进倍数信息
  const tickMultiple = calculateSpreadTickMultiple(optionDetails.best_bid_price, optionDetails.best_ask_price, instrumentInfo.tick_size);

  const orderInfo: OrderNotificationInfo = {
    instrumentName,
    direction: orderResult.order?.direction,
    quantity: finalQuantity,
    price: finalPrice,
    orderId: orderResult.order?.order_id || `deribit_${Date.now()}`,
    orderState: orderResult.order?.order_state || 'unknown',
    filledAmount: orderResult.order?.filled_amount || 0,
    averagePrice: orderResult.order?.average_price || 0,
    success: true,
    extraMsg: extraMsg,
    bestBidPrice: optionDetails.best_bid_price,
    bestAskPrice: optionDetails.best_ask_price,
    tickSize: instrumentInfo.tick_size,
    spreadRatio: spreadRatio,
    tickMultiple: tickMultiple
  };

  await sendOrderNotificationPure(params.accountName, orderInfo, dependencies.orderSupportDependencies);

  return {
    success: true,
    orderId: orderResult.order?.order_id || `deribit_${Date.now()}`,
    message: `Successfully placed ${params.direction} order for ${finalQuantity} contracts`,
    instrumentName,
    executedQuantity: orderResult.order?.filled_amount || finalQuantity,
    executedPrice: orderResult.order?.average_price || finalPrice
  };
}

/**
 * 处理价差较小的订单（渐进式策略）
 */
async function handleNarrowSpreadOrder(
  instrumentName: string,
  params: OptionTradingParams,
  finalQuantity: number,
  finalPrice: number,
  spreadRatio: number,
  instrumentInfo: any,
  optionDetails: any,
  accessToken: string,
  dependencies: PlaceOrderDependencies,
  reduceOnly: boolean
): Promise<OptionTradingResult> {
  console.log(`📈 Spread is small, using progressive limit order strategy`);

  const r = 0.2;
  const s = optionDetails.best_ask_price - optionDetails.best_bid_price;
  let price = params.direction === 'buy' ? optionDetails.best_bid_price + s * r : (optionDetails.best_ask_price - s * r);
  price = correctOrderPrice(price, instrumentInfo).correctedPrice;

  // 使用普通限价单下单
  const orderResult = await dependencies.deribitClient.placeOrder(
    instrumentName,
    params.direction,
    finalQuantity,
    'limit',
    price,
    accessToken,
    reduceOnly
  );

  console.log(`📋 Initial order placed with order_id ${orderResult.order.order_id}:`, orderResult);

  // 执行移动价格策略并等待完成
  console.log(`🎯 Starting progressive limit strategy and waiting for completion...`);

  const { executeProgressiveLimitStrategy: executeProgressiveLimitStrategyPure } = await import('./progressive-limit-strategy');
  const strategyResult = await executeProgressiveLimitStrategyPure(
    {
      orderId: orderResult.order.order_id,
      instrumentName,
      direction: params.direction,
      quantity: finalQuantity,
      initialPrice: finalPrice,
      accountName: params.accountName,
      instrumentDetail: instrumentInfo,
      timeout: 8000,  // 8秒
      maxStep: 3
    },
    {
      deribitAuth: dependencies.deribitAuth,
      deribitClient: dependencies.deribitClient
    }
  );

  if (strategyResult.success) {
    console.log(`✅ Progressive strategy completed successfully:`, strategyResult);
    // 将返回的仓位信息记录到delta数据库中
    await recordPositionInfoToDatabasePure(strategyResult, params, dependencies.orderSupportDependencies);

    // 发送成功通知到企业微信
    const spreadPercentage = (spreadRatio * 100).toFixed(1);
    const tickMultiple = calculateSpreadTickMultiple(optionDetails.best_bid_price, optionDetails.best_ask_price, instrumentInfo.tick_size);
    const extraMsg = `盘口价差: ${spreadPercentage}% (渐进式策略)`;

    const orderInfo: OrderNotificationInfo = {
      instrumentName,
      direction: params.direction,
      quantity: finalQuantity,
      price: strategyResult.averagePrice || finalPrice,
      orderId: orderResult.order.order_id,
      orderState: strategyResult.finalOrderState || 'filled',
      filledAmount: strategyResult.executedQuantity || finalQuantity,
      averagePrice: strategyResult.averagePrice || finalPrice,
      success: true,
      extraMsg: extraMsg,
      bestBidPrice: optionDetails.best_bid_price,
      bestAskPrice: optionDetails.best_ask_price,
      tickSize: instrumentInfo.tick_size,
      spreadRatio: spreadRatio,
      tickMultiple: tickMultiple
    };

    await sendOrderNotificationPure(params.accountName, orderInfo, dependencies.orderSupportDependencies);

    return {
      success: true,
      orderId: orderResult.order.order_id,
      message: `Progressive ${params.direction} order completed: ${strategyResult.message}`,
      instrumentName,
      executedQuantity: strategyResult.executedQuantity || finalQuantity,
      executedPrice: strategyResult.averagePrice || finalPrice,
      finalOrderState: strategyResult.finalOrderState,
      positionInfo: strategyResult.positionInfo
    };
  } else {
    console.error(`❌ Progressive strategy failed:`, strategyResult.message);

    // 发送失败通知到企业微信
    const spreadPercentage = (spreadRatio * 100).toFixed(1);
    const tickMultiple = calculateSpreadTickMultiple(optionDetails.best_bid_price, optionDetails.best_ask_price, instrumentInfo.tick_size);
    const extraMsg = `盘口价差: ${spreadPercentage}% (渐进式策略失败)`;

    const orderInfo: OrderNotificationInfo = {
      instrumentName,
      direction: params.direction,
      quantity: finalQuantity,
      price: finalPrice,
      orderId: orderResult.order.order_id,
      orderState: 'failed',
      filledAmount: 0,
      averagePrice: 0,
      success: false,
      extraMsg: extraMsg,
      bestBidPrice: optionDetails.best_bid_price,
      bestAskPrice: optionDetails.best_ask_price,
      tickSize: instrumentInfo.tick_size,
      spreadRatio: spreadRatio,
      tickMultiple: tickMultiple
    };

    await sendOrderNotificationPure(params.accountName, orderInfo, dependencies.orderSupportDependencies);

    return {
      success: false,
      orderId: orderResult.order.order_id,
      message: `Progressive strategy failed: ${strategyResult.message}`,
      instrumentName,
      executedQuantity: 0,
      executedPrice: finalPrice,
      error: strategyResult.message
    };
  }
}

/**
 * 提取详细的错误信息
 */
function extractDetailedErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }

  let errorMsg = error.message;

  // 检查是否有 Axios 响应错误
  if ((error as any).response?.data) {
    const responseData = (error as any).response.data;

    // 检查 Deribit API 错误格式
    if (responseData.error) {
      const deribitError = responseData.error;
      if (deribitError.message) {
        errorMsg = deribitError.message;

        // 添加错误代码（如果有）
        if (deribitError.code) {
          errorMsg += ` (代码: ${deribitError.code})`;
        }

        // 翻译常见的 Deribit 错误消息
        const errorTranslations: { [key: string]: string } = {
          'not_enough_funds': '资金不足',
          'invalid_instrument_name': '无效的合约名称',
          'invalid_quantity': '无效的数量',
          'invalid_price': '无效的价格',
          'order_not_found': '订单未找到',
          'instrument_not_found': '合约未找到',
          'insufficient_funds': '资金不足',
          'position_not_found': '仓位未找到',
          'invalid_direction': '无效的交易方向',
          'market_closed': '市场已关闭',
          'price_too_high': '价格过高',
          'price_too_low': '价格过低',
          'quantity_too_small': '数量过小',
          'quantity_too_large': '数量过大'
        };

        const translatedMsg = errorTranslations[deribitError.message];
        if (translatedMsg) {
          errorMsg = `${translatedMsg} (${deribitError.message})`;
          if (deribitError.code) {
            errorMsg += ` (代码: ${deribitError.code})`;
          }
        }
      }
    }
    // 检查其他可能的错误格式
    else if (responseData.message) {
      errorMsg = responseData.message;
    }
    else if (typeof responseData === 'string') {
      errorMsg = responseData;
    }
  }

  return errorMsg;
}

/**
 * 处理订单错误
 */
async function handleOrderError(
  instrumentName: string,
  params: OptionTradingParams,
  error: unknown,
  dependencies: PlaceOrderDependencies
): Promise<OptionTradingResult> {
  console.error(`❌ Failed to place order for ${instrumentName}:`, error);

  // 详细错误日志
  if (error instanceof Error) {
    console.error(`Error message: ${error.message}`);
    if ((error as any).response) {
      console.error(`HTTP Status: ${(error as any).response.status}`);
      console.error(`Response data:`, JSON.stringify((error as any).response.data, null, 2));
    }
  }

  // 提取详细的错误信息
  const detailedErrorMsg = extractDetailedErrorMessage(error);

  const orderInfo: OrderNotificationInfo = {
    instrumentName,
    direction: params.direction,
    quantity: 0, // 错误时没有实际期权订单数量
    price: 0, // 错误时没有实际期权订单价格
    orderId: 'N/A',
    orderState: 'error',
    filledAmount: 0,
    averagePrice: 0,
    success: false,
    extraMsg: `错误: ${detailedErrorMsg} | 原始信号 - 数量:${params.quantity}, 价格:${params.price || 'market'}, 动作:${params.action}, delta1:${params.delta1 || 'N/A'}, delta2:${params.delta2 || 'N/A'}, n:${params.n || 'N/A'}`,
    bestBidPrice: undefined,
    bestAskPrice: undefined
  };

  await sendOrderNotificationPure(params.accountName, orderInfo, dependencies.orderSupportDependencies);

  return {
    success: false,
    message: 'Failed to place option order',
    error: detailedErrorMsg
  };
}
