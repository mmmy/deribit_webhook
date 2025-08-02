/**
 * 测试 Delta 调整通知功能
 * 
 * 使用方法：
 * 1. 确保已在 config/apikeys.yml 中配置了企业微信机器人
 * 2. 运行: node test-delta-notification.js
 */

require('dotenv').config();

async function testDeltaNotification() {
  try {
    // 动态导入 ES 模块
    const { ConfigLoader, createWeChatBot } = await import('./dist/services/index.js');
    
    console.log('🧪 开始测试 Delta 调整通知功能...\n');

    const configLoader = ConfigLoader.getInstance();
    
    // 获取启用的账户
    const enabledAccounts = configLoader.getEnabledAccounts();
    console.log('📋 启用的账户:', enabledAccounts.map(a => a.name).join(', '));

    if (enabledAccounts.length === 0) {
      console.error('❌ 没有启用的账户');
      return;
    }

    // 测试每个账户的企业微信机器人配置
    for (const account of enabledAccounts) {
      console.log(`\n🔍 测试账户: ${account.name}`);
      
      const wechatConfig = configLoader.getWeChatBotConfig(account.name);
      
      if (!wechatConfig) {
        console.log(`⚠️ 账户 ${account.name} 未配置企业微信机器人`);
        continue;
      }

      console.log(`✅ 账户 ${account.name} 已配置企业微信机器人`);
      console.log(`   📱 Webhook URL: ${wechatConfig.webhookUrl.substring(0, 50)}...`);
      
      try {
        const bot = createWeChatBot(wechatConfig.webhookUrl, wechatConfig);
        
        // 模拟 Delta 调整开始通知
        const mockData = {
          requestId: 'TEST-' + Date.now(),
          accountName: account.name,
          instrument: 'BTC-29MAR24-70000-C',
          positionSize: 0.5,
          positionDelta: 0.2345,
          targetDelta: 0.1,
          movePositionDelta: 0.15,
          recordId: 'mock-record-123',
          recordCreatedAt: new Date().toISOString()
        };

        const notificationContent = `🔄 **Delta 仓位调整开始 (测试)**

👤 **账户**: ${mockData.accountName}
🎯 **工具**: ${mockData.instrument}
📈 **仓位大小**: ${mockData.positionSize}
🔢 **仓位Delta**: ${mockData.positionDelta.toFixed(4)}
📐 **单位Delta**: ${mockData.positionDelta.toFixed(4)}
🎯 **目标Delta**: ${mockData.targetDelta}
📊 **移动仓位Delta**: ${mockData.movePositionDelta}
⚖️ **触发条件**: |${mockData.movePositionDelta}| < |${mockData.positionDelta.toFixed(4)}| = ${Math.abs(mockData.movePositionDelta) < Math.abs(mockData.positionDelta) ? 'TRUE' : 'FALSE'}
📅 **记录创建时间**: ${new Date(mockData.recordCreatedAt).toLocaleString('zh-CN')}
🆔 **记录ID**: ${mockData.recordId}
🔄 **请求ID**: ${mockData.requestId}

⏰ **开始时间**: ${new Date().toLocaleString('zh-CN')}

🧪 **这是一条测试消息**`;

        await bot.sendMarkdown(notificationContent);
        console.log(`✅ 测试通知发送成功 - 账户: ${account.name}`);
        
        // 等待1秒避免频率限制
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ 测试通知发送失败 - 账户: ${account.name}:`, error.message);
      }
    }

    console.log('\n🎉 Delta 调整通知功能测试完成！');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 运行测试
if (require.main === module) {
  testDeltaNotification().catch(console.error);
}

module.exports = { testDeltaNotification };
