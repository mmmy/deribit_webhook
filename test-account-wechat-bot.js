/**
 * 测试 getAccountWeChatBot 函数
 * 
 * 使用方法：
 * 1. 确保已在 config/apikeys.yml 中配置了企业微信机器人
 * 2. 运行: node test-account-wechat-bot.js
 */

require('dotenv').config();

async function testGetAccountWeChatBot() {
  try {
    // 动态导入 ES 模块
    const { ConfigLoader } = await import('./dist/services/index.js');
    
    console.log('🧪 开始测试 getAccountWeChatBot 函数...\n');

    const configLoader = ConfigLoader.getInstance();
    
    // 获取启用的账户
    const enabledAccounts = configLoader.getEnabledAccounts();
    console.log('📋 启用的账户:', enabledAccounts.map(a => a.name).join(', '));

    if (enabledAccounts.length === 0) {
      console.error('❌ 没有启用的账户');
      return;
    }

    // 测试每个账户的 getAccountWeChatBot 函数
    for (const account of enabledAccounts) {
      console.log(`\n🔍 测试账户: ${account.name}`);
      
      // 测试 getAccountWeChatBot 函数
      const wechatBot = configLoader.getAccountWeChatBot(account.name);
      
      if (!wechatBot) {
        console.log(`⚠️ 账户 ${account.name} 未配置企业微信机器人或创建失败`);
        continue;
      }

      console.log(`✅ 成功获取账户 ${account.name} 的企业微信机器人实例`);
      
      // 测试机器人实例的方法
      try {
        // 获取配置信息
        const config = wechatBot.getConfig();
        console.log(`   📱 Webhook URL: ${config.webhookUrl.substring(0, 50)}...`);
        console.log(`   ⏱️ 超时时间: ${config.timeout}ms`);
        console.log(`   🔄 重试次数: ${config.retryCount}`);
        console.log(`   ⏳ 重试延迟: ${config.retryDelay}ms`);
        
        // 测试 getInstance 方法
        const instance = wechatBot.getInstance();
        console.log(`   🆔 实例验证: ${wechatBot === instance ? '✅ 相同实例' : '❌ 不同实例'}`);
        
        // 发送测试消息
        console.log(`   📤 发送测试消息...`);
        await wechatBot.sendText(`🧪 测试消息 - 账户: ${account.name}\n⏰ 时间: ${new Date().toLocaleString('zh-CN')}\n🔧 通过 getAccountWeChatBot() 获取的实例发送`);
        console.log(`   ✅ 测试消息发送成功`);
        
        // 等待1秒避免频率限制
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`   ❌ 测试机器人实例失败:`, error.message);
      }
    }

    // 测试不存在的账户
    console.log(`\n🔍 测试不存在的账户: nonexistent_account`);
    const nonexistentBot = configLoader.getAccountWeChatBot('nonexistent_account');
    if (nonexistentBot === null) {
      console.log(`✅ 正确返回 null for 不存在的账户`);
    } else {
      console.log(`❌ 应该返回 null for 不存在的账户`);
    }

    // 测试多次调用是否返回新实例
    console.log(`\n🔍 测试多次调用实例创建:`);
    if (enabledAccounts.length > 0) {
      const accountName = enabledAccounts[0].name;
      const bot1 = configLoader.getAccountWeChatBot(accountName);
      const bot2 = configLoader.getAccountWeChatBot(accountName);
      
      if (bot1 && bot2) {
        console.log(`   📊 实例比较: ${bot1 === bot2 ? '相同实例 (缓存)' : '不同实例 (新创建)'}`);
        console.log(`   📋 配置比较: ${JSON.stringify(bot1.getConfig()) === JSON.stringify(bot2.getConfig()) ? '✅ 配置相同' : '❌ 配置不同'}`);
      }
    }

    console.log('\n🎉 getAccountWeChatBot 函数测试完成！');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

async function testFunctionIntegration() {
  try {
    console.log('\n🔧 测试函数集成...');
    
    const { ConfigLoader } = await import('./dist/services/index.js');
    const configLoader = ConfigLoader.getInstance();
    
    // 获取所有企业微信配置
    const allConfigs = configLoader.getAllWeChatBotConfigs();
    console.log(`📊 总共配置了 ${allConfigs.length} 个企业微信机器人`);
    
    // 对比 getAccountWeChatBot 和 getWeChatBotConfig + createWeChatBot
    for (const { accountName } of allConfigs) {
      console.log(`\n🔍 对比账户 ${accountName} 的两种获取方式:`);
      
      // 方式1: 使用 getAccountWeChatBot
      const bot1 = configLoader.getAccountWeChatBot(accountName);
      
      // 方式2: 使用 getWeChatBotConfig + createWeChatBot
      const config = configLoader.getWeChatBotConfig(accountName);
      let bot2 = null;
      if (config) {
        const { createWeChatBot } = await import('./dist/services/wechat-bot.js');
        bot2 = createWeChatBot(config.webhookUrl, config);
      }
      
      if (bot1 && bot2) {
        const config1 = bot1.getConfig();
        const config2 = bot2.getConfig();
        
        console.log(`   📋 配置一致性: ${JSON.stringify(config1) === JSON.stringify(config2) ? '✅ 一致' : '❌ 不一致'}`);
        console.log(`   🔧 功能一致性: ${typeof bot1.sendText === typeof bot2.sendText ? '✅ 一致' : '❌ 不一致'}`);
      } else {
        console.log(`   ❌ 其中一个方式创建失败`);
      }
    }
    
  } catch (error) {
    console.error('❌ 集成测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  (async () => {
    await testGetAccountWeChatBot();
    await testFunctionIntegration();
  })().catch(console.error);
}

module.exports = { testGetAccountWeChatBot, testFunctionIntegration };
