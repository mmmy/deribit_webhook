# Deribit API 期权交易接口文档

## 概述
Deribit提供REST API和WebSocket API两种接口方式，支持测试环境和生产环境。

### 环境配置
- **测试环境**: `test.deribit.com`
- **生产环境**: `www.deribit.com`
- **API版本**: v2

---

## 认证接口

### OAuth 2.0 认证
- **`public/auth`** - 获取访问令牌
  - 支持client_credentials、client_signature、refresh_token方式
  - 返回access_token、过期时间和refresh_token

### 连接测试
- **`public/get_time`** - 获取服务器时间
- **`public/test`** - 测试API连接状态

---

## 市场数据接口（公开，无需认证）

### 基础市场信息
- **`public/get_instruments`** - 获取可交易工具列表
  - 参数: currency (BTC/ETH), kind (option/future), expired (是否包含过期)
  
- **`public/get_currencies`** - 获取支持的货币列表

### 实时行情数据
- **`public/get_order_book`** - 获取订单簿
  - 参数: instrument_name, depth (订单簿深度)
  
- **`public/ticker`** - 获取实时价格信息
  - 参数: instrument_name
  
- **`public/get_last_trades`** - 获取最新交易记录
  - 参数: instrument_name, count, include_old

### 指数和统计数据
- **`public/get_index`** - 获取指数价格
- **`public/get_historical_volatility`** - 获取历史波动率
- **`public/get_funding_chart_data`** - 获取资金费率图表数据

---

## 订单管理接口（私有，需要认证）

### 下单接口
- **`private/buy`** - 买入期权
  - 参数: instrument_name, amount, type (limit/market), price, time_in_force
  
- **`private/sell`** - 卖出期权
  - 参数: instrument_name, amount, type (limit/market), price, time_in_force

### 订单操作
- **`private/edit`** - 修改订单
  - 参数: order_id, amount, price
  
- **`private/cancel`** - 取消单个订单
  - 参数: order_id
  
- **`private/cancel_all`** - 取消所有订单
  - 参数: 可选 instrument_name, currency, kind

- **`private/cancel_all_by_currency`** - 按货币取消所有订单
- **`private/cancel_all_by_instrument`** - 按工具取消所有订单

---

## 账户管理接口（私有）

### 账户信息
- **`private/get_account_summary`** - 获取账户摘要
  - 参数: currency, extended (是否包含扩展信息)
  
- **`private/get_position`** - 获取特定持仓
  - 参数: instrument_name
  
- **`private/get_positions`** - 获取所有持仓
  - 参数: currency, kind

### 订单和交易历史
- **`private/get_open_orders`** - 获取未成交订单
  - 参数: currency, kind, type
  
- **`private/get_order_history`** - 获取订单历史
  - 参数: currency, instrument_name, count, offset
  
- **`private/get_user_trades_by_currency`** - 按货币获取交易历史
- **`private/get_user_trades_by_instrument`** - 按工具获取交易历史

### 保证金和风险管理
- **`private/get_margins`** - 获取保证金信息
- **`private/set_portfolio_margining`** - 设置投资组合保证金

---

## WebSocket 订阅接口

### 市场数据订阅
- **`book.{instrument}.{group}.{depth}`** - 订阅订单簿变化
  - 例: `book.BTC-25JUL25-50000-C.none.10`
  
- **`trades.{instrument}.{interval}`** - 订阅交易流
  - 例: `trades.BTC-25JUL25-50000-C.100ms`
  
- **`ticker.{instrument}`** - 订阅价格变动
  - 例: `ticker.BTC-25JUL25-50000-C`

### 用户数据订阅
- **`user.portfolio.{currency}`** - 订阅投资组合变化
  - 例: `user.portfolio.BTC`
  
- **`user.orders.{instrument}`** - 订阅订单状态变化
- **`user.trades.{instrument}`** - 订阅用户交易
- **`user.changes.{instrument}`** - 订阅用户数据变化

---

## 期权特有参数

### 期权工具命名规则
格式: `{CURRENCY}-{EXPIRY}-{STRIKE}-{TYPE}`
- CURRENCY: BTC, ETH, SOL等
- EXPIRY: 到期日期 (例: 25JUL25)
- STRIKE: 行权价格 (例: 50000)
- TYPE: C (看涨) 或 P (看跌)

示例: `BTC-25JUL25-50000-C` (BTC 2025年7月25日到期，行权价50000的看涨期权)

### 期权特有字段
- `greeks` - 希腊字母 (delta, gamma, theta, vega)
- `implied_volatility` - 隐含波动率
- `time_value` - 时间价值
- `intrinsic_value` - 内在价值

---

## 错误处理

### 常见错误代码
- `10001` - 认证失败
- `10009` - 订单被拒绝
- `10010` - 余额不足
- `11029` - 工具不存在
- `11044` - 价格超出限制

### 限流规则
- API调用频率限制
- 订单/成交量比率监控 (OTV)
- WebSocket连接数限制

---

## 最佳实践

1. **使用WebSocket**: 优先使用WebSocket获取实时数据，减少API轮询
2. **错误重试**: 实现指数退避重试机制
3. **限流管理**: 合理控制API调用频率
4. **测试环境**: 先在测试环境验证功能
5. **安全性**: 妥善保管API密钥，使用适当的权限范围