/**
 * 企业微信机器人使用示例
 *
 * 使用前请确保已在 config/apikeys.yml 中配置企业微信机器人：
 *
 * accounts:
 *   - name: account_1
 *     # ... 其他配置
 *     wechat_bot:
 *       webhook_url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
 *       timeout: 10000
 *       retry_count: 3
 *       retry_delay: 1000
 *       enabled: true
 */

import {
  WeChatBot,
  createWeChatBot,
  wechatNotification
} from '../src/services';

async function basicUsageExample() {
  console.log('=== 基础使用示例 ===');
  
  // 方式1: 直接创建机器人实例
  const webhookUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=5cf3342a-57a2-4d19-872e-50984fd50ad7';
  const bot = createWeChatBot(webhookUrl, {
    timeout: 10000,
    retryCount: 3,
    retryDelay: 1000
  });

  try {
    // 发送文本消息
    await bot.sendText('Hello, 这是一条测试消息！');
    console.log('✅ 文本消息发送成功');

    // 发送带@的文本消息
    await bot.sendText('紧急通知：系统维护中', ['@all']);
    console.log('✅ @所有人消息发送成功');

    // 发送Markdown消息
    const markdownContent = `## 📊 系统状态报告

**服务状态**: 🟢 正常运行
**CPU使用率**: 45%
**内存使用率**: 62%
**磁盘使用率**: 78%

> 最后更新时间: ${new Date().toLocaleString('zh-CN')}`;

    await bot.sendMarkdown(markdownContent);
    console.log('✅ Markdown消息发送成功');

    // 发送图文消息
    await bot.sendNews([
      {
        title: 'Deribit交易系统更新',
        description: '新版本包含多项性能优化和bug修复',
        url: 'https://example.com/update-notes',
        picurl: 'https://example.com/image.jpg'
      }
    ]);
    console.log('✅ 图文消息发送成功');

  } catch (error) {
    console.error('❌ 消息发送失败:', error);
  }
}

async function notificationServiceExample() {
  console.log('\n=== 通知服务示例 ===');
  
  // 检查通知服务是否可用
  if (!wechatNotification.isAvailable()) {
    console.warn('⚠️ 企业微信机器人未配置，请在 config/apikeys.yml 中配置 wechat_bot');
    return;
  }

  try {
    // 发送交易通知（发送给所有配置的机器人）
    await wechatNotification.sendTradeNotification(
      'BTC-PERPETUAL',
      'BUY',
      45000.50,
      0.1,
      'SUCCESS'
    );
    console.log('✅ 交易通知发送成功');

    // 发送交易通知给特定账户
    await wechatNotification.sendTradeNotification(
      'ETH-PERPETUAL',
      'SELL',
      3200.00,
      0.5,
      'SUCCESS',
      'yqtest' // 指定账户名
    );
    console.log('✅ 特定账户交易通知发送成功');

    // 发送系统状态通知
    await wechatNotification.sendSystemNotification(
      'Deribit WebSocket',
      'ONLINE',
      '连接正常，数据流稳定'
    );
    console.log('✅ 系统状态通知发送成功');

    // 发送价格预警
    await wechatNotification.sendPriceAlert(
      'ETH-PERPETUAL',
      3200.75,
      3200.00,
      'ABOVE'
    );
    console.log('✅ 价格预警发送成功');

    // 发送错误通知
    const testError = new Error('数据库连接超时');
    testError.stack = 'Error: 数据库连接超时\n    at Database.connect (db.js:45:12)\n    at main (index.js:10:5)';
    
    await wechatNotification.sendErrorNotification(testError, 'Database Connection');
    console.log('✅ 错误通知发送成功');

    // 发送日报
    await wechatNotification.sendDailyReport({
      totalTrades: 25,
      successfulTrades: 23,
      failedTrades: 2,
      totalVolume: 125000.50,
      totalProfit: 2500.75
    });
    console.log('✅ 日报发送成功');

    // 发送自定义消息
    await wechatNotification.sendCustomMessage(
      '🎉 系统升级完成！新功能已上线，欢迎体验！',
      true // @所有人
    );
    console.log('✅ 自定义消息发送成功');

  } catch (error) {
    console.error('❌ 通知发送失败:', error);
  }
}

async function errorHandlingExample() {
  console.log('\n=== 错误处理示例 ===');
  
  try {
    // 使用无效的webhook URL
    const invalidBot = createWeChatBot('https://invalid-url.com/webhook');
    await invalidBot.sendText('这条消息不会发送成功');
  } catch (error: any) {
    console.log('✅ 正确捕获了无效URL错误:', error.message);
  }

  try {
    // 测试重试机制
    const bot = createWeChatBot('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=5cf3342a-57a2-4d19-872e-50984fd50ad7', {
      retryCount: 2,
      retryDelay: 500
    });
    await bot.sendText('测试重试机制');
  } catch (error: any) {
    console.log('✅ 重试机制正常工作:', error.message);
  }
}

async function webhookUrlValidationExample() {
  console.log('\n=== URL验证示例 ===');
  
  const validUrls = [
    'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc123',
    'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=def456&debug=1'
  ];

  const invalidUrls = [
    'https://example.com/webhook',
    'http://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc123',
    'https://qyapi.weixin.qq.com/webhook/send?key=abc123',
    'not-a-url'
  ];

  console.log('有效的URL:');
  validUrls.forEach(url => {
    const isValid = WeChatBot.isValidWebhookUrl(url);
    console.log(`  ${isValid ? '✅' : '❌'} ${url}`);
  });

  console.log('\n无效的URL:');
  invalidUrls.forEach(url => {
    const isValid = WeChatBot.isValidWebhookUrl(url);
    console.log(`  ${isValid ? '✅' : '❌'} ${url}`);
  });
}

// 主函数
async function main() {
  console.log('🤖 企业微信机器人示例程序\n');

  // 运行所有示例
  await basicUsageExample();
  await notificationServiceExample();
  await errorHandlingExample();
  await webhookUrlValidationExample();

  console.log('\n🎉 所有示例运行完成！');
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

export {
  basicUsageExample, errorHandlingExample, notificationServiceExample, webhookUrlValidationExample
};

