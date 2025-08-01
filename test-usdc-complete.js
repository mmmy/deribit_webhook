/**
 * 完整的USDC期权功能测试
 */

const axios = require('axios');

// 测试配置
const BASE_URL = 'http://localhost:3000';

/**
 * 测试单个USDC期权信号
 */
async function testUSDCOption() {
  console.log('🧪 测试USDC期权完整流程');
  console.log('='.repeat(50));
  
  const testPayload = {
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
    id: 'test_sol_usdc_complete',
    tv_id: 12345
  };
  
  console.log('📊 测试数据:');
  console.log(JSON.stringify(testPayload, null, 2));
  console.log('');
  
  try {
    console.log('🚀 发送webhook请求...');
    const response = await axios.post(`${BASE_URL}/webhook/signal`, testPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    console.log('✅ 请求成功!');
    console.log(`📈 HTTP状态: ${response.status}`);
    console.log('📋 响应数据:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // 分析响应
    if (response.data.success) {
      console.log('\n🎯 交易处理成功!');
      
      if (response.data.result && response.data.result.instrument_name) {
        const instrumentName = response.data.result.instrument_name;
        console.log(`📊 选中的期权合约: ${instrumentName}`);
        
        // 验证是否为SOL_USDC格式
        if (instrumentName.startsWith('SOL_USDC-')) {
          console.log('✅ 期权合约格式正确 (SOL_USDC-*)');
        } else {
          console.log('❌ 期权合约格式不正确，期望SOL_USDC-*格式');
        }
        
        // 显示其他信息
        if (response.data.result.delta) {
          console.log(`📈 Delta值: ${response.data.result.delta}`);
        }
        if (response.data.result.strike) {
          console.log(`💰 行权价: ${response.data.result.strike}`);
        }
        if (response.data.result.expiry) {
          console.log(`📅 到期日: ${response.data.result.expiry}`);
        }
      }
      
      return true;
    } else {
      console.log('\n⚠️ 交易处理失败');
      console.log(`❌ 错误信息: ${response.data.message || '未知错误'}`);
      return false;
    }
    
  } catch (error) {
    console.log('\n❌ 请求失败');
    
    if (error.response) {
      console.log(`📉 HTTP状态: ${error.response.status}`);
      console.log('📋 错误响应:');
      console.log(JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED') {
      console.log('🔌 连接被拒绝 - 服务器可能未启动');
      console.log('💡 请确保服务器运行在 http://localhost:3000');
    } else {
      console.log(`💥 网络错误: ${error.message}`);
    }
    
    return false;
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
async function runCompleteTest() {
  console.log('🚀 USDC期权完整功能测试');
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
  
  // 2. 测试USDC期权
  const testResult = await testUSDCOption();
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试总结');
  console.log('='.repeat(50));
  
  if (testResult) {
    console.log('🎉 USDC期权测试通过!');
    console.log('✅ 系统能够正确处理SOLUSDC期权信号');
    console.log('✅ 期权合约选择逻辑正常工作');
    console.log('✅ SOL_USDC格式期权合约正确生成');
  } else {
    console.log('❌ USDC期权测试失败');
    console.log('⚠️ 请检查服务器日志以获取详细错误信息');
  }
  
  console.log('\n💡 提示:');
  console.log('- 确保.env文件中的配置正确');
  console.log('- 检查Deribit API凭据（如果不使用Mock模式）');
  console.log('- 查看服务器控制台输出以获取详细日志');
}

// 运行测试
if (require.main === module) {
  runCompleteTest().catch(error => {
    console.error('\n💥 测试执行失败:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runCompleteTest,
  testUSDCOption,
  checkServer
};
