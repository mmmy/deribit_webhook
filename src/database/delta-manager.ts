import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  AccountDeltaSummary,
  CreateDeltaRecordInput,
  DeltaRecord,
  DeltaRecordQuery,
  DeltaRecordStats,
  DeltaRecordType,
  InstrumentDeltaSummary,
  UpdateDeltaRecordInput
} from './types';

/**
 * Delta记录数据库管理器
 * 使用better-sqlite3管理Deribit账户的期权仓位和未成交订单的Delta值
 */
export class DeltaManager {
  private db: Database.Database;
  private static instance: DeltaManager;

  constructor(dbPath?: string) {
    // 默认数据库路径
    const defaultPath = path.join(process.cwd(), 'data', 'delta_records.db');
    const finalPath = dbPath || defaultPath;

    // 确保数据目录存在
    const dbDir = path.dirname(finalPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // 初始化数据库连接
    this.db = new Database(finalPath);
    this.db.pragma('journal_mode = WAL'); // 启用WAL模式提高性能
    this.db.pragma('foreign_keys = ON');  // 启用外键约束

    // 初始化数据库表
    this.initializeTables();

    console.log(`✅ Delta数据库已初始化: ${finalPath}`);
  }

  /**
   * 获取单例实例
   */
  public static getInstance(dbPath?: string): DeltaManager {
    if (!DeltaManager.instance) {
      DeltaManager.instance = new DeltaManager(dbPath);
    }
    return DeltaManager.instance;
  }

  /**
   * 初始化数据库表
   */
  private initializeTables(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS delta_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        instrument_name TEXT NOT NULL,
        order_id TEXT,
        target_delta REAL NOT NULL CHECK (target_delta >= -1 AND target_delta <= 1),
        move_position_delta REAL NOT NULL DEFAULT 0 CHECK (move_position_delta >= -1 AND move_position_delta <= 1),
        min_expire_days INTEGER CHECK (min_expire_days IS NULL OR min_expire_days > 0),
        tv_id INTEGER,
        record_type TEXT NOT NULL CHECK (record_type IN ('position', 'order')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createIndexSQL = [
      'CREATE INDEX IF NOT EXISTS idx_account_id ON delta_records(account_id)',
      'CREATE INDEX IF NOT EXISTS idx_instrument_name ON delta_records(instrument_name)',
      'CREATE INDEX IF NOT EXISTS idx_order_id ON delta_records(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_tv_id ON delta_records(tv_id)',
      'CREATE INDEX IF NOT EXISTS idx_record_type ON delta_records(record_type)',
      'CREATE INDEX IF NOT EXISTS idx_account_instrument ON delta_records(account_id, instrument_name)',
      // 唯一约束：同一账户的同一合约只能有一个仓位记录
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_position ON delta_records(account_id, instrument_name) WHERE record_type = 'position'",
      // 唯一约束：同一订单ID只能有一条记录
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_order ON delta_records(order_id) WHERE order_id IS NOT NULL'
    ];

    // 创建触发器：自动更新updated_at字段
    const createTriggerSQL = `
      CREATE TRIGGER IF NOT EXISTS update_delta_records_timestamp 
      AFTER UPDATE ON delta_records
      BEGIN
        UPDATE delta_records SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `;

    try {
      this.db.exec(createTableSQL);
      createIndexSQL.forEach(sql => this.db.exec(sql));
      this.db.exec(createTriggerSQL);
      console.log('📋 数据库表和索引创建完成');
    } catch (error) {
      console.error('❌ 数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建Delta记录
   */
  public createRecord(input: CreateDeltaRecordInput): DeltaRecord {
    const insertSQL = `
      INSERT INTO delta_records (account_id, instrument_name, order_id, target_delta, move_position_delta, min_expire_days, tv_id, record_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const stmt = this.db.prepare(insertSQL);
      const result = stmt.run(
        input.account_id,
        input.instrument_name,
        input.order_id || null,
        input.target_delta,
        input.move_position_delta,
        input.min_expire_days,
        input.tv_id,
        input.record_type
      );

      const record = this.getRecordById(result.lastInsertRowid as number);
      if (!record) {
        throw new Error('创建记录后无法获取记录');
      }

      console.log(`✅ 创建Delta记录: ${input.account_id}/${input.instrument_name} (${input.record_type})`);
      return record;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error(`记录已存在: ${input.account_id}/${input.instrument_name}/${input.order_id || 'position'}`);
      }
      console.error('❌ 创建Delta记录失败:', error);
      throw error;
    }
  }

  /**
   * 根据ID获取记录
   */
  public getRecordById(id: number): DeltaRecord | null {
    const selectSQL = 'SELECT * FROM delta_records WHERE id = ?';
    const stmt = this.db.prepare(selectSQL);
    const record = stmt.get(id) as DeltaRecord | undefined;
    return record || null;
  }

  /**
   * 查询Delta记录
   */
  public getRecords(query: DeltaRecordQuery = {}): DeltaRecord[] {
    let selectSQL = 'SELECT * FROM delta_records WHERE 1=1';
    const params: any[] = [];

    if (query.account_id) {
      selectSQL += ' AND account_id = ?';
      params.push(query.account_id);
    }

    if (query.instrument_name) {
      selectSQL += ' AND instrument_name = ?';
      params.push(query.instrument_name);
    }

    if (query.order_id) {
      selectSQL += ' AND order_id = ?';
      params.push(query.order_id);
    }

    if (query.tv_id) {
      selectSQL += ' AND tv_id = ?';
      params.push(query.tv_id);
    }

    if (query.record_type) {
      selectSQL += ' AND record_type = ?';
      params.push(query.record_type);
    }

    selectSQL += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(selectSQL);
    return stmt.all(...params) as DeltaRecord[];
  }

  /**
   * 更新Delta记录
   */
  public updateRecord(id: number, input: UpdateDeltaRecordInput): DeltaRecord | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (input.target_delta !== undefined) {
      fields.push('target_delta = ?');
      params.push(input.target_delta);
    }

    if (input.move_position_delta !== undefined) {
      fields.push('move_position_delta = ?');
      params.push(input.move_position_delta);
    }

    if (input.min_expire_days !== undefined) {
      fields.push('min_expire_days = ?');
      params.push(input.min_expire_days);
    }

    if (input.order_id !== undefined) {
      fields.push('order_id = ?');
      params.push(input.order_id);
    }

    if (input.tv_id !== undefined) {
      fields.push('tv_id = ?');
      params.push(input.tv_id);
    }

    if (fields.length === 0) {
      throw new Error('没有提供要更新的字段');
    }

    const updateSQL = `UPDATE delta_records SET ${fields.join(', ')} WHERE id = ?`;
    params.push(id);

    try {
      const stmt = this.db.prepare(updateSQL);
      const result = stmt.run(...params);

      if (result.changes === 0) {
        return null;
      }

      const record = this.getRecordById(id);
      console.log(`✅ 更新Delta记录: ID ${id}`);
      return record;
    } catch (error) {
      console.error('❌ 更新Delta记录失败:', error);
      throw error;
    }
  }

  /**
   * 删除Delta记录
   */
  public deleteRecord(id: number): boolean {
    const deleteSQL = 'DELETE FROM delta_records WHERE id = ?';
    const stmt = this.db.prepare(deleteSQL);
    const result = stmt.run(id);

    if (result.changes > 0) {
      console.log(`✅ 删除Delta记录: ID ${id}`);
      return true;
    }
    return false;
  }

  /**
   * 批量删除记录
   */
  public deleteRecords(query: DeltaRecordQuery): number {
    let deleteSQL = 'DELETE FROM delta_records WHERE 1=1';
    const params: any[] = [];

    if (query.account_id) {
      deleteSQL += ' AND account_id = ?';
      params.push(query.account_id);
    }

    if (query.instrument_name) {
      deleteSQL += ' AND instrument_name = ?';
      params.push(query.instrument_name);
    }

    if (query.order_id) {
      deleteSQL += ' AND order_id = ?';
      params.push(query.order_id);
    }

    if (query.tv_id) {
      deleteSQL += ' AND tv_id = ?';
      params.push(query.tv_id);
    }

    if (query.record_type) {
      deleteSQL += ' AND record_type = ?';
      params.push(query.record_type);
    }

    const stmt = this.db.prepare(deleteSQL);
    const result = stmt.run(...params);

    console.log(`✅ 批量删除Delta记录: ${result.changes}条`);
    return result.changes;
  }

  /**
   * 获取数据库统计信息
   */
  public getStats(): DeltaRecordStats {
    const totalSQL = 'SELECT COUNT(*) as count FROM delta_records';
    const positionSQL = "SELECT COUNT(*) as count FROM delta_records WHERE record_type = 'position'";
    const orderSQL = "SELECT COUNT(*) as count FROM delta_records WHERE record_type = 'order'";
    const accountsSQL = 'SELECT DISTINCT account_id FROM delta_records ORDER BY account_id';
    const instrumentsSQL = 'SELECT DISTINCT instrument_name FROM delta_records ORDER BY instrument_name';

    const total = (this.db.prepare(totalSQL).get() as any).count;
    const positions = (this.db.prepare(positionSQL).get() as any).count;
    const orders = (this.db.prepare(orderSQL).get() as any).count;
    const accounts = this.db.prepare(accountsSQL).all().map((row: any) => row.account_id);
    const instruments = this.db.prepare(instrumentsSQL).all().map((row: any) => row.instrument_name);

    return {
      total_records: total,
      position_records: positions,
      order_records: orders,
      accounts,
      instruments
    };
  }

  /**
   * 获取账户Delta汇总
   */
  public getAccountSummary(accountId?: string): AccountDeltaSummary[] {
    let summarySQL = `
      SELECT
        account_id,
        SUM(target_delta) as total_delta,
        SUM(CASE WHEN record_type = 'position' THEN target_delta ELSE 0 END) as position_delta,
        SUM(CASE WHEN record_type = 'order' THEN target_delta ELSE 0 END) as order_delta,
        COUNT(*) as record_count
      FROM delta_records
    `;

    const params: any[] = [];
    if (accountId) {
      summarySQL += ' WHERE account_id = ?';
      params.push(accountId);
    }

    summarySQL += ' GROUP BY account_id ORDER BY account_id';

    const stmt = this.db.prepare(summarySQL);
    return stmt.all(...params) as AccountDeltaSummary[];
  }

  /**
   * 获取合约Delta汇总
   */
  public getInstrumentSummary(instrumentName?: string): InstrumentDeltaSummary[] {
    let summarySQL = `
      SELECT
        instrument_name,
        SUM(target_delta) as total_delta,
        SUM(CASE WHEN record_type = 'position' THEN target_delta ELSE 0 END) as position_delta,
        SUM(CASE WHEN record_type = 'order' THEN target_delta ELSE 0 END) as order_delta,
        COUNT(*) as record_count,
        GROUP_CONCAT(DISTINCT account_id) as accounts
      FROM delta_records
    `;

    const params: any[] = [];
    if (instrumentName) {
      summarySQL += ' WHERE instrument_name = ?';
      params.push(instrumentName);
    }

    summarySQL += ' GROUP BY instrument_name ORDER BY instrument_name';

    const stmt = this.db.prepare(summarySQL);
    const results = stmt.all(...params) as any[];

    return results.map(row => ({
      ...row,
      accounts: row.accounts ? row.accounts.split(',') : []
    })) as InstrumentDeltaSummary[];
  }

  /**
   * 获取特定账户和合约的记录
   */
  public getAccountInstrumentRecord(accountId: string, instrumentName: string, recordType: DeltaRecordType): DeltaRecord | null {
    const selectSQL = `
      SELECT * FROM delta_records
      WHERE account_id = ? AND instrument_name = ? AND record_type = ?
    `;
    const stmt = this.db.prepare(selectSQL);
    const record = stmt.get(accountId, instrumentName, recordType) as DeltaRecord | undefined;
    return record || null;
  }

  /**
   * 更新或创建记录（Upsert操作）
   */
  public upsertRecord(input: CreateDeltaRecordInput): DeltaRecord {
    // 对于仓位记录，检查是否已存在
    if (input.record_type === DeltaRecordType.POSITION) {
      const existing = this.getAccountInstrumentRecord(
        input.account_id,
        input.instrument_name,
        DeltaRecordType.POSITION
      );

      if (existing) {
        // 更新现有记录
        const updated = this.updateRecord(existing.id!, {
          target_delta: input.target_delta,
          move_position_delta: input.move_position_delta,
          min_expire_days: input.min_expire_days,
          tv_id: input.tv_id
        });
        if (!updated) {
          throw new Error('更新现有仓位记录失败');
        }
        console.log(`🔄 更新仓位Delta: ${input.account_id}/${input.instrument_name} = ${input.target_delta}`);
        return updated;
      }
    }

    // 创建新记录
    return this.createRecord(input);
  }

  /**
   * 批量更新或创建记录
   */
  public batchUpsert(records: CreateDeltaRecordInput[]): DeltaRecord[] {
    const transaction = this.db.transaction((records: CreateDeltaRecordInput[]) => {
      const results: DeltaRecord[] = [];
      for (const record of records) {
        results.push(this.upsertRecord(record));
      }
      return results;
    });

    try {
      const results = transaction(records);
      console.log(`✅ 批量处理Delta记录: ${results.length}条`);
      return results;
    } catch (error) {
      console.error('❌ 批量处理Delta记录失败:', error);
      throw error;
    }
  }

  /**
   * 清理过期的订单记录
   */
  public cleanupExpiredOrders(daysOld: number = 7): number {
    const cleanupSQL = `
      DELETE FROM delta_records
      WHERE record_type = 'order'
      AND created_at < datetime('now', '-${daysOld} days')
    `;

    const stmt = this.db.prepare(cleanupSQL);
    const result = stmt.run();

    console.log(`🧹 清理过期订单记录: ${result.changes}条 (${daysOld}天前)`);
    return result.changes;
  }

  /**
   * 导出数据为JSON
   */
  public exportData(query: DeltaRecordQuery = {}): string {
    const records = this.getRecords(query);
    const stats = this.getStats();

    const exportData = {
      export_time: new Date().toISOString(),
      stats,
      records
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 获取数据库信息
   */
  public getDatabaseInfo(): any {
    const info = {
      database_file: this.db.name,
      wal_mode: this.db.pragma('journal_mode', { simple: true }),
      foreign_keys: this.db.pragma('foreign_keys', { simple: true }),
      user_version: this.db.pragma('user_version', { simple: true }),
      page_count: this.db.pragma('page_count', { simple: true }),
      page_size: this.db.pragma('page_size', { simple: true })
    };

    return info;
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    this.db.close();
    console.log('📋 数据库连接已关闭');
  }
}
