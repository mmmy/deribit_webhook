/**
 * 测试完整的 Delta 调整通知流程
 * 包括开始、成功和失败通知
 * 
 * 使用方法：
 * 1. 确保已在 config/apikeys.yml 中配置了企业微信机器人
 * 2. 运行: node test-delta-complete-notifications.js
 */

require('dotenv').config();

async function testCompleteNotificationFlow() {
  try {
    // 动态导入 ES 模块
    const { ConfigLoader } = await import('./dist/services/index.js');
    
    console.log('🧪 开始测试完整的 Delta 调整通知流程...\n');

    const configLoader = ConfigLoader.getInstance();
    
    // 获取启用的账户
    const enabledAccounts = configLoader.getEnabledAccounts();
    console.log('📋 启用的账户:', enabledAccounts.map(a => a.name).join(', '));

    if (enabledAccounts.length === 0) {
      console.error('❌ 没有启用的账户');
      return;
    }

    // 测试每个账户的完整通知流程
    for (const account of enabledAccounts) {
      console.log(`\n🔍 测试账户: ${account.name}`);
      
      const wechatBot = configLoader.getAccountWeChatBot(account.name);
      
      if (!wechatBot) {
        console.log(`⚠️ 账户 ${account.name} 未配置企业微信机器人`);
        continue;
      }

      console.log(`✅ 账户 ${account.name} 已配置企业微信机器人`);
      
      try {
        // 模拟数据
        const mockData = {
          requestId: 'TEST-COMPLETE-' + Date.now(),
          accountName: account.name,
          instrument: 'BTC-29MAR24-70000-C',
          positionSize: 0.5,
          positionDelta: 0.2345,
          targetDelta: 0.1,
          movePositionDelta: 0.15,
          recordId: 'mock-record-' + Date.now(),
          recordCreatedAt: new Date().toISOString()
        };

        // 1. 发送开始通知
        console.log(`   📤 发送开始通知...`);
        const startContent = `🔄 **Delta 仓位调整开始 (测试)**

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

        await wechatBot.sendMarkdown(startContent);
        console.log(`   ✅ 开始通知发送成功`);
        
        // 等待2秒
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 2. 发送成功通知
        console.log(`   📤 发送成功通知...`);
        const successContent = `✅ **Delta 仓位调整成功 (测试)**

👤 **账户**: ${mockData.accountName}
📊 **调整详情**: ${mockData.instrument} → BTC-29MAR24-65000-C
📈 **仓位变化**: ${mockData.positionSize} → SELL 0.3
🎯 **目标Delta**: ${mockData.targetDelta}
🔄 **请求ID**: ${mockData.requestId}
⏰ **完成时间**: ${new Date().toLocaleString('zh-CN')}

🎉 **调整已成功完成！**

🧪 **这是一条测试消息**`;

        await wechatBot.sendMarkdown(successContent);
        console.log(`   ✅ 成功通知发送成功`);
        
        // 等待2秒
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. 发送失败通知
        console.log(`   📤 发送失败通知...`);
        const errorContent = `❌ **Delta 仓位调整失败 (测试)**

👤 **账户**: ${mockData.accountName}
🎯 **工具**: ${mockData.instrument}
📈 **仓位大小**: ${mockData.positionSize}
🔢 **仓位Delta**: ${mockData.positionDelta.toFixed(4)}
🎯 **目标Delta**: ${mockData.targetDelta}
🆔 **记录ID**: ${mockData.recordId}
🔄 **请求ID**: ${mockData.requestId}

💬 **失败原因**: 测试模拟的失败场景
📋 **错误详情**: \`\`\`
Error: Simulated adjustment failure for testing
    at testFunction (test.js:123:45)
    at main (test.js:67:89)
\`\`\`

⏰ **失败时间**: ${new Date().toLocaleString('zh-CN')}

⚠️ **请检查系统状态并手动处理**

🧪 **这是一条测试消息**`;

        await wechatBot.sendMarkdown(errorContent);
        console.log(`   ✅ 失败通知发送成功`);
        
        console.log(`✅ 账户 ${account.name} 完整通知流程测试成功`);
        
        // 等待3秒避免频率限制
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.error(`❌ 账户 ${account.name} 通知流程测试失败:`, error.message);
      }
    }

    console.log('\n🎉 完整的 Delta 调整通知流程测试完成！');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

async function testNotificationContent() {
  try {
    console.log('\n🔧 测试通知内容格式...');
    
    const { ConfigLoader } = await import('./dist/services/index.js');
    const configLoader = ConfigLoader.getInstance();
    
    const enabledAccounts = configLoader.getEnabledAccounts();
    if (enabledAccounts.length === 0) {
      console.log('⚠️ 没有启用的账户，跳过内容测试');
      return;
    }

    const account = enabledAccounts[0];
    const wechatBot = configLoader.getAccountWeChatBot(account.name);
    
    if (!wechatBot) {
      console.log('⚠️ 第一个账户未配置企业微信机器人，跳过内容测试');
      return;
    }

    // 测试不同类型的通知内容
    const testCases = [
      {
        name: '长工具名称',
        instrument: 'BTC-29MAR24-70000-C-VERY-LONG-NAME-TEST',
        size: 1.23456789
      },
      {
        name: '负数Delta',
        instrument: 'ETH-29MAR24-3000-P',
        size: -0.5,
        delta: -0.1234
      },
      {
        name: '零Delta',
        instrument: 'SOL-29MAR24-100-C',
        size: 0,
        delta: 0
      }
    ];

    for (const testCase of testCases) {
      console.log(`\n📋 测试场景: ${testCase.name}`);
      
      const testContent = `🧪 **通知内容测试 - ${testCase.name}**

👤 **账户**: ${account.name}
🎯 **工具**: ${testCase.instrument}
📈 **仓位大小**: ${testCase.size}
🔢 **仓位Delta**: ${testCase.delta?.toFixed(4) || 'N/A'}
⏰ **测试时间**: ${new Date().toLocaleString('zh-CN')}

📝 **测试目的**: 验证${testCase.name}的显示效果`;

      await wechatBot.sendMarkdown(testContent);
      console.log(`   ✅ ${testCase.name} 测试发送成功`);
      
      // 等待1秒
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error('❌ 内容测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  (async () => {
    await testCompleteNotificationFlow();
    await testNotificationContent();
  })().catch(console.error);
}

module.exports = { testCompleteNotificationFlow, testNotificationContent };
