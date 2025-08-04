/**
 * 价格修正工具函数 - 纯函数式实现
 * 用于修正期权订单价格和数量以符合Deribit要求
 */

import Decimal from 'decimal.js';
import type { DeribitInstrumentDetail } from '../types/deribit-instrument';

/**
 * 根据分级tick size规则计算正确的tick size
 * @param price 价格
 * @param baseTickSize 基础tick size
 * @param tickSizeSteps tick size分级规则
 * @returns 正确的tick size
 */
export function getCorrectTickSize(
  price: number, 
  baseTickSize: number, 
  tickSizeSteps?: Array<{ above_price: number; tick_size: number }>
): number {
  if (!tickSizeSteps || tickSizeSteps.length === 0) {
    return baseTickSize;
  }

  // 从高到低检查tick size steps
  for (const step of tickSizeSteps.sort((a, b) => b.above_price - a.above_price)) {
    if (price > step.above_price) {
      return step.tick_size;
    }
  }

  return baseTickSize;
}

/**
 * 修正期权订单价格以符合Deribit要求
 * 使用decimal.js解决浮点数精度问题
 * @param price 原始价格
 * @param instrumentDetail 期权工具详情
 * @returns 修正后的价格信息
 */
export function correctOrderPrice(
  price: number,
  instrumentDetail: DeribitInstrumentDetail
): { correctedPrice: number; tickSize: number; priceSteps: string } {
  const {
    tick_size: baseTickSize,
    tick_size_steps: tickSizeSteps,
    instrument_name: instrumentName
  } = instrumentDetail;

  // 计算正确的tick size
  const correctTickSize = getCorrectTickSize(price, baseTickSize, tickSizeSteps);

  // 使用Decimal.js进行精确计算
  const priceDecimal = new Decimal(price);
  const tickSizeDecimal = new Decimal(correctTickSize);

  // 修正价格到最接近的tick size倍数
  const steps = priceDecimal.dividedBy(tickSizeDecimal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const correctedPriceDecimal = steps.times(tickSizeDecimal);
  const correctedPrice = correctedPriceDecimal.toNumber();

  console.log(`🔧 Price correction for ${instrumentName}:`);
  console.log(`   Original price: ${price} → Corrected: ${correctedPrice}`);
  console.log(`   Base tick size: ${baseTickSize}, Used tick size: ${correctTickSize}`);
  console.log(`   Price steps: ${steps.toString()}`);

  if (tickSizeSteps && tickSizeSteps.length > 0) {
    console.log(`   Tick size steps applied: ${JSON.stringify(tickSizeSteps)}`);
  }

  return {
    correctedPrice,
    tickSize: correctTickSize,
    priceSteps: steps.toString()
  };
}

/**
 * 修正期权订单数量以符合Deribit要求
 * 使用decimal.js解决浮点数精度问题
 * @param amount 原始数量
 * @param instrumentDetail 期权工具详情
 * @returns 修正后的数量信息
 */
export function correctOrderAmount(
  amount: number,
  instrumentDetail: DeribitInstrumentDetail
): { correctedAmount: number; minTradeAmount: number; amountSteps: string } {
  const {
    min_trade_amount: minTradeAmount,
    instrument_name: instrumentName
  } = instrumentDetail;

  // 使用Decimal.js进行精确计算
  const amountDecimal = new Decimal(amount);
  const minTradeAmountDecimal = new Decimal(minTradeAmount);

  // 修正数量到最接近的最小交易单位倍数
  const steps = amountDecimal.dividedBy(minTradeAmountDecimal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const correctedAmountDecimal = steps.times(minTradeAmountDecimal);
  const correctedAmount = correctedAmountDecimal.toNumber();

  console.log(`🔧 Amount correction for ${instrumentName}:`);
  console.log(`   Original amount: ${amount} → Corrected: ${correctedAmount}`);
  console.log(`   Min trade amount: ${minTradeAmount}`);
  console.log(`   Amount steps: ${steps.toString()}`);

  return {
    correctedAmount,
    minTradeAmount,
    amountSteps: steps.toString()
  };
}

/**
 * 同时修正价格和数量
 * @param price 原始价格
 * @param amount 原始数量
 * @param instrumentDetail 期权工具详情
 * @returns 修正后的价格和数量信息
 */
export function correctOrderParameters(
  price: number,
  amount: number,
  instrumentDetail: DeribitInstrumentDetail
): {
  correctedPrice: number;
  correctedAmount: number;
  priceCorrection: { tickSize: number; priceSteps: string };
  amountCorrection: { minTradeAmount: number; amountSteps: string };
} {
  const priceResult = correctOrderPrice(price, instrumentDetail);
  const amountResult = correctOrderAmount(amount, instrumentDetail);

  console.log(`🔧 Combined parameter correction for ${instrumentDetail.instrument_name}:`);
  console.log(`   Price: ${price} → ${priceResult.correctedPrice} (steps: ${priceResult.priceSteps})`);
  console.log(`   Amount: ${amount} → ${amountResult.correctedAmount} (steps: ${amountResult.amountSteps})`);

  return {
    correctedPrice: priceResult.correctedPrice,
    correctedAmount: amountResult.correctedAmount,
    priceCorrection: {
      tickSize: priceResult.tickSize,
      priceSteps: priceResult.priceSteps
    },
    amountCorrection: {
      minTradeAmount: amountResult.minTradeAmount,
      amountSteps: amountResult.amountSteps
    }
  };
}

/**
 * 计算智能价格 - 基于盘口价差的价格计算
 * @param direction 交易方向
 * @param bestBidPrice 最佳买价
 * @param bestAskPrice 最佳卖价
 * @param ratio 价格比例 (0-1, 0.2表示20%的价差位置)
 * @returns 计算后的价格
 */
export function calculateSmartPrice(
  direction: 'buy' | 'sell',
  bestBidPrice: number,
  bestAskPrice: number,
  ratio: number = 0.2
): number {
  const spread = bestAskPrice - bestBidPrice;
  
  if (direction === 'buy') {
    // 买单：在bid价格基础上加上一定比例的价差
    return bestBidPrice + spread * ratio;
  } else {
    // 卖单：在ask价格基础上减去一定比例的价差
    return bestAskPrice - spread * ratio;
  }
}

/**
 * 修正智能价格 - 结合盘口价差计算和tick size修正
 * @param direction 交易方向
 * @param bestBidPrice 最佳买价
 * @param bestAskPrice 最佳卖价
 * @param instrumentDetail 期权工具详情
 * @param ratio 价格比例 (默认0.2)
 * @returns 修正后的智能价格
 */
export function correctSmartPrice(
  direction: 'buy' | 'sell',
  bestBidPrice: number,
  bestAskPrice: number,
  instrumentDetail: DeribitInstrumentDetail,
  ratio: number = 0.2
): { correctedPrice: number; originalPrice: number; tickSize: number; priceSteps: string } {
  // 1. 计算智能价格
  const originalPrice = calculateSmartPrice(direction, bestBidPrice, bestAskPrice, ratio);
  
  // 2. 修正价格到有效tick
  const priceResult = correctOrderPrice(originalPrice, instrumentDetail);
  
  console.log(`🎯 Smart price calculation for ${instrumentDetail.instrument_name}:`);
  console.log(`   Direction: ${direction}, Ratio: ${ratio}`);
  console.log(`   Bid: ${bestBidPrice}, Ask: ${bestAskPrice}, Spread: ${bestAskPrice - bestBidPrice}`);
  console.log(`   Smart price: ${originalPrice} → Corrected: ${priceResult.correctedPrice}`);
  
  return {
    correctedPrice: priceResult.correctedPrice,
    originalPrice: originalPrice,
    tickSize: priceResult.tickSize,
    priceSteps: priceResult.priceSteps
  };
}
