/**
 * 企业微信机器人实例获取示例
 * 
 * 展示如何使用新增的 getInstance() 和 getConfig() 公共方法
 */

import { createWeChatBot, WeChatBot } from '../src/services/wechat-bot';

async function instanceExample() {
  console.log('🤖 企业微信机器人实例示例\n');

  // 创建机器人实例
  const webhookUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=5cf3342a-57a2-4d19-872e-50984fd50ad7';
  const bot = createWeChatBot(webhookUrl, {
    timeout: 15000,
    retryCount: 5,
    retryDelay: 2000
  });

  console.log('✅ 机器人实例创建成功');

  // 使用 getConfig() 方法获取配置信息
  const config = bot.getConfig();
  console.log('\n📋 机器人配置信息:');
  console.log(`   📱 Webhook URL: ${config.webhookUrl.substring(0, 50)}...`);
  console.log(`   ⏱️ 超时时间: ${config.timeout}ms`);
  console.log(`   🔄 重试次数: ${config.retryCount}`);
  console.log(`   ⏳ 重试延迟: ${config.retryDelay}ms`);

  // 使用 getInstance() 方法获取实例本身
  const instance = bot.getInstance();
  console.log('\n🔍 实例信息:');
  console.log(`   📝 实例类型: ${instance.constructor.name}`);
  console.log(`   🆔 实例相等性: ${bot === instance ? '✅ 相同实例' : '❌ 不同实例'}`);

  // 验证实例功能
  try {
    console.log('\n📤 测试发送消息...');
    await instance.sendText('🧪 这是通过 getInstance() 获取的实例发送的测试消息');
    console.log('✅ 消息发送成功');
  } catch (error: any) {
    console.error('❌ 消息发送失败:', error.message);
  }

  // 展示如何在函数间传递实例
  await useInstanceInFunction(bot.getInstance());
}

/**
 * 在其他函数中使用机器人实例
 * @param botInstance 机器人实例
 */
async function useInstanceInFunction(botInstance: WeChatBot) {
  console.log('\n🔧 在其他函数中使用实例:');
  
  const config = botInstance.getConfig();
  console.log(`   📱 从传入实例获取的配置: ${config.webhookUrl.substring(0, 30)}...`);
  
  try {
    await botInstance.sendText('📨 这是在其他函数中通过传入的实例发送的消息');
    console.log('✅ 在其他函数中发送消息成功');
  } catch (error: any) {
    console.error('❌ 在其他函数中发送消息失败:', error.message);
  }
}

/**
 * 展示实例管理的最佳实践
 */
async function instanceManagementExample() {
  console.log('\n🏗️ 实例管理最佳实践示例:');

  const webhookUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=5cf3342a-57a2-4d19-872e-50984fd50ad7';
  
  // 创建多个配置不同的实例
  const instances = [
    {
      name: '快速实例',
      bot: createWeChatBot(webhookUrl, { timeout: 5000, retryCount: 1 })
    },
    {
      name: '标准实例', 
      bot: createWeChatBot(webhookUrl, { timeout: 10000, retryCount: 3 })
    },
    {
      name: '稳定实例',
      bot: createWeChatBot(webhookUrl, { timeout: 20000, retryCount: 5 })
    }
  ];

  // 展示每个实例的配置
  instances.forEach(({ name, bot }) => {
    const config = bot.getConfig();
    console.log(`\n   ${name}:`);
    console.log(`     ⏱️ 超时: ${config.timeout}ms`);
    console.log(`     🔄 重试: ${config.retryCount}次`);
    console.log(`     🆔 实例: ${bot.getInstance() === bot ? '✅' : '❌'}`);
  });

  // 模拟根据不同场景选择不同实例
  const scenarios = [
    { name: '紧急通知', instanceIndex: 0 },
    { name: '常规消息', instanceIndex: 1 },
    { name: '重要报告', instanceIndex: 2 }
  ];

  for (const scenario of scenarios) {
    const { name, instanceIndex } = scenario;
    const { bot } = instances[instanceIndex];
    
    console.log(`\n📋 场景: ${name}`);
    try {
      await bot.getInstance().sendText(`📢 ${name}: 这是一条${name}消息`);
      console.log(`   ✅ ${name}发送成功`);
    } catch (error: any) {
      console.error(`   ❌ ${name}发送失败:`, error.message);
    }
    
    // 添加延迟避免频率限制
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// 主函数
async function main() {
  console.log('🚀 企业微信机器人实例管理示例\n');

  try {
    await instanceExample();
    await instanceManagementExample();
    
    console.log('\n🎉 所有示例运行完成！');
  } catch (error) {
    console.error('❌ 示例运行失败:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

export {
  instanceExample,
  useInstanceInFunction,
  instanceManagementExample
};
