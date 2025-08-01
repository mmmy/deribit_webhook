/**
 * 测试getInstrument方法
 * 验证单个工具详情获取功能
 */

const axios = require('axios');

// 测试配置
const BASE_URL = 'http://localhost:3000';

// 测试用例
const testCases = [
  {
    name: 'SOL_USDC期权测试',
    instrumentName: 'SOL_USDC-25JUL25-150-C',
    expectedType: 'option',
    expectedOptionType: 'call',
    expectedStrike: 150
  },
  {
    name: 'BTC_USDC期权测试',
    instrumentName: 'BTC_USDC-01AUG25-50000-P',
    expectedType: 'option',
    expectedOptionType: 'put',
    expectedStrike: 50000
  },
  {
    name: 'BTC传统期权测试',
    instrumentName: 'BTC-25JUL25-60000-C',
    expectedType: 'option',
    expectedOptionType: 'call',
    expectedStrike: 60000
  },
  {
    name: 'ETH期权测试',
    instrumentName: 'ETH-08AUG25-3000-P',
    expectedType: 'option',
    expectedOptionType: 'put',
    expectedStrike: 3000
  }
];

/**
 * 测试单个instrument
 */
async function testGetInstrument(testCase) {
  console.log(`\n🧪 测试: ${testCase.name}`);
  console.log(`📊 Instrument: ${testCase.instrumentName}`);
  
  try {
    const response = await axios.get(`${BASE_URL}/api/instrument/${testCase.instrumentName}`, {
      timeout: 10000
    });
    
    console.log(`✅ 请求成功: ${testCase.name}`);
    console.log(`📈 HTTP状态: ${response.status}`);
    
    const data = response.data;
    if (data.success && data.instrument) {
      const instrument = data.instrument;
      
      console.log(`📋 工具详情:`);
      console.log(`   名称: ${instrument.instrument_name}`);
      console.log(`   类型: ${instrument.kind}`);
      console.log(`   期权类型: ${instrument.option_type || 'N/A'}`);
      console.log(`   行权价: ${instrument.strike || 'N/A'}`);
      console.log(`   合约大小: ${instrument.contract_size}`);
      console.log(`   Tick Size: ${instrument.tick_size}`);
      console.log(`   基础货币: ${instrument.base_currency}`);
      console.log(`   结算货币: ${instrument.settlement_currency}`);
      console.log(`   是否活跃: ${instrument.is_active}`);
      
      // 验证期望值
      let validationPassed = true;
      
      if (instrument.kind !== testCase.expectedType) {
        console.log(`❌ 类型不匹配: 期望 ${testCase.expectedType}, 实际 ${instrument.kind}`);
        validationPassed = false;
      }
      
      if (instrument.option_type !== testCase.expectedOptionType) {
        console.log(`❌ 期权类型不匹配: 期望 ${testCase.expectedOptionType}, 实际 ${instrument.option_type}`);
        validationPassed = false;
      }
      
      if (instrument.strike !== testCase.expectedStrike) {
        console.log(`❌ 行权价不匹配: 期望 ${testCase.expectedStrike}, 实际 ${instrument.strike}`);
        validationPassed = false;
      }
      
      if (validationPassed) {
        console.log(`🎯 验证通过: 所有字段符合预期`);
      }
      
      return {
        success: true,
        testCase: testCase.name,
        validationPassed,
        instrument
      };
      
    } else {
      console.log(`⚠️ 响应格式异常: ${data.message || '未知错误'}`);
      return {
        success: false,
        testCase: testCase.name,
        error: data.message || '响应格式异常'
      };
    }
    
  } catch (error) {
    console.log(`❌ 请求失败: ${testCase.name}`);
    
    if (error.response) {
      console.log(`📉 HTTP状态: ${error.response.status}`);
      console.log(`📋 错误响应:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`💥 网络错误: ${error.message}`);
    }
    
    return {
      success: false,
      testCase: testCase.name,
      error: error.message
    };
  }
}

/**
 * 检查服务器状态
 */
async function checkServer() {
  try {
    console.log('🔍 检查服务器状态...');
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    console.log(`✅ 服务器正常: ${response.data.status}`);
    return true;
  } catch (error) {
    console.log('❌ 服务器连接失败');
    if (error.code === 'ECONNREFUSED') {
      console.log('🔌 连接被拒绝 - 服务器未启动');
    } else {
      console.log(`💥 错误: ${error.message}`);
    }
    return false;
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🚀 getInstrument方法测试');
  console.log(`🌐 目标服务器: ${BASE_URL}`);
  console.log('');
  
  // 1. 检查服务器
  const serverOk = await checkServer();
  if (!serverOk) {
    console.log('\n❌ 服务器不可用，测试终止');
    console.log('💡 请先启动服务器: npm start 或 npm run dev');
    process.exit(1);
  }
  
  console.log('');
  
  // 2. 执行所有测试用例
  const results = [];
  
  for (const testCase of testCases) {
    const result = await testGetInstrument(testCase);
    results.push(result);
    
    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 3. 汇总结果
  console.log('\n📊 测试结果汇总:');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const validationPassedCount = results.filter(r => r.success && r.validationPassed).length;
  const totalCount = results.length;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    const validation = result.validationPassed ? '🎯' : '⚠️';
    console.log(`${status} ${validation} ${index + 1}. ${result.testCase}`);
    
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    } else if (result.success && !result.validationPassed) {
      console.log(`   验证失败: 字段值不符合预期`);
    }
  });
  
  console.log('='.repeat(60));
  console.log(`📈 请求成功: ${successCount}/${totalCount} (${(successCount/totalCount*100).toFixed(1)}%)`);
  console.log(`🎯 验证通过: ${validationPassedCount}/${totalCount} (${(validationPassedCount/totalCount*100).toFixed(1)}%)`);
  
  if (successCount === totalCount && validationPassedCount === totalCount) {
    console.log('🎉 所有测试通过！getInstrument方法工作正常。');
  } else if (successCount === totalCount) {
    console.log('✅ 所有请求成功，但部分验证失败。');
  } else {
    console.log('⚠️ 部分测试失败，请检查日志。');
  }
  
  console.log('\n💡 提示:');
  console.log('- 测试使用Mock模式，返回模拟数据');
  console.log('- 实际使用时会调用真实的Deribit API');
  console.log('- 可以通过 /api/instrument/{instrumentName} 端点获取工具详情');
}

// 运行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('\n💥 测试执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  testGetInstrument,
  testCases
};
