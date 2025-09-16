/**
 * 盘口价差计算工具函数
 * 统一不同模块中的价差比率计算逻辑
 */

/**
 * 计算盘口价差比率
 * 
 * 价差比率 = (卖1价 - 买1价) / (卖1价 + 买1价)
 * 
 * 这个比率表示价差相对于中间价的比例：
 * - 0 表示没有价差（买卖价相等）
 * - 接近1表示价差很大（流动性差）
 * - 负值表示买价高于卖价（异常情况）
 * 
 * @param bidPrice 买1价（最高买价）
 * @param askPrice 卖1价（最低卖价）
 * @returns 价差比率，如果价格无效则返回1（表示最大价差）
 */
export function calculateSpreadRatio(bidPrice: number, askPrice: number): number {
  // 验证价格有效性
  if (!bidPrice || !askPrice || bidPrice <= 0 || askPrice <= 0) {
    // console.warn(`⚠️ Invalid bid/ask prices: bid=${bidPrice}, ask=${askPrice}`);
    return 1; // 返回最大价差比率，表示流动性极差
  }
  
  // 检查价格合理性（买价不应高于卖价）
  if (bidPrice > askPrice) {
    console.warn(`⚠️ Abnormal prices: bid=${bidPrice} > ask=${askPrice}`);
    return 1; // 异常情况，返回最大价差
  }
  
  // 计算标准化价差比率
  const spreadRatio = (askPrice - bidPrice) / (askPrice + bidPrice) * 2;
  
  return spreadRatio;
}

/**
 * 计算绝对价差
 * 
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @returns 绝对价差（卖1价 - 买1价）
 */
export function calculateAbsoluteSpread(bidPrice: number, askPrice: number): number {
  if (!bidPrice || !askPrice || bidPrice <= 0 || askPrice <= 0) {
    return 0;
  }
  
  return Math.max(0, askPrice - bidPrice);
}

/**
 * 计算中间价
 * 
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @returns 中间价 ((买1价 + 卖1价) / 2)
 */
export function calculateMidPrice(bidPrice: number, askPrice: number): number {
  if (!bidPrice || !askPrice || bidPrice <= 0 || askPrice <= 0) {
    return 0;
  }
  
  return (bidPrice + askPrice) / 2;
}

/**
 * 格式化价差比率为百分比字符串
 * 
 * @param spreadRatio 价差比率
 * @param decimals 小数位数，默认2位
 * @returns 格式化的百分比字符串，如 "1.25%"
 */
export function formatSpreadRatioAsPercentage(spreadRatio: number, decimals: number = 2): string {
  return `${(spreadRatio * 100).toFixed(decimals)}%`;
}

/**
 * 计算价差步进倍数
 *
 * 步进倍数 = (卖1价 - 买1价) / 价格最小步进
 *
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @param tickSize 价格最小步进
 * @returns 价差步进倍数，如果参数无效则返回Infinity
 */
export function calculateSpreadTickMultiple(bidPrice: number, askPrice: number, tickSize: number): number {
  // 验证参数有效性
  if (!bidPrice || !askPrice || !tickSize || bidPrice <= 0 || askPrice <= 0 || tickSize <= 0) {
    return Infinity; // 返回无穷大，表示价差极大
  }

  // 检查价格合理性
  if (bidPrice > askPrice) {
    return Infinity; // 异常情况
  }

  const absoluteSpread = askPrice - bidPrice;
  return absoluteSpread / tickSize;
}

/**
 * 判断价差是否过大（基于比率阈值）
 *
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @param threshold 价差比率阈值，默认0.15 (15%)
 * @returns true表示价差过大，false表示价差合理
 */
export function isSpreadTooWide(bidPrice: number, askPrice: number, threshold: number = 0.15): boolean {
  const spreadRatio = calculateSpreadRatio(bidPrice, askPrice);
  return spreadRatio > threshold;
}

/**
 * 判断价差是否过大（基于步进倍数阈值）
 *
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @param tickSize 价格最小步进
 * @param threshold 步进倍数阈值，默认2
 * @returns true表示价差过大，false表示价差合理
 */
export function isSpreadTooWideByTicks(bidPrice: number, askPrice: number, tickSize: number, threshold: number = 2): boolean {
  const tickMultiple = calculateSpreadTickMultiple(bidPrice, askPrice, tickSize);
  return tickMultiple > threshold;
}

/**
 * 综合判断价差是否合理（满足任一条件即可）
 *
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @param tickSize 价格最小步进
 * @param ratioThreshold 价差比率阈值，默认0.15 (15%)
 * @param tickThreshold 步进倍数阈值，默认2
 * @returns true表示价差合理，false表示价差过大
 */
export function isSpreadReasonable(
  bidPrice: number,
  askPrice: number,
  tickSize: number,
  ratioThreshold: number = 0.15,
  tickThreshold: number = 2
): boolean {
  // 满足任一条件即认为价差合理
  const ratioOk = !isSpreadTooWide(bidPrice, askPrice, ratioThreshold);
  const tickOk = !isSpreadTooWideByTicks(bidPrice, askPrice, tickSize, tickThreshold);

  return ratioOk || tickOk;
}

/**
 * 获取价差质量描述
 * 
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @returns 价差质量描述字符串
 */
export function getSpreadQualityDescription(bidPrice: number, askPrice: number): string {
  const spreadRatio = calculateSpreadRatio(bidPrice, askPrice);
  
  if (spreadRatio <= 0.01) return '极佳 (≤1%)';
  if (spreadRatio <= 0.05) return '良好 (≤5%)';
  if (spreadRatio <= 0.15) return '一般 (≤15%)';
  if (spreadRatio <= 0.30) return '较差 (≤30%)';
  return '极差 (>30%)';
}

/**
 * 价差信息接口
 */
export interface SpreadInfo {
  bidPrice: number;
  askPrice: number;
  absoluteSpread: number;
  spreadRatio: number;
  midPrice: number;
  qualityDescription: string;
  formattedRatio: string;
  tickSize?: number;                     // 价格最小步进
  tickMultiple?: number;                 // 价差步进倍数
  isReasonableByRatio?: boolean;         // 基于比率是否合理
  isReasonableByTicks?: boolean;         // 基于步进是否合理
  isReasonableOverall?: boolean;         // 综合是否合理
}

/**
 * 获取完整的价差信息
 *
 * @param bidPrice 买1价
 * @param askPrice 卖1价
 * @param tickSize 价格最小步进（可选）
 * @param ratioThreshold 价差比率阈值（可选）
 * @param tickThreshold 步进倍数阈值（可选）
 * @returns 完整的价差信息对象
 */
export function getSpreadInfo(
  bidPrice: number,
  askPrice: number,
  tickSize?: number,
  ratioThreshold?: number,
  tickThreshold?: number
): SpreadInfo {
  const spreadRatio = calculateSpreadRatio(bidPrice, askPrice);
  const info: SpreadInfo = {
    bidPrice,
    askPrice,
    absoluteSpread: calculateAbsoluteSpread(bidPrice, askPrice),
    spreadRatio,
    midPrice: calculateMidPrice(bidPrice, askPrice),
    qualityDescription: getSpreadQualityDescription(bidPrice, askPrice),
    formattedRatio: formatSpreadRatioAsPercentage(spreadRatio)
  };

  // 如果提供了tickSize，计算相关信息
  if (tickSize !== undefined && tickSize > 0) {
    const tickMultiple = calculateSpreadTickMultiple(bidPrice, askPrice, tickSize);
    const ratioThresh = ratioThreshold || 0.15;
    const tickThresh = tickThreshold || 2;

    info.tickSize = tickSize;
    info.tickMultiple = tickMultiple;
    info.isReasonableByRatio = !isSpreadTooWide(bidPrice, askPrice, ratioThresh);
    info.isReasonableByTicks = !isSpreadTooWideByTicks(bidPrice, askPrice, tickSize, tickThresh);
    info.isReasonableOverall = isSpreadReasonable(bidPrice, askPrice, tickSize, ratioThresh, tickThresh);
  }

  return info;
}
