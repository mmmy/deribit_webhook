/**
 * 企业微信机器人测试脚本
 * 
 * 使用方法：
 * 1. 确保已配置环境变量 WECHAT_BOT_WEBHOOK_URL
 * 2. 运行: node test-wechat-bot.js
 */

require('dotenv').config();

async function testWeChatBot() {
  try {
    // 动态导入 ES 模块
    const { wechatNotification } = await import('./dist/services/index.js');
    
    console.log('🤖 开始测试企业微信机器人...\n');

    // 检查机器人是否可用
    if (!wechatNotification.isAvailable()) {
      console.error('❌ 企业微信机器人未配置');
      console.log('请在 config/apikeys.yml 文件中为账户配置 wechat_bot 部分');
      console.log('示例配置:');
      console.log('  wechat_bot:');
      console.log('    webhook_url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"');
      console.log('    enabled: true');
      return;
    }

    console.log('✅ 企业微信机器人已配置\n');

    // 测试1: 发送简单文本消息
    console.log('📝 测试1: 发送文本消息');
    try {
      await wechatNotification.sendCustomMessage('🎉 企业微信机器人测试消息 - ' + new Date().toLocaleString('zh-CN'));
      console.log('✅ 文本消息发送成功\n');
    } catch (error) {
      console.error('❌ 文本消息发送失败:', error.message, '\n');
    }

    // 等待1秒避免频率限制
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试2: 发送交易通知
    console.log('📊 测试2: 发送交易通知');
    try {
      await wechatNotification.sendTradeNotification(
        'BTC-PERPETUAL',
        'BUY',
        45000.50,
        0.1,
        'SUCCESS'
      );
      console.log('✅ 交易通知发送成功\n');
    } catch (error) {
      console.error('❌ 交易通知发送失败:', error.message, '\n');
    }

    // 等待1秒避免频率限制
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试3: 发送系统状态通知
    console.log('🔧 测试3: 发送系统状态通知');
    try {
      await wechatNotification.sendSystemNotification(
        'Test Service',
        'ONLINE',
        '测试服务运行正常'
      );
      console.log('✅ 系统状态通知发送成功\n');
    } catch (error) {
      console.error('❌ 系统状态通知发送失败:', error.message, '\n');
    }

    // 等待1秒避免频率限制
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试4: 发送价格预警
    console.log('💰 测试4: 发送价格预警');
    try {
      await wechatNotification.sendPriceAlert(
        'ETH-PERPETUAL',
        3200.75,
        3200.00,
        'ABOVE'
      );
      console.log('✅ 价格预警发送成功\n');
    } catch (error) {
      console.error('❌ 价格预警发送失败:', error.message, '\n');
    }

    // 等待1秒避免频率限制
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 测试5: 发送日报
    console.log('📈 测试5: 发送日报');
    try {
      await wechatNotification.sendDailyReport({
        totalTrades: 15,
        successfulTrades: 14,
        failedTrades: 1,
        totalVolume: 75000.25,
        totalProfit: 1250.50
      });
      console.log('✅ 日报发送成功\n');
    } catch (error) {
      console.error('❌ 日报发送失败:', error.message, '\n');
    }

    console.log('🎉 所有测试完成！');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  }
}

// 运行测试
if (require.main === module) {
  testWeChatBot().catch(console.error);
}

module.exports = { testWeChatBot };
