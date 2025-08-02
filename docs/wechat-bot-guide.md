# 企业微信机器人模块使用指南

## 概述

本模块提供了完整的企业微信机器人消息发送功能，支持文本、Markdown、图片、图文和文件等多种消息类型。同时提供了专门的通知服务，方便发送交易通知、系统状态、价格预警等业务相关的消息。

## 功能特性

- ✅ 支持多种消息类型（文本、Markdown、图片、图文、文件）
- ✅ 自动重试机制，提高消息发送成功率
- ✅ 完整的错误处理和日志记录
- ✅ 预定义的业务通知模板
- ✅ 环境变量配置支持
- ✅ TypeScript 类型支持
- ✅ URL 格式验证

## 快速开始

### 1. 获取企业微信机器人 Webhook URL

1. 在企业微信群中，点击右上角的"..."
2. 选择"群机器人"
3. 点击"添加机器人"
4. 选择"自定义机器人"
5. 设置机器人名称和头像
6. 复制生成的 Webhook URL

### 2. 配置环境变量

在 `.env` 文件中添加以下配置：

```bash
# 企业微信机器人配置
WECHAT_BOT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_BOT_KEY_HERE
WECHAT_BOT_TIMEOUT=10000
WECHAT_BOT_RETRY_COUNT=3
WECHAT_BOT_RETRY_DELAY=1000
```

### 3. 基础使用

```typescript
import { createWeChatBot, wechatNotification } from './src/services';

// 方式1: 直接创建机器人实例
const bot = createWeChatBot('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY');

// 发送文本消息
await bot.sendText('Hello, 这是一条测试消息！');

// 方式2: 使用通知服务（推荐）
await wechatNotification.sendTradeNotification(
  'BTC-PERPETUAL',
  'BUY',
  45000.50,
  0.1,
  'SUCCESS'
);
```

## API 文档

### WeChatBot 类

#### 构造函数
```typescript
constructor(config: WeChatBotConfig)
```

#### 主要方法

##### sendText(content, mentionedList?, mentionedMobileList?)
发送文本消息
- `content`: 消息内容
- `mentionedList`: 要@的用户列表（可选）
- `mentionedMobileList`: 要@的手机号列表（可选）

##### sendMarkdown(content)
发送 Markdown 格式消息
- `content`: Markdown 内容

##### sendImage(base64, md5)
发送图片消息
- `base64`: 图片的 base64 编码
- `md5`: 图片的 md5 值

##### sendNews(articles)
发送图文消息
- `articles`: 图文列表

##### sendFile(mediaId)
发送文件消息
- `mediaId`: 文件的 media_id

### WeChatNotificationService 类

#### 主要方法

##### sendTradeNotification(symbol, action, price, quantity, status)
发送交易通知
- `symbol`: 交易对
- `action`: 操作类型 ('BUY' | 'SELL')
- `price`: 价格
- `quantity`: 数量
- `status`: 状态 ('SUCCESS' | 'FAILED' | 'PENDING')

##### sendSystemNotification(service, status, message)
发送系统状态通知
- `service`: 服务名称
- `status`: 状态 ('ONLINE' | 'OFFLINE' | 'ERROR' | 'WARNING')
- `message`: 消息内容

##### sendPriceAlert(symbol, currentPrice, targetPrice, direction)
发送价格预警通知
- `symbol`: 交易对
- `currentPrice`: 当前价格
- `targetPrice`: 目标价格
- `direction`: 方向 ('ABOVE' | 'BELOW')

##### sendErrorNotification(error, context?)
发送错误通知
- `error`: 错误对象
- `context`: 上下文信息（可选）

##### sendDailyReport(data)
发送日报
- `data`: 包含交易统计数据的对象

## 使用示例

### 发送交易通知
```typescript
import { wechatNotification } from './src/services';

// 成功交易通知
await wechatNotification.sendTradeNotification(
  'BTC-PERPETUAL',
  'BUY',
  45000.50,
  0.1,
  'SUCCESS'
);

// 失败交易通知
await wechatNotification.sendTradeNotification(
  'ETH-PERPETUAL',
  'SELL',
  3200.00,
  0.5,
  'FAILED'
);
```

### 发送系统状态通知
```typescript
// 服务上线通知
await wechatNotification.sendSystemNotification(
  'Deribit WebSocket',
  'ONLINE',
  '连接正常，数据流稳定'
);

// 系统错误通知
await wechatNotification.sendSystemNotification(
  'Database',
  'ERROR',
  '数据库连接失败，正在尝试重连'
);
```

### 发送价格预警
```typescript
await wechatNotification.sendPriceAlert(
  'BTC-PERPETUAL',
  45500.00,
  45000.00,
  'ABOVE'
);
```

### 发送错误通知
```typescript
try {
  // 一些可能出错的代码
} catch (error) {
  await wechatNotification.sendErrorNotification(
    error,
    'Order Processing'
  );
}
```

### 发送日报
```typescript
await wechatNotification.sendDailyReport({
  totalTrades: 25,
  successfulTrades: 23,
  failedTrades: 2,
  totalVolume: 125000.50,
  totalProfit: 2500.75
});
```

## 配置选项

### WeChatBotConfig
```typescript
interface WeChatBotConfig {
  webhookUrl: string;      // 必填：机器人 webhook URL
  timeout?: number;        // 可选：请求超时时间（毫秒），默认 10000
  retryCount?: number;     // 可选：重试次数，默认 3
  retryDelay?: number;     // 可选：重试延迟（毫秒），默认 1000
}
```

## 错误处理

模块内置了完善的错误处理机制：

1. **URL 验证**：自动验证 webhook URL 格式
2. **重试机制**：网络错误时自动重试
3. **超时处理**：请求超时自动终止
4. **错误日志**：详细的错误日志记录

## 注意事项

1. **频率限制**：企业微信机器人有发送频率限制，建议不要过于频繁发送消息
2. **消息长度**：单条消息内容不要超过 4096 个字符
3. **图片大小**：图片 base64 编码后不能超过 2MB
4. **安全性**：不要在代码中硬编码 webhook URL，使用环境变量

## 故障排除

### 常见问题

1. **消息发送失败**
   - 检查 webhook URL 是否正确
   - 确认机器人是否被移除
   - 检查网络连接

2. **配置不生效**
   - 确认环境变量已正确设置
   - 重启应用程序

3. **类型错误**
   - 确保使用正确的 TypeScript 类型
   - 检查导入路径

### 调试模式

启用详细日志：
```typescript
// 在发送消息前检查机器人状态
if (!wechatNotification.isAvailable()) {
  console.warn('WeChat Bot not configured');
}
```

## 更新日志

- v1.0.0: 初始版本，支持基础消息发送功能
- v1.1.0: 添加通知服务和预定义模板
- v1.2.0: 增加错误处理和重试机制
