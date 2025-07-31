# 添加min_expire_days字段 - 更新日志

## 概述
为Delta数据库添加了新的`min_expire_days`字段，用于记录最小到期天数。这个字段是大于0的整数，在target_delta或move_position_delta出现的地方都会显示。

## 修改内容

### 1. 数据库结构更新

#### 1.1 类型定义 (`src/database/types.ts`)
- 在`DeltaRecord`接口中添加了`min_expire_days: number`字段
- 在`CreateDeltaRecordInput`接口中添加了`min_expire_days: number`字段
- 在`UpdateDeltaRecordInput`接口中添加了`min_expire_days?: number`字段

#### 1.2 数据库管理器 (`src/database/delta-manager.ts`)
- 添加了数据库迁移逻辑，检测并添加`min_expire_days`字段
- 新增`rebuildTableWithMinExpireDays()`方法处理数据库结构迁移
- 更新了表创建SQL，包含`min_expire_days INTEGER NOT NULL DEFAULT 1 CHECK (min_expire_days > 0)`约束
- 更新了`createRecord()`方法支持新字段
- 更新了`updateRecord()`方法支持新字段
- 更新了`upsertRecord()`方法支持新字段

### 2. API路由更新 (`src/index.ts`)

#### 2.1 POST `/api/delta/:accountId`
- 添加了`min_expire_days`参数解析
- 添加了字段验证：必须大于0
- 默认值设为1

#### 2.2 PUT `/api/delta/:accountId/:recordId`
- 添加了`min_expire_days`参数解析和验证
- 支持更新min_expire_days字段

### 3. 业务逻辑更新

#### 3.1 期权交易服务 (`src/services/option-trading.ts`)
- 在`OptionTradingParams`接口中添加了`n?: number`字段
- 更新了`parseSignalToTradingParams()`方法传递n字段
- 在创建Delta记录时使用`params.n`作为`min_expire_days`值

#### 3.2 类型定义 (`src/types/index.ts`)
- 在`OptionTradingParams`接口中添加了`n?: number`字段

### 4. 前端页面更新 (`public/delta-manager.html`)

#### 4.1 表格显示
- 在仓位记录表格中添加了"最小到期天数"列
- 在订单记录表格中添加了"最小到期天数"列
- 更新了表格数据渲染逻辑显示`min_expire_days`字段

#### 4.2 表单功能
- 在快速添加模态框中添加了"最小到期天数"输入字段
- 在编辑模态框中添加了"最小到期天数"输入字段
- 添加了字段验证：必须是大于0的整数
- 更新了表单提交逻辑处理新字段

### 5. 文档更新 (`docs/position-database-recording.md`)
- 更新了数据库表结构文档，包含新的`min_expire_days`字段定义

## 数据库迁移

系统会自动检测现有数据库是否缺少`min_expire_days`字段，如果缺少会自动执行迁移：

1. 创建新表结构包含`min_expire_days`字段
2. 复制现有数据，为`min_expire_days`设置默认值1
3. 删除旧表，重命名新表

## 字段约束

- **类型**: INTEGER
- **约束**: NOT NULL, DEFAULT 1, CHECK (min_expire_days > 0)
- **含义**: 最小到期天数，用于期权选择时的时间过滤

## API使用示例

### 创建记录
```json
POST /api/delta/yqtest
{
  "instrument_name": "BTC-25JUL25-50000-C",
  "target_delta": 0.5,
  "move_position_delta": 0.3,
  "min_expire_days": 7,
  "tv_id": 12345,
  "record_type": "position"
}
```

### 更新记录
```json
PUT /api/delta/yqtest/123
{
  "min_expire_days": 14
}
```

## 测试验证

已通过完整的功能测试，包括：
- ✅ 创建包含min_expire_days字段的记录
- ✅ 获取记录并验证字段值
- ✅ 更新min_expire_days字段
- ✅ 验证无效值被正确拒绝
- ✅ 前端页面正确显示和编辑新字段

## 向后兼容性

- 现有API调用如果不提供`min_expire_days`字段，会使用默认值1
- 现有数据库记录会在迁移时自动添加默认值1
- 前端页面会正确处理缺少该字段的旧记录

## 部署注意事项

1. 数据库迁移会在服务启动时自动执行
2. 建议在部署前备份数据库
3. 迁移过程中会短暂锁定表，但通常在毫秒级完成
4. 前端页面需要刷新以显示新的表格列
