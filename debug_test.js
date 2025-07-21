const http = require('http');

async function testDebugBreakpoints() {
  console.log('🔍 测试调试断点...');
  console.log('在以下位置设置断点：');
  console.log('1. src/index.ts:173 - console.log(`📡 [${requestId}] Received webhook signal:`, req.body);');
  console.log('2. src/services/option-trading.ts:35 - console.log(`✅ Mock mode - skipping authentication`);');
  console.log('3. src/services/option-trading.ts:40 - console.log(\'📊 Parsed trading parameters:\', tradingParams);');
  console.log('');
  
  console.log('等待5秒后发送测试请求...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const payload = {
    "accountName": "account_1",
    "side": "buy",
    "symbol": "BTCUSDT",
    "size": "1",
    "marketPosition": "long",
    "prevMarketPosition": "flat",
    "price": "50000"
  };
  
  return new Promise((resolve) => {
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/webhook/signal',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log('📤 发送调试测试请求...');
    console.log('如果断点设置正确，执行应该在断点处暂停。');
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`\\n📡 响应状态: ${res.statusCode}`);
        try {
          const response = JSON.parse(data);
          console.log('✅ 调试测试完成!');
          console.log('响应:', JSON.stringify(response, null, 2));
        } catch (e) {
          console.log('响应:', data);
        }
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log('❌ 连接错误:', err.message);
      console.log('确保调试器已启动服务器 (F5)');
      resolve();
    });
    
    req.write(postData);
    req.end();
  });
}

if (require.main === module) {
  testDebugBreakpoints();
}