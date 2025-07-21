// 测试期权列表获取功能
const axios = require('axios');

// 配置
const API_BASE_URL = 'http://localhost:3000';

// 测试函数
async function testGetOptionsList() {
  try {
    console.log('🧪 测试获取期权列表功能...');
    
    // 测试1: 获取BTC看涨期权
    console.log('\n📊 测试1: 获取BTC看涨期权');
    const longResponse = await axios.get(`${API_BASE_URL}/api/options/BTC/long`);
    console.log(`✅ 状态码: ${longResponse.status}`);
    console.log(`✅ 消息: ${longResponse.data.message}`);
    console.log(`✅ 获取到 ${longResponse.data.data?.instruments?.length || 0} 个期权合约`);
    
    if (longResponse.data.data?.instruments?.length > 0) {
      console.log('📋 前3个期权合约:');
      longResponse.data.data.instruments.slice(0, 3).forEach((instrument, index) => {
        console.log(`  ${index + 1}. ${instrument.instrument_name} (行权价: ${instrument.strike}, 到期: ${new Date(instrument.expiration_timestamp).toLocaleDateString()})`);
      });
    }
    
    // 测试2: 获取BTC看跌期权
    console.log('\n📊 测试2: 获取BTC看跌期权');
    const shortResponse = await axios.get(`${API_BASE_URL}/api/options/BTC/short`);
    console.log(`✅ 状态码: ${shortResponse.status}`);
    console.log(`✅ 消息: ${shortResponse.data.message}`);
    console.log(`✅ 获取到 ${shortResponse.data.data?.instruments?.length || 0} 个期权合约`);
    
    if (shortResponse.data.data?.instruments?.length > 0) {
      console.log('📋 前3个期权合约:');
      shortResponse.data.data.instruments.slice(0, 3).forEach((instrument, index) => {
        console.log(`  ${index + 1}. ${instrument.instrument_name} (行权价: ${instrument.strike}, 到期: ${new Date(instrument.expiration_timestamp).toLocaleDateString()})`);
      });
    }
    
    // 测试3: 获取ETH看涨期权
    console.log('\n📊 测试3: 获取ETH看涨期权');
    const ethResponse = await axios.get(`${API_BASE_URL}/api/options/ETH/long`);
    console.log(`✅ 状态码: ${ethResponse.status}`);
    console.log(`✅ 消息: ${ethResponse.data.message}`);
    console.log(`✅ 获取到 ${ethResponse.data.data?.instruments?.length || 0} 个期权合约`);
    
    // 测试4: 带过滤条件的查询
    console.log('\n📊 测试4: 带过滤条件的查询 (BTC看涨期权，行权价>55000)');
    const filteredResponse = await axios.get(`${API_BASE_URL}/api/options/BTC/long?minStrike=55000`);
    console.log(`✅ 状态码: ${filteredResponse.status}`);
    console.log(`✅ 消息: ${filteredResponse.data.message}`);
    console.log(`✅ 获取到 ${filteredResponse.data.data?.instruments?.length || 0} 个期权合约`);
    
    if (filteredResponse.data.data?.instruments?.length > 0) {
      console.log('📋 前3个期权合约:');
      filteredResponse.data.data.instruments.slice(0, 3).forEach((instrument, index) => {
        console.log(`  ${index + 1}. ${instrument.instrument_name} (行权价: ${instrument.strike}, 到期: ${new Date(instrument.expiration_timestamp).toLocaleDateString()})`);
      });
    }
    
    console.log('\n✅ 所有测试完成!');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('❌ 响应状态:', error.response.status);
      console.error('❌ 响应数据:', error.response.data);
    }
  }
}

// 执行测试
console.log('🚀 开始测试期权列表获取功能...');
console.log('⚠️ 确保服务器已在 http://localhost:3000 运行');
console.log('-------------------------------------------');

testGetOptionsList();
