const http = require('http');

// 测试用的webhook payload
const testPayloads = [
  {
    name: "BTC买入开仓",
    payload: {
      "accountName": "account_1",
      "side": "buy",
      "exchange": "BINANCE",
      "period": "5",
      "marketPosition": "long",
      "prevMarketPosition": "flat",
      "symbol": "BTCUSDT",
      "price": "43250.50",
      "timestamp": "1642678920000",
      "size": "1",
      "positionSize": "1",
      "id": "test_order_buy_123",
      "alertMessage": "BTC Long Signal",
      "comment": "Strategy triggered buy signal",
      "qtyType": "fixed"
    }
  },
  {
    name: "BTC卖出平仓",
    payload: {
      "accountName": "account_1", 
      "side": "sell",
      "exchange": "BINANCE",
      "period": "5",
      "marketPosition": "flat",
      "prevMarketPosition": "long",
      "symbol": "BTCUSDT",
      "price": "44150.75",
      "timestamp": "1642679920000",
      "size": "1",
      "positionSize": "0",
      "id": "test_order_sell_456",
      "alertMessage": "BTC Close Long Signal",
      "comment": "Strategy triggered sell signal",
      "qtyType": "fixed"
    }
  },
  {
    name: "ETH买入开仓",
    payload: {
      "accountName": "account_1",
      "side": "buy", 
      "exchange": "BINANCE",
      "period": "5",
      "marketPosition": "long",
      "prevMarketPosition": "flat",
      "symbol": "ETHUSDT",
      "price": "2850.25",
      "timestamp": "1642680920000",
      "size": "2",
      "positionSize": "2",
      "id": "test_order_eth_789",
      "alertMessage": "ETH Long Signal",
      "comment": "ETH breakout signal",
      "qtyType": "fixed"
    }
  }
];

async function sendWebhookRequest(testCase) {
  return new Promise((resolve) => {
    console.log(`\n🧪 测试案例: ${testCase.name}`);
    console.log('=' .repeat(50));
    
    const postData = JSON.stringify(testCase.payload);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/webhook/signal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'VSCode-Debug-Test/1.0'
      }
    };

    console.log('📤 发送请求:');
    console.log('URL:', `http://${options.hostname}:${options.port}${options.path}`);
    console.log('Payload:', JSON.stringify(testCase.payload, null, 2));

    const req = http.request(options, (res) => {
      let data = '';
      
      console.log(`\n📡 响应状态: ${res.statusCode}`);
      console.log('响应头:', JSON.stringify(res.headers, null, 2));
      
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('\n📋 响应内容:');
        try {
          const response = JSON.parse(data);
          console.log(JSON.stringify(response, null, 2));
          
          if (response.success) {
            console.log('\n✅ 测试成功!');
            if (response.data) {
              console.log(`   订单ID: ${response.data.orderId}`);
              console.log(`   期权合约: ${response.data.instrumentName}`);
              console.log(`   执行数量: ${response.data.executedQuantity}`);
              console.log(`   执行价格: ${response.data.executedPrice}`);
            }
          } else {
            console.log('\n❌ 测试失败!');
            console.log(`   错误: ${response.error || response.message}`);
          }
        } catch (e) {
          console.log('📄 原始响应 (非JSON):');
          console.log(data);
        }
        
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log('❌ 请求错误:', err.message);
      console.log('提示: 确保服务器在端口3000上运行');
      resolve();
    });

    req.setTimeout(10000, () => {
      console.log('❌ 请求超时 (10秒)');
      req.destroy();
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

async function testServerStatus() {
  return new Promise((resolve) => {
    console.log('🔍 检查服务器状态...');
    
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ 服务器运行正常');
          const health = JSON.parse(data);
          console.log(`   状态: ${health.status}`);
          console.log(`   时间: ${health.timestamp}`);
        } else {
          console.log('❌ 服务器状态异常:', res.statusCode);
        }
        resolve(res.statusCode === 200);
      });
    });
    
    req.on('error', () => {
      console.log('❌ 无法连接到服务器 (localhost:3000)');
      console.log('💡 请先启动服务器: npm run dev 或 F5调试启动');
      resolve(false);
    });
    
    req.setTimeout(3000, () => {
      console.log('❌ 服务器连接超时');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function runDebugTests() {
  console.log('🚀 VSCode Debug - Webhook测试工具');
  console.log('=' .repeat(60));
  
  // 1. 检查服务器状态
  const serverOk = await testServerStatus();
  if (!serverOk) {
    console.log('\n💡 调试提示:');
    console.log('1. 按F5启动调试服务器');
    console.log('2. 或在终端运行: npm run dev');
    console.log('3. 确保端口3000没有被占用');
    return;
  }
  
  // 2. 运行测试案例
  console.log('\n🧪 开始Webhook测试...');
  for (const testCase of testPayloads) {
    await sendWebhookRequest(testCase);
    
    // 在测试之间添加延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🎉 所有测试完成!');
  console.log('\n💡 调试技巧:');
  console.log('- 在 src/services/option-trading.ts 中设置断点');
  console.log('- 在 src/index.ts 的 /webhook/signal 路由中设置断点');
  console.log('- 使用调试控制台查看变量值');
  console.log('- 检查调用堆栈了解执行流程');
}

// 如果直接运行此脚本
if (require.main === module) {
  runDebugTests().catch(console.error);
}

module.exports = { runDebugTests, testPayloads, sendWebhookRequest };