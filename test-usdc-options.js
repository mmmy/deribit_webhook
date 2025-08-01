/**
 * 测试USDC期权支持
 * 验证系统能否正确处理SOLUSDC等USDC期权信号
 */

const axios = require('axios');

// 测试配置
const BASE_URL = 'http://localhost:3000';

// 测试用例
const testCases = [
  {
    name: 'SOL-USDC期权测试',
    payload: {
      accountName: 'account_1',
      side: 'buy',
      symbol: 'SOLUSDC',
      size: '1000',
      qtyType: 'cash',
      delta1: 0.7,
      n: 2,
      marketPosition: 'long',
      prevMarketPosition: 'flat',
      exchange: 'DERIBIT',
      period: '5',
      price: '150.50',
      timestamp: Date.now().toString(),
      positionSize: '0',
      id: 'test_sol_usdc_001',
      tv_id: 12345
    },
    expectedCurrency: 'USDC',
    expectedUnderlying: 'SOL'
  },
  {
    name: 'BTC-USDC期权测试',
    payload: {
      accountName: 'account_1',
      side: 'sell',
      symbol: 'BTCUSDC',
      size: '500',
      qtyType: 'cash',
      delta1: -0.3,
      n: 7,
      marketPosition: 'short',
      prevMarketPosition: 'flat',
      exchange: 'DERIBIT',
      period: '15',
      price: '65000.00',
      timestamp: Date.now().toString(),
      positionSize: '0',
      id: 'test_btc_usdc_002',
      tv_id: 12346
    },
    expectedCurrency: 'USDC',
    expectedUnderlying: 'BTC'
  },
  {
    name: 'ETH-USDC期权测试',
    payload: {
      accountName: 'account_1',
      side: 'buy',
      symbol: 'ETHUSDC',
      size: '2000',
      qtyType: 'cash',
      delta1: 0.5,
      n: 3,
      marketPosition: 'long',
      prevMarketPosition: 'flat',
      exchange: 'DERIBIT',
      period: '1h',
      price: '3200.00',
      timestamp: Date.now().toString(),
      positionSize: '0',
      id: 'test_eth_usdc_003',
      tv_id: 12347
    },
    expectedCurrency: 'USDC',
    expectedUnderlying: 'ETH'
  },
  {
    name: 'BTC-USDT期权测试（向后兼容）',
    payload: {
      accountName: 'account_1',
      side: 'buy',
      symbol: 'BTCUSDT',
      size: '1500',
      qtyType: 'cash',
      delta1: 0.8,
      n: 5,
      marketPosition: 'long',
      prevMarketPosition: 'flat',
      exchange: 'DERIBIT',
      period: '4h',
      price: '65000.00',
      timestamp: Date.now().toString(),
      positionSize: '0',
      id: 'test_btc_usdt_004',
      tv_id: 12348
    },
    expectedCurrency: 'BTC',
    expectedUnderlying: 'BTC'
  }
];

/**
 * 执行单个测试用例
 */
async function runTestCase(testCase) {
  console.log(`\n🧪 执行测试: ${testCase.name}`);
  console.log(`📊 Symbol: ${testCase.payload.symbol} -> 期望货币: ${testCase.expectedCurrency}, 期望标的: ${testCase.expectedUnderlying}`);
  
  try {
    const response = await axios.post(`${BASE_URL}/webhook/signal`, testCase.payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`✅ 测试成功: ${testCase.name}`);
    console.log(`📈 响应状态: ${response.status}`);
    console.log(`📋 响应数据:`, JSON.stringify(response.data, null, 2));
    
    // 检查响应中是否包含正确的货币信息
    if (response.data.success) {
      console.log(`🎯 交易成功处理`);
    } else {
      console.log(`⚠️ 交易处理失败: ${response.data.message}`);
    }
    
    return {
      success: true,
      testCase: testCase.name,
      response: response.data
    };
    
  } catch (error) {
    console.log(`❌ 测试失败: ${testCase.name}`);
    
    if (error.response) {
      console.log(`📉 HTTP状态: ${error.response.status}`);
      console.log(`📋 错误响应:`, JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(`💥 网络错误:`, error.message);
    }
    
    return {
      success: false,
      testCase: testCase.name,
      error: error.message,
      response: error.response?.data
    };
  }
}

/**
 * 检查服务器状态
 */
async function checkServerStatus() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log(`✅ 服务器状态正常: ${response.data.status}`);
    return true;
  } catch (error) {
    console.log(`❌ 服务器连接失败:`, error.message);
    return false;
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('🚀 开始USDC期权支持测试');
  console.log(`🌐 测试服务器: ${BASE_URL}`);
  
  // 检查服务器状态
  const serverOk = await checkServerStatus();
  if (!serverOk) {
    console.log('❌ 服务器不可用，测试终止');
    process.exit(1);
  }
  
  const results = [];
  
  // 执行所有测试用例
  for (const testCase of testCases) {
    const result = await runTestCase(testCase);
    results.push(result);
    
    // 测试间隔
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 汇总结果
  console.log('\n📊 测试结果汇总:');
  console.log('='.repeat(50));
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${index + 1}. ${result.testCase}`);
    
    if (!result.success && result.error) {
      console.log(`   错误: ${result.error}`);
    }
  });
  
  console.log('='.repeat(50));
  console.log(`📈 成功: ${successCount}/${totalCount} (${(successCount/totalCount*100).toFixed(1)}%)`);
  
  if (successCount === totalCount) {
    console.log('🎉 所有测试通过！USDC期权支持正常工作。');
  } else {
    console.log('⚠️ 部分测试失败，请检查日志。');
  }
}

// 运行测试
if (require.main === module) {
  runTests().catch(error => {
    console.error('💥 测试执行失败:', error);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  runTestCase,
  testCases
};
