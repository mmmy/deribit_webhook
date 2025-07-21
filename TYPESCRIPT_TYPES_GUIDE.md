# TypeScript 类型定义指南

## 🎯 概述

本文档详细说明了项目中期权相关函数的TypeScript类型定义，特别是`getInstruments`函数的返回值类型定义。

## 📋 核心类型定义

### DeribitOptionInstrument 接口

**文件**: `src/types/index.ts`

```typescript
export interface DeribitOptionInstrument {
  instrument_name: string;               // 期权合约名称 (如 'BTC-25JUL25-50000-C')
  currency: string;                      // 标的货币 (如 'BTC')
  kind: string;                          // 工具类型 ('option')
  option_type: 'call' | 'put';          // 期权类型: call(看涨) 或 put(看跌)
  strike: number;                        // 行权价格
  expiration_timestamp: number;          // 到期时间戳 (毫秒)
  tick_size: number;                     // 最小价格变动单位
  min_trade_amount: number;              // 最小交易数量
  contract_size: number;                 // 合约大小
  is_active: boolean;                    // 是否活跃
  settlement_period: string;             // 结算周期
  creation_timestamp: number;            // 创建时间戳
  base_currency: string;                 // 基础货币
  quote_currency: string;                // 计价货币
}
```

### OptionListParams 接口

```typescript
export interface OptionListParams {
  underlying: string;                    // 期权标的 (如 'BTC', 'ETH')
  direction: 'long' | 'short';          // 方向: long(看涨) 或 short(看跌)
  expired?: boolean;                     // 是否包含已过期期权，默认false
  minStrike?: number;                    // 最小行权价
  maxStrike?: number;                    // 最大行权价
  minExpiry?: Date;                      // 最小到期时间
  maxExpiry?: Date;                      // 最大到期时间
}
```

### OptionListResult 接口

```typescript
export interface OptionListResult {
  success: boolean;
  message: string;
  data?: {
    instruments: DeribitOptionInstrument[];
    total: number;
    filtered: number;
    underlying: string;
    direction: 'long' | 'short';
  };
  error?: string;
}
```

## 🔧 函数类型定义

### DeribitClient.getInstruments()

**文件**: `src/services/deribit-client.ts`

```typescript
/**
 * 获取可交易工具列表
 * @param currency 货币类型，如 'BTC', 'ETH'
 * @param kind 工具类型，如 'option', 'future'
 * @returns 工具列表
 */
async getInstruments(
  currency: string = 'BTC', 
  kind: string = 'option'
): Promise<DeribitOptionInstrument[]>
```

**改进前**: `Promise<any[]>`  
**改进后**: `Promise<DeribitOptionInstrument[]>`

### MockDeribitClient.getInstruments()

**文件**: `src/services/mock-deribit.ts`

```typescript
async getInstruments(
  currency: string = 'BTC', 
  kind: string = 'option'
): Promise<DeribitOptionInstrument[]>
```

### MockDeribitClient.generateMockInstruments()

```typescript
private generateMockInstruments(currency: string): DeribitOptionInstrument[]
```

**改进前**: `any[]`  
**改进后**: `DeribitOptionInstrument[]`

### OptionService.getOptionsList()

**文件**: `src/services/option-service.ts`

```typescript
public async getOptionsList(
  params: OptionListParams,
  accountName?: string
): Promise<OptionListResult>
```

## 📦 导入方式

### 类型导入

推荐使用 `type` 关键字进行类型导入，以明确区分类型和值：

```typescript
// 推荐方式
import type { DeribitOptionInstrument } from '../types';
import { ApiKeyConfig, AuthResponse } from '../types';

// 或者混合导入
import { ApiKeyConfig, AuthResponse, DeribitOptionInstrument } from '../types';
```

### 导入示例

**deribit-client.ts**:
```typescript
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ConfigLoader } from '../config';
import type { DeribitOptionInstrument } from '../types';
import { ApiKeyConfig, AuthResponse } from '../types';
```

**mock-deribit.ts**:
```typescript
import type { DeribitOptionInstrument } from '../types';
import { ApiKeyConfig, AuthResponse } from '../types';
```

## 🎯 类型安全的好处

### 1. 编译时错误检查

```typescript
// ❌ 编译时会报错
const instruments: DeribitOptionInstrument[] = await client.getInstruments();
instruments.forEach(instrument => {
  console.log(instrument.invalid_property); // 类型错误
});

// ✅ 类型安全
instruments.forEach(instrument => {
  console.log(instrument.instrument_name); // 正确
  console.log(instrument.strike);          // 正确
  console.log(instrument.option_type);     // 正确
});
```

### 2. IDE 智能提示

使用强类型定义后，IDE会提供：
- 属性自动补全
- 方法签名提示
- 类型错误高亮
- 重构支持

### 3. 代码文档化

类型定义本身就是最好的文档：

```typescript
// 一目了然的函数签名
async getInstruments(
  currency: string = 'BTC', 
  kind: string = 'option'
): Promise<DeribitOptionInstrument[]>

// 清晰的参数类型
interface OptionListParams {
  underlying: string;
  direction: 'long' | 'short';  // 限制为特定值
  minStrike?: number;           // 可选参数
}
```

## 🔍 使用示例

### 基本使用

```typescript
import { DeribitClient } from './services/deribit-client';
import type { DeribitOptionInstrument } from './types';

const client = new DeribitClient();

// 类型安全的函数调用
const instruments: DeribitOptionInstrument[] = await client.getInstruments('BTC', 'option');

// 类型安全的属性访问
instruments.forEach(instrument => {
  console.log(`合约: ${instrument.instrument_name}`);
  console.log(`行权价: ${instrument.strike}`);
  console.log(`类型: ${instrument.option_type}`);
  console.log(`到期: ${new Date(instrument.expiration_timestamp).toLocaleDateString()}`);
});
```

### 过滤和处理

```typescript
// 类型安全的过滤操作
const callOptions = instruments.filter(
  (instrument): instrument is DeribitOptionInstrument => 
    instrument.option_type === 'call'
);

const highStrikeOptions = instruments.filter(
  instrument => instrument.strike > 50000
);

// 类型安全的映射操作
const instrumentNames = instruments.map(
  instrument => instrument.instrument_name
);
```

## 🚀 最佳实践

### 1. 使用严格的类型定义

```typescript
// ✅ 好的做法
option_type: 'call' | 'put';

// ❌ 避免的做法
option_type: string;
```

### 2. 提供完整的JSDoc注释

```typescript
/**
 * 获取可交易工具列表
 * @param currency 货币类型，如 'BTC', 'ETH'
 * @param kind 工具类型，如 'option', 'future'
 * @returns 工具列表
 */
async getInstruments(currency: string, kind: string): Promise<DeribitOptionInstrument[]>
```

### 3. 使用可选属性

```typescript
interface OptionListParams {
  underlying: string;           // 必需
  direction: 'long' | 'short'; // 必需
  minStrike?: number;          // 可选
  maxStrike?: number;          // 可选
}
```

## 📊 构建验证

所有类型定义都通过了TypeScript编译器的严格检查：

```bash
npm run build
# ✅ 构建成功，无类型错误
```

## 🔗 相关文件

- `src/types/index.ts` - 核心类型定义
- `src/services/deribit-client.ts` - 真实API客户端
- `src/services/mock-deribit.ts` - Mock客户端
- `src/services/option-service.ts` - 期权服务
- `tsconfig.json` - TypeScript配置

---

**更新时间**: 2025-01-21  
**类型检查**: ✅ 通过  
**构建状态**: ✅ 成功
