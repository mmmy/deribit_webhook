// 测试调试重载功能
const axios = require('axios');

async function testDebugReload() {
  try {
    console.log('🧪 测试调试重载功能...');
    
    // 测试健康检查端点
    console.log('\n📊 测试1: 健康检查');
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log(`✅ 状态码: ${healthResponse.status}`);
    console.log(`✅ 响应: ${JSON.stringify(healthResponse.data)}`);
    
    // 测试期权列表端点
    console.log('\n📊 测试2: 期权列表');
    const optionsResponse = await axios.get('http://localhost:3000/api/options/BTC/delta/0.5');
    console.log(`✅ 状态码: ${optionsResponse.status}`);
    console.log(`✅ 消息: ${optionsResponse.data.message}`);
    
    if (optionsResponse.data.success && optionsResponse.data.data) {
      const { instrument } = optionsResponse.data.data;
      console.log(`✅ 找到期权: ${instrument.instrument_name}`);
    }
    
    console.log('\n✅ 所有测试通过!');
    console.log('\n📝 说明:');
    console.log('- 如果您修改了代码，应该能看到控制台输出的变化');
    console.log('- 检查VSCode调试控制台是否显示重启信息');
    console.log('- 确认断点是否在新代码位置正常工作');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ 连接被拒绝: 请确保调试服务器正在运行');
      console.log('\n🔧 解决方案:');
      console.log('1. 在VSCode中按F5启动调试');
      console.log('2. 选择 "Debug TypeScript (Simple Restart)" 配置');
      console.log('3. 等待服务器启动完成');
    } else {
      console.error('❌ 测试失败:', error.message);
      if (error.response) {
        console.error('❌ 响应状态:', error.response.status);
        console.error('❌ 响应数据:', error.response.data);
      }
    }
  }
}

// 执行测试
console.log('🚀 开始测试调试重载功能...');
console.log('⚠️ 确保调试服务器已在 http://localhost:3000 运行');
console.log('-------------------------------------------');

testDebugReload();
