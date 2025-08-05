/**
 * 测试Delta记录清理功能
 * 验证平仓成功后是否正确删除对应tv_id的所有记录
 */

const { DeltaManager } = require('./dist/database/delta-manager');
const { DeltaRecordType } = require('./dist/database/types');

async function testDeltaCleanup() {
  console.log('🧪 开始测试Delta记录清理功能...');
  
  try {
    // 1. 初始化DeltaManager
    const deltaManager = new DeltaManager();
    
    // 2. 创建测试数据
    const testTvId = 9999;
    const testAccountId = 'test_account';
    
    console.log(`📝 创建测试记录 (tv_id: ${testTvId})...`);
    
    // 创建几条测试记录
    const testRecords = [
      {
        account_id: testAccountId,
        instrument_name: 'BTC-TEST-100000-C',
        target_delta: 0.5,
        move_position_delta: 0.3,
        tv_id: testTvId,
        record_type: DeltaRecordType.POSITION
      },
      {
        account_id: testAccountId,
        instrument_name: 'BTC-TEST-110000-P',
        target_delta: -0.4,
        move_position_delta: -0.2,
        tv_id: testTvId,
        record_type: DeltaRecordType.POSITION
      },
      {
        account_id: testAccountId,
        instrument_name: 'BTC-TEST-120000-C',
        order_id: 'test_order_123',
        target_delta: 0.6,
        move_position_delta: 0.4,
        tv_id: testTvId,
        record_type: DeltaRecordType.ORDER
      }
    ];
    
    // 创建记录
    const createdRecords = [];
    for (const record of testRecords) {
      const created = deltaManager.createRecord(record);
      createdRecords.push(created);
      console.log(`✅ 创建记录: ${created.instrument_name} (ID: ${created.id})`);
    }
    
    // 3. 验证记录已创建
    const beforeRecords = deltaManager.getRecords({ tv_id: testTvId });
    console.log(`📊 创建前查询结果: 找到 ${beforeRecords.length} 条记录`);
    
    if (beforeRecords.length !== testRecords.length) {
      throw new Error(`记录数量不匹配: 期望 ${testRecords.length}, 实际 ${beforeRecords.length}`);
    }
    
    // 4. 模拟平仓成功后的清理操作
    console.log(`🗑️ 模拟平仓成功，删除tv_id ${testTvId}的所有记录...`);
    const deletedCount = deltaManager.deleteRecords({ tv_id: testTvId });
    console.log(`✅ 删除了 ${deletedCount} 条记录`);
    
    // 5. 验证记录已删除
    const afterRecords = deltaManager.getRecords({ tv_id: testTvId });
    console.log(`📊 删除后查询结果: 找到 ${afterRecords.length} 条记录`);
    
    if (afterRecords.length !== 0) {
      throw new Error(`删除失败: 仍有 ${afterRecords.length} 条记录存在`);
    }
    
    if (deletedCount !== testRecords.length) {
      throw new Error(`删除数量不匹配: 期望删除 ${testRecords.length}, 实际删除 ${deletedCount}`);
    }
    
    // 6. 验证其他tv_id的记录未受影响
    const otherTvId = 8888;
    const otherRecord = deltaManager.createRecord({
      account_id: testAccountId,
      instrument_name: 'BTC-OTHER-100000-C',
      target_delta: 0.3,
      move_position_delta: 0.1,
      tv_id: otherTvId,
      record_type: DeltaRecordType.POSITION
    });
    
    console.log(`📝 创建其他tv_id记录: ${otherRecord.instrument_name} (tv_id: ${otherTvId})`);
    
    // 再次删除测试tv_id的记录（应该没有影响）
    const secondDeleteCount = deltaManager.deleteRecords({ tv_id: testTvId });
    console.log(`🗑️ 第二次删除tv_id ${testTvId}: 删除了 ${secondDeleteCount} 条记录`);
    
    // 验证其他记录仍然存在
    const otherRecords = deltaManager.getRecords({ tv_id: otherTvId });
    if (otherRecords.length !== 1) {
      throw new Error(`其他记录受到影响: 期望 1 条, 实际 ${otherRecords.length} 条`);
    }
    
    // 清理测试数据
    deltaManager.deleteRecords({ tv_id: otherTvId });
    
    console.log('✅ 所有测试通过！');
    console.log('📋 测试总结:');
    console.log(`   - 成功创建 ${testRecords.length} 条测试记录`);
    console.log(`   - 成功删除 ${deletedCount} 条记录`);
    console.log(`   - 验证了删除操作的准确性`);
    console.log(`   - 验证了其他记录不受影响`);
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testDeltaCleanup().then(() => {
    console.log('🎉 测试完成');
    process.exit(0);
  }).catch(error => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
}

module.exports = { testDeltaCleanup };
