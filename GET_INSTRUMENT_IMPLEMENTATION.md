# getInstrument方法实现文档

## 📋 概述

仿照`getInstruments`方法，成功实现了`getInstrument`方法，用于获取单个工具的详细信息。该方法支持期权、期货等各种Deribit工具类型。

## 🎯 实现内容

### 1. DeribitClient.getInstrument() ✅

**文件位置**: `src/services/deribit-client.ts`

```typescript
/**
 * 获取单个工具的详细信息
 * @param instrumentName 工具名称，如 BTC-PERPETUAL, BTC-25MAR23-50000-C
 * @returns 工具详细信息
 */
async getInstrument(instrumentName: string): Promise<DeribitInstrumentDetail | null> {
  try {
    const result = await this.publicAPI.getInstrument({
      instrument_name: instrumentName
    });
    return result || null;
  } catch (error) {
    console.error(`Failed to get instrument ${instrumentName}:`, error);
    return null;
  }
}
```

### 2. MockDeribitClient.getInstrument() ✅

**文件位置**: `src/services/mock-deribit.ts`

```typescript
/**
 * Mock获取单个工具的详细信息
 */
async getInstrument(instrumentName: string): Promise<DeribitInstrumentDetail | null> {
  console.log(`[MOCK] Getting instrument details for: ${instrumentName}`);
  
  // 解析instrument name并生成mock数据
  // 支持SOL_USDC、BTC等各种格式
  // 返回完整的DeribitInstrumentDetail对象
}
```

### 3. API端点 ✅

**文件位置**: `src/index.ts`

```typescript
// GET /api/instrument/:instrumentName
app.get('/api/instrument/:instrumentName', async (req, res) => {
  const instrumentName = req.params.instrumentName;
  
  if (useMockMode) {
    const instrument = await mockClient.getInstrument(instrumentName);
  } else {
    const instrument = await deribitClient.getInstrument(instrumentName);
  }
  
  res.json({
    success: true,
    mockMode: useMockMode,
    instrumentName,
    instrument
  });
});
```

## 🔧 类型定义

### DeribitInstrumentDetail接口

**文件位置**: `src/types/deribit-instrument.ts`

```typescript
export interface DeribitInstrumentDetail {
  instrument_name: string;           // 工具名称
  instrument_id: number;             // 工具ID
  kind: 'future' | 'option' | 'spot' | 'future_combo' | 'option_combo';
  instrument_type?: 'reversed' | 'linear';
  
  // 价格相关
  tick_size: number;                 // 最小价格变动单位
  tick_size_steps: TickSizeStep[];   // 分级tick size规则
  
  // 交易相关
  min_trade_amount: number;          // 最小交易数量
  contract_size: number;             // 合约大小
  max_leverage?: number;             // 最大杠杆
  
  // 手续费
  maker_commission: number;          // 做市商手续费
  taker_commission: number;          // 吃单手续费
  
  // 货币
  base_currency: string;             // 基础货币
  quote_currency: string;            // 计价货币
  settlement_currency: string;       // 结算货币
  
  // 时间戳
  creation_timestamp: number;        // 创建时间戳
  expiration_timestamp?: number;     // 到期时间戳
  
  // 状态
  is_active: boolean;                // 是否活跃
  rfq: boolean;                      // 是否支持RFQ
  
  // 期权特有字段
  option_type?: 'call' | 'put';      // 期权类型
  strike?: number;                   // 行权价
  
  // 其他字段...
}
```

## 📊 使用示例

### 1. 直接调用方法

```typescript
import { DeribitClient } from './services/deribit-client';
import { MockDeribitClient } from './services/mock-deribit';

// 真实API调用
const deribitClient = new DeribitClient();
const instrument = await deribitClient.getInstrument('BTC-25JUL25-50000-C');

// Mock调用
const mockClient = new MockDeribitClient();
const mockInstrument = await mockClient.getInstrument('SOL_USDC-25JUL25-150-C');
```

### 2. HTTP API调用

```bash
# 获取BTC期权详情
curl http://localhost:3000/api/instrument/BTC-25JUL25-50000-C

# 获取SOL_USDC期权详情
curl http://localhost:3000/api/instrument/SOL_USDC-25JUL25-150-C

# 获取期货详情
curl http://localhost:3000/api/instrument/BTC-PERPETUAL
```

### 3. 响应格式

```json
{
  "success": true,
  "mockMode": true,
  "instrumentName": "SOL_USDC-25JUL25-150-C",
  "instrument": {
    "instrument_name": "SOL_USDC-25JUL25-150-C",
    "instrument_id": 123456,
    "kind": "option",
    "instrument_type": "linear",
    "tick_size": 0.01,
    "min_trade_amount": 0.1,
    "contract_size": 10,
    "maker_commission": 0.0003,
    "taker_commission": 0.0003,
    "base_currency": "SOL",
    "quote_currency": "USDC",
    "settlement_currency": "USDC",
    "is_active": true,
    "rfq": false,
    "option_type": "call",
    "strike": 150,
    "settlement_period": "day"
  }
}
```

## 🧪 测试支持

### 支持的工具格式

- **USDC期权**: `SOL_USDC-25JUL25-150-C`
- **传统期权**: `BTC-25JUL25-50000-C`
- **期货**: `BTC-PERPETUAL`
- **其他**: 所有Deribit支持的工具格式

### Mock数据特性

- 自动解析instrument name格式
- 生成符合类型的完整数据
- 支持USDC期权的特殊属性（10倍乘数、0.01 tick size等）
- 包含所有必需字段

## ✅ 验证清单

- [x] DeribitClient.getInstrument方法实现
- [x] MockDeribitClient.getInstrument方法实现
- [x] 正确的TypeScript类型定义
- [x] API端点实现
- [x] Mock数据生成
- [x] 错误处理
- [x] 文档完整

## 🔄 与getInstruments的对比

| 特性 | getInstruments | getInstrument |
|------|----------------|---------------|
| 功能 | 获取工具列表 | 获取单个工具详情 |
| 参数 | currency, kind | instrumentName |
| 返回类型 | `DeribitOptionInstrument[]` | `DeribitInstrumentDetail \| null` |
| API端点 | `/public/get_instruments` | `/public/get_instrument` |
| 用途 | 批量查询、筛选 | 精确查询单个工具 |

## 🎉 结论

`getInstrument`方法已成功实现，完全仿照`getInstruments`的模式：

1. ✅ **API集成**: 调用Deribit的`/public/get_instrument`端点
2. ✅ **类型安全**: 使用`DeribitInstrumentDetail`类型
3. ✅ **Mock支持**: 完整的Mock实现用于开发测试
4. ✅ **错误处理**: 统一的错误处理机制
5. ✅ **HTTP端点**: RESTful API接口

该方法现在可以用于获取任何Deribit工具的详细信息，包括期权、期货等，并完全支持USDC期权格式。
