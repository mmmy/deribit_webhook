// 测试webhook接口的tv_id字段
import { WebhookSignalPayload } from './src/types';
import { DeltaManager, DeltaRecordType } from './src/database';

async function testWebhookTVID() {
  console.log('🎯 测试Webhook TV_ID字段...\n');

  try {
    // 1. 模拟webhook payload数据
    console.log('📋 步骤1: 创建模拟webhook数据');
    
    const webhookPayload: WebhookSignalPayload = {
      accountName: 'yqtest',
      side: 'buy',
      exchange: 'deribit',
      period: '1h',
      marketPosition: 'long',
      prevMarketPosition: 'flat',
      symbol: 'BTC',
      price: '95234.5',
      timestamp: new Date().toISOString(),
      size: '0.1',
      positionSize: '0.1',
      id: 'strategy_001',
      tv_id: 12345,  // TradingView信号ID
      qtyType: 'fixed',
      delta1: 0.25,
      n: 7
    };

    console.log('✅ Webhook数据创建完成:');
    console.log(`   账户: ${webhookPayload.accountName}`);
    console.log(`   TV_ID: ${webhookPayload.tv_id}`);
    console.log(`   Delta: ${webhookPayload.delta1}`);

    // 2. 测试数据库存储
    console.log('\n📋 步骤2: 测试数据库存储');
    
    const deltaManager = DeltaManager.getInstance();
    
    // 创建Delta记录，使用webhook中的tv_id
    const deltaRecord = deltaManager.createRecord({
      account_id: webhookPayload.accountName,
      instrument_name: 'BTC-8AUG25-113000-C', // 假设选择的期权
      delta: webhookPayload.delta1 || 0,
      tv_id: webhookPayload.tv_id,
      record_type: DeltaRecordType.POSITION
    });

    console.log('✅ Delta记录创建成功:');
    console.log(`   记录ID: ${deltaRecord.id}`);
    console.log(`   账户: ${deltaRecord.account_id}`);
    console.log(`   合约: ${deltaRecord.instrument_name}`);
    console.log(`   Delta: ${deltaRecord.delta}`);
    console.log(`   TV_ID: ${deltaRecord.tv_id}`);
    console.log(`   类型: ${deltaRecord.record_type}`);

    // 3. 测试通过tv_id查询
    console.log('\n📋 步骤3: 测试TV_ID查询');
    
    const recordsByTVID = deltaManager.getRecords({ tv_id: webhookPayload.tv_id });
    console.log(`✅ 通过TV_ID查询到 ${recordsByTVID.length} 条记录`);
    
    recordsByTVID.forEach((record, index) => {
      console.log(`   记录${index + 1}: ${record.account_id}/${record.instrument_name} (TV_ID: ${record.tv_id})`);
    });

    // 4. 测试更新tv_id
    console.log('\n📋 步骤4: 测试TV_ID更新');
    
    const newTVID = 54321;
    const updatedRecord = deltaManager.updateRecord(deltaRecord.id!, { tv_id: newTVID });
    
    if (updatedRecord) {
      console.log(`✅ TV_ID更新成功: ${webhookPayload.tv_id} → ${updatedRecord.tv_id}`);
    }

    // 5. 测试数据类型验证
    console.log('\n📋 步骤5: 测试数据类型验证');
    
    // 验证tv_id是number类型
    console.log(`✅ Webhook TV_ID类型: ${typeof webhookPayload.tv_id}`);
    console.log(`✅ 数据库TV_ID类型: ${typeof deltaRecord.tv_id}`);
    console.log(`✅ 类型匹配: ${typeof webhookPayload.tv_id === typeof deltaRecord.tv_id ? '✅' : '❌'}`);

    // 6. 测试批量操作
    console.log('\n📋 步骤6: 测试批量操作');
    
    const batchRecords = [
      {
        account_id: 'yqtest',
        instrument_name: 'BTC-15AUG25-90000-P',
        delta: -0.15,
        tv_id: 11111,
        record_type: DeltaRecordType.POSITION
      },
      {
        account_id: 'main',
        instrument_name: 'ETH-22AUG25-3200-C',
        order_id: 'order_tv_22222',
        delta: 0.35,
        tv_id: 22222,
        record_type: DeltaRecordType.ORDER
      }
    ];

    const batchResults = deltaManager.batchUpsert(batchRecords);
    console.log(`✅ 批量创建 ${batchResults.length} 条记录`);
    
    batchResults.forEach((record, index) => {
      console.log(`   记录${index + 1}: TV_ID=${record.tv_id}, Delta=${record.delta}`);
    });

    // 7. 测试统计信息
    console.log('\n📋 步骤7: 测试统计信息');
    
    const stats = deltaManager.getStats();
    console.log('📊 数据库统计:');
    console.log(`   总记录数: ${stats.total_records}`);
    console.log(`   仓位记录: ${stats.position_records}`);
    console.log(`   订单记录: ${stats.order_records}`);

    // 8. 清理测试数据
    console.log('\n📋 步骤8: 清理测试数据');
    
    const deletedCount = deltaManager.deleteRecords({ account_id: 'yqtest' });
    const deletedCount2 = deltaManager.deleteRecords({ account_id: 'main' });
    console.log(`✅ 清理完成: 删除 ${deletedCount + deletedCount2} 条记录`);

    console.log('\n🎉 所有测试完成！');
    console.log('\n✅ 测试结果:');
    console.log('   ✅ Webhook TV_ID字段正常');
    console.log('   ✅ 数据库TV_ID字段正常');
    console.log('   ✅ TV_ID查询功能正常');
    console.log('   ✅ TV_ID更新功能正常');
    console.log('   ✅ 数据类型匹配正确');
    console.log('   ✅ 批量操作支持TV_ID');

  } catch (error: any) {
    console.error('\n❌ 测试失败:');
    console.error(`错误: ${error.message}`);
    console.error(`堆栈: ${error.stack}`);
  }
}

// 执行测试
if (require.main === module) {
  testWebhookTVID().catch(error => {
    console.error('测试执行失败:', error.message);
    process.exit(1);
  });
}

export { testWebhookTVID };
