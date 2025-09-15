/**
 * 仓位调整服务 - 函数式编程
 * 独立的仓位调整逻辑，避免循环依赖
 */

import { ConfigLoader } from '../config';
import { DeltaManager } from '../database/delta-manager';
import { DeltaRecord, DeltaRecordType } from '../database/types';
import { DeribitPosition, OptionTradingParams, PositionAdjustmentResult } from '../types';
import { correctOrderAmount, correctSmartPrice } from '../utils/price-correction';
import { calculateSpreadRatio, formatSpreadRatioAsPercentage } from '../utils/spread-calculation';
import { DeribitAuth } from './auth';
import { DeribitClient } from './deribit-client';
import { MockDeribitClient } from './mock-deribit';
import { OrderSupportDependencies } from './order-support-functions';
import { placeOptionOrder, PlaceOrderDependencies } from './place-option-order';
import { executeProgressiveLimitStrategy } from './progressive-limit-strategy';



/**
 * 执行仓位调整
 * @param params 调整参数
 */
export async function executePositionAdjustment(
  params: {
    requestId: string;
    accountName: string;
    currentPosition: DeribitPosition;
    deltaRecord: DeltaRecord;
    accessToken: string;
  },
  services: {
    deribitClient: DeribitClient;
    deltaManager: DeltaManager;
    deribitAuth: DeribitAuth;
    mockClient: MockDeribitClient;
    configLoader: ConfigLoader;
  }
): Promise<PositionAdjustmentResult> {
  const { requestId, accountName, currentPosition, deltaRecord, accessToken } = params;
  const { deribitClient, deltaManager, deribitAuth, mockClient, configLoader } = services;

  try {
    console.log(`🔄 [${requestId}] Starting position adjustment for ${currentPosition.instrument_name}`);

    // 提取货币和标的资产信息
    const { currency, underlying } = await parseInstrumentForOptions(currentPosition.instrument_name, deribitClient);

    // 1. 根据latestRecord.move_position_delta 获取新的期权工具
    console.log(`📊 [${requestId}] Getting instrument by delta: currency=${currency}, underlying=${underlying}, delta=${deltaRecord.move_position_delta}`);

    // 确定方向：如果move_position_delta为正，选择看涨期权；为负，选择看跌期权
    const isCall = deltaRecord.move_position_delta > 0;
    const spreadRatioThreshold = parseFloat(process.env.SPREAD_RATIO_THRESHOLD || '0.15');
    const spreadTickThreshold = parseInt(process.env.SPREAD_TICK_MULTIPLE_THRESHOLD || '2', 10);

    // 获取新的期权工具 - 现在使用正确的underlying参数
    const deltaResult = await deribitClient.getInstrumentByDelta(
      currency,
      deltaRecord.min_expire_days || 7, // 最小到期天数，默认7天
      Math.abs(deltaRecord.move_position_delta), // 目标delta值
      isCall,
      underlying // 传入正确的underlying参数
    );

    if (!deltaResult || !deltaResult.instrument) {
      throw new Error(`Failed to get instrument by delta: No suitable instrument found`);
    }

    // 如果deltaResult和当前持仓的名称一致, 返回失败即可
    if (deltaResult.instrument.instrument_name === currentPosition.instrument_name) {
      console.log(`⚠️ [${requestId}] Selected instrument is the same as current position: ${currentPosition.instrument_name}`);
      return {
        success: false,
        reason: `无需调整：目标合约与当前持仓合约相同`,
        error: `当前持仓: ${currentPosition.instrument_name} 目标合约: ${deltaResult.instrument.instrument_name} 状态: 合约名称完全相同`
      };
    }

    // 检查盘口价差是否合理（使用综合判断逻辑）
    const { isSpreadReasonable } = await import('../utils/spread-calculation');
    const isReasonable = isSpreadReasonable(
      deltaResult.details.best_bid_price,
      deltaResult.details.best_ask_price,
      deltaResult.instrument.tick_size,
      spreadRatioThreshold,
      spreadTickThreshold
    );

    if (!isReasonable) {
      const spreadRatioFormatted = formatSpreadRatioAsPercentage(deltaResult.spreadRatio);
      const thresholdFormatted = formatSpreadRatioAsPercentage(spreadRatioThreshold);
      const tickMultiple = ((deltaResult.details.best_ask_price - deltaResult.details.best_bid_price) / deltaResult.instrument.tick_size).toFixed(1);

      console.log(`❌ [${requestId}] Spread too wide for ${deltaResult.instrument.instrument_name}: ratio=${spreadRatioFormatted} > ${thresholdFormatted}, tick_multiple=${tickMultiple} > ${spreadTickThreshold}`);
      console.log(`📊 [${requestId}] Bid: ${deltaResult.details.best_bid_price}, Ask: ${deltaResult.details.best_ask_price}, TickSize: ${deltaResult.instrument.tick_size}`);

      return {
        success: false,
        reason: `换仓价差过大：比率${spreadRatioFormatted} > ${thresholdFormatted} 且 步进倍数${tickMultiple} > ${spreadTickThreshold}`,
        error: `合约: ${deltaResult.instrument.instrument_name}\n买价: ${deltaResult.details.best_bid_price}\n卖价: ${deltaResult.details.best_ask_price}\n价差比例: ${spreadRatioFormatted}\n步进倍数: ${tickMultiple}\n比率阈值: ${thresholdFormatted}\n步进阈值: ${spreadTickThreshold}`
      };
    }

    console.log(`🎯 [${requestId}] Selected new instrument: ${deltaResult.instrument.instrument_name}`);

    // 2. 平掉当前仓位
    const closeDirection = currentPosition.direction === 'buy' ? 'sell' : 'buy';
    const closeQuantity = Math.abs(currentPosition.size);

    console.log(`📉 [${requestId}] Closing current position: ${closeDirection} ${closeQuantity} contracts of ${currentPosition.instrument_name}`);

    // 使用executePositionClose进行渐进式平仓，提供更好的执行效果
    const closeResult = await executePositionClose(
      {
        requestId: `${requestId}_close`,
        accountName,
        currentPosition,
        deltaRecord,
        accessToken,
        closeRatio: 1.0, // 全平当前仓位
        isMarketOrder: false // 使用限价单+渐进式策略，而不是市价单
      },
      {
        deribitClient,
        deltaManager,
        deribitAuth
      }
    );

    if (!closeResult.success) {
      throw new Error(`Failed to close position: ${closeResult.error || 'Unknown error'}`);
    }

    console.log(`✅ [${requestId}] Current position closed successfully using progressive strategy`);
    console.log(`🗑️ [${requestId}] Delta record deletion: ${closeResult.deltaRecordDeleted ? 'success' : 'failed'} (handled by executePositionClose)`);

    // 3. 开新仓位
    // 根据move_position_delta确定新仓位方向：正值买入，负值卖出
    const newDirection = currentPosition.direction;
    const newQuantity = Math.abs(currentPosition.size);
    const instrumentName = deltaResult.instrument.instrument_name
    console.log(`📈 [${requestId}] Opening new position: ${newDirection} ${newQuantity} contracts of ${deltaResult.instrument.instrument_name}`);

    const optionDetails = await deribitClient.getOptionDetails(instrumentName);
    if (!optionDetails) {
      throw new Error(`Failed to get option details for ${instrumentName}`);
    }

    // 使用 placeOptionOrder 替换基础的 placeOrder，提供更好的订单执行
    console.log(`🎯 [${requestId}] Using placeOptionOrder for better execution`);

    // 构建 OptionTradingParams
    const tradingParams: OptionTradingParams = {
      accountName: accountName,
      direction: newDirection,
      action: newDirection === 'buy' ? 'open_long' : 'open_short', // 根据方向确定开仓动作
      symbol: currency, // 使用货币符号
      quantity: newQuantity,
      orderType: 'limit',
      instrumentName: deltaResult.instrument.instrument_name,
      delta1: deltaRecord.move_position_delta, // 使用目标delta值
      delta2: deltaRecord.target_delta, // 使用目标delta值
      n: deltaRecord.min_expire_days || undefined, // 使用最小到期天数
      tv_id: deltaRecord.tv_id || undefined // 传递TV信号ID，处理null值
    };

    // 构建依赖注入对象
    const orderSupportDependencies: OrderSupportDependencies = {
      deltaManager: deltaManager,
      configLoader: configLoader
    };

    const dependencies: PlaceOrderDependencies = {
      deribitAuth: deribitAuth,
      deribitClient: deribitClient,
      mockClient: mockClient,
      configLoader: configLoader,
      orderSupportDependencies: orderSupportDependencies
    };

    // 调用 placeOptionOrder 进行智能下单
    const newOrderResult = await placeOptionOrder(
      deltaResult.instrument.instrument_name,
      tradingParams,
      false, // 不使用模拟模式
      dependencies
    );

    if (!newOrderResult || !newOrderResult.success) {
      console.error(`❌ [${requestId}] Failed to open new position, but old position was closed`);
      throw new Error(`Failed to open new position: ${newOrderResult?.message || 'No response received'}`);
    }

    console.log(`✅ [${requestId}] New position opened successfully: ${newOrderResult.orderId}`);

    // 返回成功结果
    return {
      success: true,
      oldInstrument: currentPosition.instrument_name,
      newInstrument: deltaResult.instrument.instrument_name,
      adjustmentSummary: {
        oldSize: currentPosition.size,
        oldDelta: currentPosition.delta || 0,
        newDirection: newDirection,
        newQuantity: newQuantity,
        targetDelta: deltaRecord.move_position_delta
      }
    };

  } catch (error) {
    console.error(`💥 [${requestId}] Position adjustment failed:`, error);
    return {
      success: false,
      reason: 'Exception during adjustment',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 基于tv_id执行仓位平仓
 * @param accountName 账户名
 * @param tvId TV信号ID
 * @param closeRatio 平仓比例 (0-1, 1表示全平)
 * @param services 服务依赖
 */
export async function executePositionCloseByTvId(
  accountName: string,
  tvId: number,
  closeRatio: number,
  isMarketOrder: boolean,
  services: {
    configLoader: ConfigLoader;
    deltaManager: DeltaManager;
    deribitAuth: DeribitAuth;
    deribitClient: DeribitClient;
  }
) {
  const { configLoader, deltaManager, deribitAuth, deribitClient } = services;

  try {
    console.log(`🔍 Executing position close for account: ${accountName}, tv_id: ${tvId}, ratio: ${closeRatio}`);

    // 验证平仓比例
    if (closeRatio <= 0 || closeRatio > 1) {
      return {
        success: false,
        message: `Invalid close ratio: ${closeRatio}. Must be between 0 and 1`
      };
    }

    // 1. 查询tv_id对应的Delta数据库记录
    const deltaRecords = deltaManager.getRecords({
      account_id: accountName,
      tv_id: tvId,
      // record_type: DeltaRecordType.POSITION
    });

    if (deltaRecords.length === 0) {
      console.log(`⚠️ No delta records found for tv_id: ${tvId}`);
      return {
        success: false,
        message: `No delta records found for tv_id: ${tvId}`
      };
    }

    console.log(`📊 Found ${deltaRecords.length} delta record(s) for tv_id: ${tvId}`);

    // 2. 获取账户配置
    const account = configLoader.getAccountByName(accountName);
    if (!account) {
      return {
        success: false,
        message: `Account not found: ${accountName}`
      };
    }

    // 3. 获取访问令牌
    let tokenInfo = deribitAuth.getTokenInfo(accountName);
    if (!tokenInfo) {
      await deribitAuth.authenticate(accountName);
      tokenInfo = deribitAuth.getTokenInfo(accountName);
      if (!tokenInfo) {
        return {
          success: false,
          message: `Failed to get access token for account: ${accountName}`
        };
      }
    }

    const accessToken = tokenInfo.accessToken;

    // 4. 获取当前仓位信息 - 获取所有期权仓位
    const positions = await deribitClient.getPositions(accessToken, {
      kind: 'option'
    });

    // 5. 对每个Delta记录执行平仓操作
    const closeResults = [];
    for (const deltaRecord of deltaRecords) {
      const currentPosition = positions.find(pos =>
        pos.instrument_name === deltaRecord.instrument_name && pos.size !== 0
      );

      if (currentPosition) {
        console.log(`🔄 Executing close for instrument: ${deltaRecord.instrument_name}`);

        // 执行平仓（价差检查已移至executePositionClose函数内部）
        const closeResult = await executePositionClose(
          {
            requestId: `tv_close_${tvId}_${Date.now()}`,
            accountName,
            currentPosition,
            deltaRecord,
            accessToken,
            closeRatio,
            isMarketOrder
          },
          {
            deribitClient,
            deltaManager,
            deribitAuth
          }
        );

        closeResults.push(closeResult);
      } else {
        console.log(`⚠️ No active position found for instrument: ${deltaRecord.instrument_name}`);
        closeResults.push({
          success: false,
          message: `No active position found for instrument: ${deltaRecord.instrument_name}`
        });
      }
    }

    // 6. 汇总结果
    const successCount = closeResults.filter(r => r.success).length;
    const totalCount = closeResults.length;

    // 收集成功平仓的合约名称
    const closedInstruments = closeResults
      .filter(r => r.success && 'instrument' in r)
      .map(r => (r as any).instrument);

    // 7. 如果有成功的平仓操作，删除Delta数据库中对应tv_id的所有记录
    if (successCount > 0) {
      try {
        const deletedCount = services.deltaManager.deleteRecords({ tv_id: tvId });
        console.log(`🗑️ Deleted ${deletedCount} delta records for tv_id: ${tvId} after successful position close`);
      } catch (error) {
        console.error(`❌ Failed to delete delta records for tv_id ${tvId}:`, error);
        // 删除失败不影响平仓结果，只记录错误
      }
    }

    return {
      success: successCount > 0,
      message: `Position close completed: ${successCount}/${totalCount} successful`,
      orderId: `tv_close_${tvId}`,
      executedQuantity: successCount,
      closeRatio: closeRatio,
      closedInstruments: closedInstruments
    };

  } catch (error) {
    console.error(`❌ Position close failed for tv_id ${tvId}:`, error);
    return {
      success: false,
      message: `Position close failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 执行单个仓位的平仓操作
 * @param params 平仓参数
 * @param services 服务依赖
 */
export async function executePositionClose(
  params: {
    requestId: string;
    accountName: string;
    currentPosition: DeribitPosition;
    deltaRecord?: DeltaRecord;
    accessToken: string;
    closeRatio: number;
    isMarketOrder?: boolean;
  },
  services: {
    deribitClient: DeribitClient;
    deltaManager: DeltaManager;
    deribitAuth: DeribitAuth;
  }
) {
  const { requestId, accountName, currentPosition, deltaRecord, accessToken, closeRatio } = params;
  const { deribitClient, deltaManager, deribitAuth } = services;

  try {
    console.log(`🔄 [${requestId}] Starting position close for ${currentPosition.instrument_name} (ratio: ${closeRatio})`);

    // 获取价差阈值配置
    const spreadRatioThreshold = parseFloat(process.env.SPREAD_RATIO_THRESHOLD || '0.15');
    const spreadTickThreshold = parseInt(process.env.SPREAD_TICK_MULTIPLE_THRESHOLD || '2', 10);

    // 检查当前仓位的盘口价差是否超过阈值
    const currentOptionDetails = await deribitClient.getOptionDetails(currentPosition.instrument_name);
    if (!currentOptionDetails) {
      return {
        success: false,
        error: `Failed to get option details for ${currentPosition.instrument_name}`
      };
    }

    // 获取合约信息以获取tick_size
    const instrumentInfo = await deribitClient.getInstrument(currentPosition.instrument_name);
    if (!instrumentInfo) {
      return {
        success: false,
        error: `Failed to get instrument details for ${currentPosition.instrument_name}`
      };
    }

    const currentSpreadRatio = calculateSpreadRatio(
      currentOptionDetails.best_bid_price,
      currentOptionDetails.best_ask_price
    );

    // 使用综合价差判断逻辑
    const { isSpreadReasonable } = await import('../utils/spread-calculation');
    const isReasonable = isSpreadReasonable(
      currentOptionDetails.best_bid_price,
      currentOptionDetails.best_ask_price,
      instrumentInfo.tick_size,
      spreadRatioThreshold,
      spreadTickThreshold
    );

    if (!isReasonable) {
      const currentSpreadFormatted = formatSpreadRatioAsPercentage(currentSpreadRatio);
      const thresholdFormatted = formatSpreadRatioAsPercentage(spreadRatioThreshold);
      const tickMultiple = ((currentOptionDetails.best_ask_price - currentOptionDetails.best_bid_price) / instrumentInfo.tick_size).toFixed(1);

      console.log(`❌ [${requestId}] Position spread too wide for ${currentPosition.instrument_name}: ratio=${currentSpreadFormatted} > ${thresholdFormatted}, tick_multiple=${tickMultiple} > ${spreadTickThreshold}`);
      console.log(`📊 [${requestId}] Bid: ${currentOptionDetails.best_bid_price}, Ask: ${currentOptionDetails.best_ask_price}, TickSize: ${instrumentInfo.tick_size}`);

      return {
        success: false,
        error: `平仓价差过大：比率${currentSpreadFormatted} > ${thresholdFormatted} 且 步进倍数${tickMultiple} > ${spreadTickThreshold}`
      };
    }

    console.log(`✅ [${requestId}] Spread acceptable for ${currentPosition.instrument_name}, proceeding with close`);

    // 计算平仓数量
    const totalSize = Math.abs(currentPosition.size);
    const rawCloseQuantity = totalSize * closeRatio;

    // instrumentInfo 已经在上面获取过了，直接使用

    // 使用纯函数修正平仓数量
    const amountResult = correctOrderAmount(rawCloseQuantity, instrumentInfo);
    const closeQuantity = amountResult.correctedAmount;
    const closeDirection = currentPosition.direction === 'buy' ? 'sell' : 'buy';

    console.log(`📉 [${requestId}] Closing position: ${closeDirection} ${closeQuantity} contracts (${(closeRatio * 100).toFixed(1)}% of ${totalSize})`);
    let price = undefined;
    if (!params.isMarketOrder) {
      const optionDetails = await deribitClient.getOptionDetails(currentPosition.instrument_name);
      if (!optionDetails) {
        throw new Error(`Failed to get option details for ${currentPosition.instrument_name}`);
      }

      // 获取工具详情用于价格修正
      // const instrumentInfo = await deribitClient.getInstrument(currentPosition.instrument_name);
      // if (!instrumentInfo) {
      //   throw new Error(`Failed to get instrument details for ${currentPosition.instrument_name}`);
      // }

      // 使用纯函数计算和修正智能价格
      const smartPriceResult = correctSmartPrice(
        closeDirection,
        optionDetails.best_bid_price,
        optionDetails.best_ask_price,
        instrumentInfo,
        0.2 // 20%的价差比例
      );
      price = smartPriceResult.correctedPrice;
    }
    // 执行平仓订单
    const closeResult = await deribitClient.placeOrder(
      currentPosition.instrument_name,
      closeDirection,
      closeQuantity,
      params.isMarketOrder ? 'market' : 'limit', // 使用市价单快速平仓
      price,
      accessToken
    );

    if (!params.isMarketOrder) {
      // 执行渐进式限价单策略
      try {
        if (closeResult?.order?.order_id) {
          console.log(`🎯 [${requestId}] Starting progressive limit strategy for close order ${closeResult.order.order_id}`);

          const strategyResult = await executeProgressiveLimitStrategy(
            {
              orderId: closeResult.order.order_id,
              instrumentName: currentPosition.instrument_name,
              direction: closeDirection,
              quantity: closeQuantity,
              initialPrice: price || closeResult.order.price,
              accountName: params.accountName,
              instrumentDetail: instrumentInfo,
              timeout: 8000,
              maxStep: 3
            },
            {
              deribitAuth: services.deribitAuth,
              deribitClient: services.deribitClient
            }
          );

          console.log(`🏁 [${requestId}] Progressive strategy completed: ${strategyResult.success ? 'success' : 'failed'}`);
          if (strategyResult.positionInfo) {
            console.log(`📊 [${requestId}] Final execution: ${strategyResult.executedQuantity}/${closeQuantity} contracts at ${strategyResult.averagePrice}`);
          }
        }
      } catch (strategyError) {
        console.error(`❌ [${requestId}] Progressive strategy error:`, strategyError);
        // 策略失败不影响主流程，订单已经下达
      }
    }

    if (!closeResult) {
      throw new Error(`Failed to close position: No response received`);
    }

    console.log(`✅ [${requestId}] Position closed successfully: ${closeResult.order.order_id}`);

    // 如果是全平(closeRatio = 1)且有Delta记录，删除Delta记录
    let deltaRecordDeleted = false;
    if (closeRatio === 1 && deltaRecord && deltaRecord.id) {
      deltaRecordDeleted = deltaManager.deleteRecord(deltaRecord.id);
      console.log(`🗑️ [${requestId}] Delta record deletion: ${deltaRecordDeleted ? 'success' : 'failed'} (ID: ${deltaRecord.id})`);
    } else if (closeRatio === 1) {
      console.log(`📝 [${requestId}] Full close completed, but no delta record to delete`);
    } else {
      console.log(`📝 [${requestId}] Partial close (${(closeRatio * 100).toFixed(1)}%), keeping delta record`);
    }

    // 返回成功结果
    return {
      success: true,
      closeResult: closeResult,
      deltaRecordDeleted: deltaRecordDeleted,
      instrument: currentPosition.instrument_name,
      closeSummary: {
        originalSize: currentPosition.size,
        closeQuantity: closeQuantity,
        closeRatio: closeRatio,
        remainingSize: totalSize - closeQuantity,
        closeDirection: closeDirection
      }
    };

  } catch (error) {
    console.error(`💥 [${requestId}] Position close failed:`, error);
    return {
      success: false,
      reason: 'Exception during close',
      error: error instanceof Error ? error.message : 'Unknown error',
      deltaRecord: deltaRecord
    };
  }
}

/**
 * 基于tv_id执行仓位调整
 */
export async function executePositionAdjustmentByTvId(
  accountName: string,
  tvId: number,
  services: {
    configLoader: ConfigLoader;
    deltaManager: DeltaManager;
    deribitAuth: DeribitAuth;
    deribitClient: DeribitClient;
    mockClient: MockDeribitClient;
  }
) {
  const { configLoader, deltaManager, deribitAuth, deribitClient, mockClient } = services;

  try {
    console.log(`🔍 Executing position adjustment for account: ${accountName}, tv_id: ${tvId}`);

    // 1. 查询tv_id对应的Delta数据库记录
    const deltaRecords = deltaManager.getRecords({
      account_id: accountName,
      tv_id: tvId,
      // record_type: DeltaRecordType.POSITION
    }).sort((a, b) => {
      // 排序: position类型记录排在前面, order类型记录排在后面
      if (a.record_type === DeltaRecordType.POSITION && b.record_type === DeltaRecordType.ORDER) return -1;
      if (a.record_type === DeltaRecordType.ORDER && b.record_type === DeltaRecordType.POSITION) return 1;
      return 0; // 相同类型保持原顺序
    });

    if (deltaRecords.length === 0) {
      console.log(`⚠️ No delta records found for tv_id: ${tvId}`);
      return {
        success: false,
        message: `No delta records found for tv_id: ${tvId}`
      };
    }

    console.log(`📊 Found ${deltaRecords.length} delta record(s) for tv_id: ${tvId}`);

    // 2. 获取账户配置
    const account = configLoader.getAccountByName(accountName);
    if (!account) {
      return {
        success: false,
        message: `Account not found: ${accountName}`
      };
    }

    // 3. 获取访问令牌
    let tokenInfo = deribitAuth.getTokenInfo(accountName);
    if (!tokenInfo) {
      await deribitAuth.authenticate(accountName);
      tokenInfo = deribitAuth.getTokenInfo(accountName);
      if (!tokenInfo) {
        return {
          success: false,
          message: `Failed to get access token for account: ${accountName}`
        };
      }
    }

    const accessToken = tokenInfo.accessToken;

    // 4. 获取当前仓位信息 - 获取所有期权仓位
    const allPositions = await deribitClient.getPositions(accessToken, {
      kind: 'option'
    });

    // 找出需要调整的仓位：与Delta记录匹配且有实际仓位的合约
    const positionsToAdjust = allPositions.filter(pos =>
      deltaRecords.some(record => record.instrument_name === pos.instrument_name) &&
      pos.size !== 0
    );

    // 5. 对每个需要调整的仓位执行调整
    const adjustmentResults = [];

    if (positionsToAdjust.length === 0) {
      console.log(`⚠️ No positions to adjust for tv_id: ${tvId}`);
      return {
        success: false,
        message: `No active positions found for tv_id: ${tvId}`
      };
    }

    for (const currentPosition of positionsToAdjust) {
      // 找到对应的Delta记录
      const deltaRecord = deltaRecords.find(record =>
        record.instrument_name === currentPosition.instrument_name
      );

      if (deltaRecord) {
        console.log(`🔄 Executing adjustment for instrument: ${currentPosition.instrument_name}`);

        const adjustmentResult = await executePositionAdjustment(
          {
            requestId: `tv_${tvId}_${Date.now()}`,
            accountName,
            currentPosition,
            deltaRecord,
            accessToken
          },
          {
            deribitClient,
            deltaManager,
            deribitAuth,
            mockClient: mockClient,
            configLoader: configLoader
          }
        );

        adjustmentResults.push(adjustmentResult);
      } else {
        console.log(`⚠️ No delta record found for position: ${currentPosition.instrument_name}`);
        adjustmentResults.push({
          success: false,
          message: `No delta record found for position: ${currentPosition.instrument_name}`
        });
      }
    }

    // 6. 汇总结果
    const successCount = adjustmentResults.filter(r => r.success).length;
    const failureCount = adjustmentResults.filter(r => !r.success).length;
    const totalCount = adjustmentResults.length;

    // 生成详细的结果消息
    let message = `Position adjustment completed: ${successCount}/${totalCount} successful`;
    
    if (failureCount > 0) {
      const failures = adjustmentResults.filter(r => !r.success);
      const failureDetails = failures.map(failure => {
        if (failure.reason) {
          return `${failure.reason}: ${failure.error || failure.message || 'Unknown error'}`;
        } else {
          return failure.message || 'Unknown error';
        }
      }).join('; ');
      
      message += `. Failures (${failureCount}): ${failureDetails}`;
    }

    return {
      success: successCount > 0,
      message: message,
      orderId: `tv_adjustment_${tvId}`,
      executedQuantity: successCount
    };

  } catch (error) {
    console.error(`❌ Position adjustment failed for tv_id ${tvId}:`, error);
    return {
      success: false,
      message: `Position adjustment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 从期权合约名称中提取currency和underlying参数
 * 支持币本位期权 (BTC-XXX) 和USDC期权 (SOL_USDC-XXX)
 * @param instrumentName 期权合约名称
 * @param deribitClient DeribitClient实例，用于验证解析结果
 * @returns Promise<{ currency: string; underlying: string }> 解析结果
 */
export async function parseInstrumentForOptions(
  instrumentName: string,
  deribitClient: DeribitClient
): Promise<{ currency: string; underlying: string }> {
  const upperInstrument = instrumentName.toUpperCase();

  let parsed: { currency: string; underlying: string };

  // 检查是否为USDC期权格式: SOL_USDC-DDMMMYY-STRIKE-C/P
  if (upperInstrument.includes('_USDC-')) {
    const underlying = upperInstrument.split('_USDC-')[0];
    parsed = {
      currency: 'USDC',
      underlying: underlying
    };
  } else {
    // 币本位期权格式: BTC-DDMMMYY-STRIKE-C/P 或 ETH-DDMMMYY-STRIKE-C/P
    const parts = upperInstrument.split('-');
    if (parts.length >= 4) {
      const underlying = parts[0];
      parsed = {
        currency: underlying,
        underlying: underlying
      };
    } else {
      throw new Error(`Invalid instrument name format: ${instrumentName}`);
    }
  }

  // 调用Deribit的getInstrument接口验证解析结果
  try {
    const instrumentInfo = await deribitClient.getInstrument(instrumentName);
    if (!instrumentInfo) {
      throw new Error(`Failed to validate instrument: ${instrumentName} - instrument not found`);
    }
    
    console.log(`✅ Instrument validated: ${instrumentName} → currency: ${parsed.currency}, underlying: ${parsed.underlying}`);
    return parsed;
  } catch (error) {
    console.error(`❌ Failed to validate instrument ${instrumentName}:`, error);
    throw new Error(`Failed to validate instrument ${instrumentName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
