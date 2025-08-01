# USDC合约乘数修复

## 📋 概述

修复了现金模式下USDC期权合约数量计算的问题。USDC期权的合约乘数通常是10，而传统期权的合约乘数是1，需要区别处理。

## 🎯 问题描述

### 原问题
在`qtyType === 'cash'`模式下，所有期权都使用相同的计算公式：
```typescript
orderQuantity = params.quantity / (entryPrice * optionDetails.index_price);
```

这对传统期权（合约乘数=1）是正确的，但对USDC期权（合约乘数=10）会导致订单数量错误。

### 具体影响
- **USDC期权**: 实际交易金额会是预期的10倍
- **风险放大**: 可能导致超出预期的风险敞口
- **资金使用**: 占用更多保证金

## 🔧 解决方案

### 修改位置
**文件**: `src/services/option-trading.ts`  
**方法**: `placeOptionOrder()` - 现金模式计算部分

### 新的计算逻辑

```typescript
// 如果qtyType是cash，将美元金额转换为合约数量
if (params.qtyType === 'cash') {
  // 开仓大小 = (size / 合约价格 * 指数价格) * 合约乘数
  // Deribit期权合约乘数通常是1，但USDC合约不是
  if (instrumentInfo.settlement_currency === 'USDC') {
    orderQuantity = params.quantity / (entryPrice * optionDetails.index_price) / instrumentInfo.contract_size;
    console.log(`💰 USDC Cash mode: converting $${params.quantity} to ${orderQuantity} contracts at price ${entryPrice}, contract_size: ${instrumentInfo.contract_size}`);
  } else {
    orderQuantity = params.quantity / (entryPrice * optionDetails.index_price);
    console.log(`💰 Cash mode: converting $${params.quantity} to ${orderQuantity} contracts at price ${entryPrice}`);
  }
}
```

## 📊 计算示例

### 传统期权 (BTC-期权)
- **参数**: quantity=$1000, entryPrice=0.05, index_price=50000, contract_size=1
- **计算**: 1000 / (0.05 * 50000) = 0.4 合约
- **实际价值**: 0.4 * 0.05 * 50000 = $1000 ✅

### USDC期权 (SOL_USDC-期权)
- **参数**: quantity=$1000, entryPrice=5, index_price=150, contract_size=10
- **旧计算**: 1000 / (5 * 150) = 1.33 合约
- **实际价值**: 1.33 * 5 * 150 * 10 = $9975 ❌ (10倍错误)
- **新计算**: 1000 / (5 * 150) / 10 = 0.133 合约
- **实际价值**: 0.133 * 5 * 150 * 10 = $997.5 ✅

## 🔍 判断条件

### 使用settlement_currency判断
```typescript
if (instrumentInfo.settlement_currency === 'USDC') {
  // USDC期权处理
} else {
  // 传统期权处理
}
```

### 为什么使用settlement_currency
- **准确性**: 直接反映期权的结算货币
- **可靠性**: 来自Deribit API的官方数据
- **兼容性**: 适用于所有USDC期权类型

## 📈 日志改进

### 新增日志信息
- **USDC期权**: 显示合约乘数信息
- **传统期权**: 保持原有日志格式
- **调试友好**: 便于排查计算问题

### 日志示例
```
💰 USDC Cash mode: converting $1000 to 0.133 contracts at price 5, contract_size: 10
💰 Cash mode: converting $1000 to 0.4 contracts at price 0.05
```

## ✅ 验证清单

- [x] 正确识别USDC期权
- [x] 应用正确的合约乘数
- [x] 保持传统期权计算不变
- [x] 添加详细日志信息
- [x] 编译成功
- [x] 向后兼容

## 🎯 影响范围

### 受影响的交易
- ✅ **USDC期权**: SOL_USDC, BTC_USDC, ETH_USDC等
- ✅ **现金模式**: qtyType === 'cash'
- ❌ **合约模式**: qtyType !== 'cash' (不受影响)
- ❌ **传统期权**: BTC, ETH等 (计算保持不变)

### 不受影响的部分
- 期权选择逻辑
- 价格计算
- 订单执行
- 其他交易模式

## 🚀 预期效果

1. **准确的订单数量**: USDC期权订单数量正确
2. **风险控制**: 避免意外的大额交易
3. **资金效率**: 正确使用预期的资金量
4. **用户体验**: 交易结果符合预期

## 🎉 总结

这个修复确保了：

- **USDC期权**: 正确处理10倍合约乘数
- **传统期权**: 保持原有1倍乘数计算
- **自动识别**: 基于settlement_currency自动判断
- **详细日志**: 便于调试和验证

现在系统能够正确处理不同类型期权的合约乘数差异，确保交易金额的准确性！

---

**修改日期**: 2025-08-01  
**影响范围**: 现金模式期权交易  
**风险等级**: 低（修复错误计算）  
**向后兼容**: 是
