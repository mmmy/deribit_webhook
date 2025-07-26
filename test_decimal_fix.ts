// 测试decimal.js修复
import Decimal from 'decimal.js';
import { DeribitAuth } from './src/services/auth';
import { DeribitPrivateAPI } from './src/api/deribit-private';
import { ConfigLoader } from './src/config';

// 复制修正函数进行测试
function correctOrderParams(price: number, amount: number, instrumentName: string) {
  // BTC期权的分级tick size规则
  const tickSize = price > 0.005 ? 0.0005 : 0.0001;
  const minTradeAmount = 0.1; // BTC期权最小交易量
  
  // 使用Decimal.js进行精确计算
  const priceDecimal = new Decimal(price);
  const tickSizeDecimal = new Decimal(tickSize);
  const minTradeAmountDecimal = new Decimal(minTradeAmount);
  const amountDecimal = new Decimal(amount);
  
  // 修正价格到最接近的tick size倍数
  const steps = priceDecimal.dividedBy(tickSizeDecimal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const correctedPriceDecimal = steps.times(tickSizeDecimal);
  
  // 修正数量到最小交易量的倍数（向上取整）
  const amountSteps = amountDecimal.dividedBy(minTradeAmountDecimal).toDecimalPlaces(0, Decimal.ROUND_UP);
  const correctedAmountDecimal = amountSteps.times(minTradeAmountDecimal);
  
  // 转换回number类型
  const correctedPrice = correctedPriceDecimal.toNumber();
  const correctedAmount = correctedAmountDecimal.toNumber();
  
  return {
    correctedPrice,
    correctedAmount,
    tickSize,
    minTradeAmount,
    steps: steps.toString(),
    amountSteps: amountSteps.toString()
  };
}

async function testDecimalFix() {
  console.log('🎯 测试Decimal.js修复...\n');
  
  try {
    // 测试原始问题参数
    const originalPrice = 0.05425;
    const originalAmount = 0.042557479834563754;
    const instrumentName = 'BTC-8AUG25-113000-C';
    
    console.log('📋 原始参数:');
    console.log(`   价格: ${originalPrice}`);
    console.log(`   数量: ${originalAmount}`);
    
    // 应用修正
    const corrected = correctOrderParams(originalPrice, originalAmount, instrumentName);
    
    console.log('\n🔧 Decimal.js修正后参数:');
    console.log(`   价格: ${originalPrice} → ${corrected.correctedPrice}`);
    console.log(`   数量: ${originalAmount} → ${corrected.correctedAmount}`);
    console.log(`   使用的tick size: ${corrected.tickSize}`);
    console.log(`   价格步数: ${corrected.steps}`);
    console.log(`   数量步数: ${corrected.amountSteps}`);
    
    // 验证修正结果 - 使用Decimal.js进行验证
    const priceDecimal = new Decimal(corrected.correctedPrice);
    const tickSizeDecimal = new Decimal(corrected.tickSize);
    const amountDecimal = new Decimal(corrected.correctedAmount);
    const minTradeAmountDecimal = new Decimal(corrected.minTradeAmount);
    
    const priceRemainder = priceDecimal.modulo(tickSizeDecimal);
    const amountRemainder = amountDecimal.modulo(minTradeAmountDecimal);
    
    console.log('\n✅ Decimal.js验证结果:');
    console.log(`   价格余数: ${priceRemainder.toString()}`);
    console.log(`   数量余数: ${amountRemainder.toString()}`);
    console.log(`   价格有效: ${priceRemainder.isZero() ? '✅' : '❌'}`);
    console.log(`   数量有效: ${amountRemainder.isZero() ? '✅' : '❌'}`);
    
    // 计算步数验证
    const priceSteps = priceDecimal.dividedBy(tickSizeDecimal);
    const amountSteps = amountDecimal.dividedBy(minTradeAmountDecimal);
    
    console.log(`   价格步数: ${priceSteps.toString()} (应该是整数)`);
    console.log(`   数量步数: ${amountSteps.toString()} (应该是整数)`);
    console.log(`   价格步数是整数: ${priceSteps.isInteger() ? '✅' : '❌'}`);
    console.log(`   数量步数是整数: ${amountSteps.isInteger() ? '✅' : '❌'}`);
    
    if (priceRemainder.isZero() && amountRemainder.isZero()) {
      console.log('\n🎉 Decimal.js修正函数工作完美!');
      
      // 测试实际API调用
      console.log('\n📋 测试实际API调用...');
      
      const configLoader = ConfigLoader.getInstance();
      const accounts = configLoader.getEnabledAccounts();
      const authService = new DeribitAuth();
      const token = await authService.authenticate(accounts[0].name);
      
      const privateAPI = new DeribitPrivateAPI(
        { baseUrl: configLoader.getApiBaseUrl() },
        { accessToken: token.accessToken, tokenType: 'Bearer' }
      );
      
      const testParams = {
        instrument_name: instrumentName,
        amount: corrected.correctedAmount,
        price: corrected.correctedPrice,
        type: 'limit' as const,
        time_in_force: 'immediate_or_cancel' as const
      };
      
      console.log('🔄 发送API请求...');
      console.log(`   期权: ${testParams.instrument_name}`);
      console.log(`   数量: ${testParams.amount}`);
      console.log(`   价格: ${testParams.price}`);
      
      const orderResult = await privateAPI.buy(testParams);
      
      console.log('\n✅ API调用成功!');
      console.log(`   订单ID: ${orderResult.order.order_id}`);
      console.log(`   状态: ${orderResult.order.order_state}`);
      console.log(`   实际价格: ${orderResult.order.price}`);
      console.log(`   实际数量: ${orderResult.order.amount}`);
      
      console.log('\n🎯 总结:');
      console.log('✅ Decimal.js精度问题已解决');
      console.log('✅ 参数修正函数完美工作');
      console.log('✅ API调用成功');
      console.log('✅ 400 tick size错误已修复');
      console.log('\n💡 您的webhook接口现在应该可以完美工作了!');
      
    } else {
      console.log('\n❌ Decimal.js修正仍有问题');
    }
    
    // 测试其他价格
    console.log('\n📋 测试其他价格:');
    const testPrices = [0.001, 0.005, 0.01, 0.1, 1.0];
    
    testPrices.forEach(testPrice => {
      const result = correctOrderParams(testPrice, 0.05, instrumentName);
      const priceDecimal = new Decimal(result.correctedPrice);
      const tickSizeDecimal = new Decimal(result.tickSize);
      const isValid = priceDecimal.modulo(tickSizeDecimal).isZero();
      console.log(`   ${testPrice} → ${result.correctedPrice}: ${isValid ? '✅' : '❌'} (tick: ${result.tickSize})`);
    });
    
  } catch (error: any) {
    console.error('\n❌ 测试失败:');
    console.error(`错误: ${error.message}`);
    
    if (error.response?.data) {
      console.error(`响应数据:`, JSON.stringify(error.response.data, null, 2));
    }
  }
}

// 执行测试
if (require.main === module) {
  testDecimalFix().catch(error => {
    console.error('测试执行失败:', error.message);
    process.exit(1);
  });
}

export { testDecimalFix };
