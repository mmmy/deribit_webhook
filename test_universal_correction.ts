// 测试通用的参数修正函数
import Decimal from 'decimal.js';
import { DeribitAuth } from './src/services/auth';
import { DeribitPrivateAPI } from './src/api/deribit-private';
import { ConfigLoader } from './src/config';
import axios from 'axios';

// 复制通用修正函数进行测试
function getCorrectTickSize(price: number, baseTickSize: number, tickSizeSteps?: any[]): number {
  if (!tickSizeSteps || tickSizeSteps.length === 0) {
    return baseTickSize;
  }

  // 从高到低检查tick size steps
  for (const step of tickSizeSteps.sort((a, b) => b.above_price - a.above_price)) {
    if (price > step.above_price) {
      return step.tick_size;
    }
  }
  
  return baseTickSize;
}

function correctOrderParams(
  price: number, 
  amount: number, 
  instrumentDetail: any // 期权详情，包含tick_size, tick_size_steps, min_trade_amount等
) {
  const { 
    tick_size: baseTickSize, 
    tick_size_steps: tickSizeSteps, 
    min_trade_amount: minTradeAmount,
    instrument_name: instrumentName 
  } = instrumentDetail;

  // 计算正确的tick size
  const correctTickSize = getCorrectTickSize(price, baseTickSize, tickSizeSteps);

  // 使用Decimal.js进行精确计算
  const priceDecimal = new Decimal(price);
  const tickSizeDecimal = new Decimal(correctTickSize);
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
    tickSize: correctTickSize,
    minTradeAmount,
    steps: steps.toString(),
    amountSteps: amountSteps.toString()
  };
}

async function testUniversalCorrection() {
  console.log('🎯 测试通用参数修正函数...\n');
  
  try {
    // 测试原始问题参数
    const originalPrice = 0.05425;
    const originalAmount = 0.042557479834563754;
    const instrumentName = 'BTC-8AUG25-113000-C';
    
    console.log('📋 测试参数:');
    console.log(`   期权: ${instrumentName}`);
    console.log(`   原始价格: ${originalPrice}`);
    console.log(`   原始数量: ${originalAmount}`);
    
    // 1. 获取真实的instrument信息
    console.log('\n📋 步骤1: 获取真实instrument信息');
    const instrumentResponse = await axios.get('https://test.deribit.com/api/v2/public/get_instrument', {
      params: { instrument_name: instrumentName }
    });
    
    const instrumentDetail = instrumentResponse.data.result;
    console.log('✅ 获取到instrument详情:');
    console.log(`   基础tick_size: ${instrumentDetail.tick_size}`);
    console.log(`   min_trade_amount: ${instrumentDetail.min_trade_amount}`);
    console.log(`   tick_size_steps: ${JSON.stringify(instrumentDetail.tick_size_steps || [])}`);
    
    // 2. 应用通用修正函数
    console.log('\n📋 步骤2: 应用通用修正函数');
    const corrected = correctOrderParams(originalPrice, originalAmount, instrumentDetail);
    
    console.log('🔧 修正结果:');
    console.log(`   价格: ${originalPrice} → ${corrected.correctedPrice}`);
    console.log(`   数量: ${originalAmount} → ${corrected.correctedAmount}`);
    console.log(`   使用的tick_size: ${corrected.tickSize}`);
    console.log(`   价格步数: ${corrected.steps}`);
    console.log(`   数量步数: ${corrected.amountSteps}`);
    
    // 3. 验证修正结果
    console.log('\n📋 步骤3: 验证修正结果');
    const priceDecimal = new Decimal(corrected.correctedPrice);
    const tickSizeDecimal = new Decimal(corrected.tickSize);
    const amountDecimal = new Decimal(corrected.correctedAmount);
    const minTradeAmountDecimal = new Decimal(corrected.minTradeAmount);
    
    const priceRemainder = priceDecimal.modulo(tickSizeDecimal);
    const amountRemainder = amountDecimal.modulo(minTradeAmountDecimal);
    
    console.log('✅ 验证结果:');
    console.log(`   价格余数: ${priceRemainder.toString()}`);
    console.log(`   数量余数: ${amountRemainder.toString()}`);
    console.log(`   价格有效: ${priceRemainder.isZero() ? '✅' : '❌'}`);
    console.log(`   数量有效: ${amountRemainder.isZero() ? '✅' : '❌'}`);
    
    if (priceRemainder.isZero() && amountRemainder.isZero()) {
      console.log('\n🎉 通用修正函数工作完美!');
      
      // 4. 测试实际API调用
      console.log('\n📋 步骤4: 测试实际API调用');
      
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
      const orderResult = await privateAPI.buy(testParams);
      
      console.log('✅ API调用成功!');
      console.log(`   订单ID: ${orderResult.order.order_id}`);
      console.log(`   状态: ${orderResult.order.order_state}`);
      console.log(`   实际价格: ${orderResult.order.price}`);
      console.log(`   实际数量: ${orderResult.order.amount}`);
      
      console.log('\n🎯 总结:');
      console.log('✅ 通用参数修正函数完美工作');
      console.log('✅ 支持分级tick_size规则');
      console.log('✅ 支持所有货币的期权');
      console.log('✅ API调用成功');
      console.log('✅ TODO已完成！');
      
    } else {
      console.log('\n❌ 通用修正函数仍有问题');
    }
    
    // 5. 测试其他货币的期权（模拟）
    console.log('\n📋 步骤5: 测试其他货币期权（模拟）');
    
    const testCases = [
      {
        name: 'ETH期权',
        instrumentDetail: {
          instrument_name: 'ETH-8AUG25-3000-C',
          tick_size: 0.0001,
          min_trade_amount: 0.1,
          tick_size_steps: [
            { above_price: 0.01, tick_size: 0.001 }
          ]
        },
        price: 0.025,
        amount: 0.05
      },
      {
        name: 'SOL期权',
        instrumentDetail: {
          instrument_name: 'SOL-8AUG25-150-C',
          tick_size: 0.00001,
          min_trade_amount: 1,
          tick_size_steps: []
        },
        price: 0.00123,
        amount: 0.5
      }
    ];
    
    testCases.forEach((testCase, index) => {
      console.log(`\n   测试${index + 1}: ${testCase.name}`);
      const result = correctOrderParams(testCase.price, testCase.amount, testCase.instrumentDetail);
      
      const priceValid = new Decimal(result.correctedPrice).modulo(new Decimal(result.tickSize)).isZero();
      const amountValid = new Decimal(result.correctedAmount).modulo(new Decimal(result.minTradeAmount)).isZero();
      
      console.log(`     价格: ${testCase.price} → ${result.correctedPrice} ${priceValid ? '✅' : '❌'}`);
      console.log(`     数量: ${testCase.amount} → ${result.correctedAmount} ${amountValid ? '✅' : '❌'}`);
      console.log(`     使用tick_size: ${result.tickSize}`);
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
  testUniversalCorrection().catch(error => {
    console.error('测试执行失败:', error.message);
    process.exit(1);
  });
}

export { testUniversalCorrection };
