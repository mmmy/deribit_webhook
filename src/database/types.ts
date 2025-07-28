/**
 * 数据库相关类型定义
 */

// Delta记录类型枚举
export enum DeltaRecordType {
  POSITION = 'position',    // 仓位
  ORDER = 'order'          // 未成交订单
}

// Delta记录接口
export interface DeltaRecord {
  id?: number;                    // 自增主键
  account_id: string;             // 账户ID
  instrument_name: string;        // 合约名称 (如: BTC-8AUG25-113000-C)
  order_id?: string;              // 订单ID (仓位时为null)
  delta: number;                  // Delta值 (-1 到 1)
  tv_id: number;                  // TradingView信号ID
  record_type: DeltaRecordType;   // 记录类型
  created_at?: string;            // 创建时间
  updated_at?: string;            // 更新时间
}

// 创建Delta记录的输入参数
export interface CreateDeltaRecordInput {
  account_id: string;
  instrument_name: string;
  order_id?: string;
  delta: number;
  tv_id: number;
  record_type: DeltaRecordType;
}

// 更新Delta记录的输入参数
export interface UpdateDeltaRecordInput {
  delta?: number;
  order_id?: string;
  tv_id?: number;
}

// 查询条件接口
export interface DeltaRecordQuery {
  account_id?: string;
  instrument_name?: string;
  order_id?: string;
  tv_id?: number;
  record_type?: DeltaRecordType;
}

// 数据库统计信息
export interface DeltaRecordStats {
  total_records: number;
  position_records: number;
  order_records: number;
  accounts: string[];
  instruments: string[];
}

// 按账户分组的Delta汇总
export interface AccountDeltaSummary {
  account_id: string;
  total_delta: number;
  position_delta: number;
  order_delta: number;
  record_count: number;
}

// 按合约分组的Delta汇总
export interface InstrumentDeltaSummary {
  instrument_name: string;
  total_delta: number;
  position_delta: number;
  order_delta: number;
  record_count: number;
  accounts: string[];
}
