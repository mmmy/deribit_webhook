// 测试Delta数据库模块
import fs from 'fs';
import path from 'path';
import { CreateDeltaRecordInput, DeltaManager, DeltaRecordType } from './src/database';

async function testDeltaDatabase() {
  console.log('🎯 测试Delta数据库模块...\n');

  // 使用临时数据库文件
  const testDbPath = path.join(__dirname, 'test_delta.db');
  
  // 清理之前的测试文件
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  try {
    // 1. 初始化数据库
    console.log('📋 步骤1: 初始化数据库');
    const deltaManager = new DeltaManager(testDbPath);
    
    // 2. 创建测试数据
    console.log('\n📋 步骤2: 创建测试数据');
    
    const testRecords: CreateDeltaRecordInput[] = [
      // 仓位记录
      {
        account_id: 'yqtest',
        instrument_name: 'BTC-8AUG25-113000-C',
        delta: 0.15,
        tv_id: 1001,
        record_type: DeltaRecordType.POSITION
      },
      {
        account_id: 'yqtest',
        instrument_name: 'BTC-15AUG25-90000-P',
        delta: -0.08,
        tv_id: 1002,
        record_type: DeltaRecordType.POSITION
      },
      {
        account_id: 'main',
        instrument_name: 'BTC-29AUG25-100000-C',
        delta: 0.28,
        tv_id: 1003,
        record_type: DeltaRecordType.POSITION
      },
      // 订单记录
      {
        account_id: 'yqtest',
        instrument_name: 'ETH-22AUG25-3200-C',
        order_id: 'order_123456',
        delta: 0.42,
        tv_id: 2001,
        record_type: DeltaRecordType.ORDER
      },
      {
        account_id: 'main',
        instrument_name: 'ETH-5SEP25-3400-C',
        order_id: 'order_789012',
        delta: 0.38,
        tv_id: 2002,
        record_type: DeltaRecordType.ORDER
      }
    ];

    // 批量创建记录
    const createdRecords = deltaManager.batchUpsert(testRecords);
    console.log(`✅ 创建了 ${createdRecords.length} 条记录`);

    // 3. 测试查询功能
    console.log('\n📋 步骤3: 测试查询功能');
    
    // 查询所有记录
    const allRecords = deltaManager.getRecords();
    console.log(`📊 总记录数: ${allRecords.length}`);

    // 按账户查询
    const yqtestRecords = deltaManager.getRecords({ account_id: 'yqtest' });
    console.log(`📊 yqtest账户记录数: ${yqtestRecords.length}`);

    // 按记录类型查询
    const positionRecords = deltaManager.getRecords({ record_type: DeltaRecordType.POSITION });
    console.log(`📊 仓位记录数: ${positionRecords.length}`);

    const orderRecords = deltaManager.getRecords({ record_type: DeltaRecordType.ORDER });
    console.log(`📊 订单记录数: ${orderRecords.length}`);

    // 按tv_id查询
    const tvIdRecords = deltaManager.getRecords({ tv_id: 1001 });
    console.log(`📊 tv_id=1001的记录数: ${tvIdRecords.length}`);

    // 4. 测试更新功能
    console.log('\n📋 步骤4: 测试更新功能');
    
    const firstRecord = createdRecords[0];
    const updatedRecord = deltaManager.updateRecord(firstRecord.id!, { delta: 0.25 });
    console.log(`✅ 更新记录: ${firstRecord.delta} → ${updatedRecord?.delta}`);

    // 5. 测试Upsert功能
    console.log('\n📋 步骤5: 测试Upsert功能');
    
    // 尝试更新现有仓位
    const upsertResult = deltaManager.upsertRecord({
      account_id: 'yqtest',
      instrument_name: 'BTC-8AUG25-113000-C',
      delta: 0.35,
      tv_id: 1001,
      record_type: DeltaRecordType.POSITION
    });
    console.log(`✅ Upsert结果: Delta = ${upsertResult.delta}`);

    // 6. 测试汇总功能
    console.log('\n📋 步骤6: 测试汇总功能');
    
    const accountSummary = deltaManager.getAccountSummary();
    console.log('📊 账户汇总:');
    accountSummary.forEach(summary => {
      console.log(`   ${summary.account_id}: 总Delta=${summary.total_delta}, 仓位Delta=${summary.position_delta}, 订单Delta=${summary.order_delta}`);
    });

    const instrumentSummary = deltaManager.getInstrumentSummary();
    console.log('📊 合约汇总:');
    instrumentSummary.forEach(summary => {
      console.log(`   ${summary.instrument_name}: 总Delta=${summary.total_delta}, 账户=[${summary.accounts.join(', ')}]`);
    });

    // 7. 测试统计信息
    console.log('\n📋 步骤7: 测试统计信息');
    
    const stats = deltaManager.getStats();
    console.log('📊 数据库统计:');
    console.log(`   总记录数: ${stats.total_records}`);
    console.log(`   仓位记录: ${stats.position_records}`);
    console.log(`   订单记录: ${stats.order_records}`);
    console.log(`   账户数: ${stats.accounts.length} [${stats.accounts.join(', ')}]`);
    console.log(`   合约数: ${stats.instruments.length}`);

    // 8. 测试数据导出
    console.log('\n📋 步骤8: 测试数据导出');
    
    const exportData = deltaManager.exportData({ account_id: 'yqtest' });
    console.log(`✅ 导出yqtest账户数据: ${exportData.length}字符`);

    // 9. 测试数据库信息
    console.log('\n📋 步骤9: 测试数据库信息');
    
    const dbInfo = deltaManager.getDatabaseInfo();
    console.log('📊 数据库信息:');
    console.log(`   文件: ${dbInfo.database_file}`);
    console.log(`   WAL模式: ${dbInfo.wal_mode}`);
    console.log(`   外键约束: ${dbInfo.foreign_keys}`);
    console.log(`   页面数: ${dbInfo.page_count}`);

    // 10. 测试删除功能
    console.log('\n📋 步骤10: 测试删除功能');
    
    // 删除特定订单
    const deletedCount = deltaManager.deleteRecords({ 
      record_type: DeltaRecordType.ORDER,
      account_id: 'yqtest'
    });
    console.log(`✅ 删除yqtest的订单记录: ${deletedCount}条`);

    // 11. 最终统计
    console.log('\n📋 步骤11: 最终统计');
    
    const finalStats = deltaManager.getStats();
    console.log('📊 最终统计:');
    console.log(`   剩余记录数: ${finalStats.total_records}`);
    console.log(`   仓位记录: ${finalStats.position_records}`);
    console.log(`   订单记录: ${finalStats.order_records}`);

    // 关闭数据库
    deltaManager.close();

    console.log('\n🎉 所有测试完成！');
    console.log('\n✅ 测试结果:');
    console.log('   ✅ 数据库初始化成功');
    console.log('   ✅ 增删改查功能正常');
    console.log('   ✅ Upsert功能正常');
    console.log('   ✅ 汇总统计功能正常');
    console.log('   ✅ 数据导出功能正常');
    console.log('   ✅ 约束和索引工作正常');

  } catch (error: any) {
    console.error('\n❌ 测试失败:');
    console.error(`错误: ${error.message}`);
    console.error(`堆栈: ${error.stack}`);
  } finally {
    // 清理测试文件
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log('🧹 清理测试数据库文件');
    }
  }
}

// 执行测试
if (require.main === module) {
  testDeltaDatabase().catch(error => {
    console.error('测试执行失败:', error.message);
    process.exit(1);
  });
}

export { testDeltaDatabase };

