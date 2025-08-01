/**
 * 简单测试USDC期权支持
 */

// 模拟OptionTradingService的parseSymbolForOptions方法
function parseSymbolForOptions(symbol) {
  const upperSymbol = symbol.toUpperCase();
  
  // 检查是否为USDC期权
  if (upperSymbol.endsWith('USDC')) {
    const underlying = upperSymbol.replace(/USDC$/i, '');
    return {
      currency: 'USDC',
      underlying: underlying
    };
  }
  
  // 检查是否为USDT期权（向后兼容）
  if (upperSymbol.endsWith('USDT')) {
    const underlying = upperSymbol.replace(/USDT$/i, '');
    return {
      currency: underlying, // USDT期权使用underlying作为currency
      underlying: underlying
    };
  }
  
  // 检查是否为USD期权（向后兼容）
  if (upperSymbol.endsWith('USD')) {
    const underlying = upperSymbol.replace(/USD$/i, '');
    return {
      currency: underlying, // USD期权使用underlying作为currency
      underlying: underlying
    };
  }
  
  // 默认情况：假设整个symbol就是currency
  return {
    currency: upperSymbol,
    underlying: upperSymbol
  };
}

// 测试用例
const testCases = [
  { symbol: 'SOLUSDC', expectedCurrency: 'USDC', expectedUnderlying: 'SOL' },
  { symbol: 'BTCUSDC', expectedCurrency: 'USDC', expectedUnderlying: 'BTC' },
  { symbol: 'ETHUSDC', expectedCurrency: 'USDC', expectedUnderlying: 'ETH' },
  { symbol: 'BTCUSDT', expectedCurrency: 'BTC', expectedUnderlying: 'BTC' },
  { symbol: 'ETHUSDT', expectedCurrency: 'ETH', expectedUnderlying: 'ETH' },
  { symbol: 'BTC', expectedCurrency: 'BTC', expectedUnderlying: 'BTC' }
];

console.log('🧪 测试Symbol解析逻辑');
console.log('='.repeat(50));

let passCount = 0;
let totalCount = testCases.length;

testCases.forEach((testCase, index) => {
  const result = parseSymbolForOptions(testCase.symbol);
  const currencyMatch = result.currency === testCase.expectedCurrency;
  const underlyingMatch = result.underlying === testCase.expectedUnderlying;
  const passed = currencyMatch && underlyingMatch;
  
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${index + 1}. ${testCase.symbol}`);
  console.log(`   期望: currency="${testCase.expectedCurrency}", underlying="${testCase.expectedUnderlying}"`);
  console.log(`   实际: currency="${result.currency}", underlying="${result.underlying}"`);
  
  if (!currencyMatch) {
    console.log(`   ❌ Currency不匹配: 期望"${testCase.expectedCurrency}", 实际"${result.currency}"`);
  }
  if (!underlyingMatch) {
    console.log(`   ❌ Underlying不匹配: 期望"${testCase.expectedUnderlying}", 实际"${result.underlying}"`);
  }
  
  if (passed) {
    passCount++;
  }
  
  console.log('');
});

console.log('='.repeat(50));
console.log(`📊 测试结果: ${passCount}/${totalCount} (${(passCount/totalCount*100).toFixed(1)}%)`);

if (passCount === totalCount) {
  console.log('🎉 所有测试通过！Symbol解析逻辑正确。');
} else {
  console.log('⚠️ 部分测试失败，需要修复。');
}

// 测试instrument name生成
console.log('\n🏗️ 测试Instrument Name生成');
console.log('='.repeat(50));

function generateInstrumentName(symbol, direction) {
  const { currency, underlying } = parseSymbolForOptions(symbol);
  const expiry = '25JUL25';
  const strike = underlying === 'SOL' ? 150 : underlying === 'BTC' ? 50000 : 3000;
  const optionType = direction === 'buy' ? 'C' : 'P';
  
  // 根据currency类型生成不同格式的instrument name
  if (currency === 'USDC') {
    // USDC期权使用下划线格式: SOL_USDC-expiry-strike-type
    return `${underlying}_USDC-${expiry}-${strike}-${optionType}`;
  } else {
    // 传统期权使用连字符格式: BTC-expiry-strike-type
    return `${underlying}-${expiry}-${strike}-${optionType}`;
  }
}

const instrumentTests = [
  { symbol: 'SOLUSDC', direction: 'buy', expected: 'SOL_USDC-25JUL25-150-C' },
  { symbol: 'BTCUSDC', direction: 'sell', expected: 'BTC_USDC-25JUL25-50000-P' },
  { symbol: 'ETHUSDC', direction: 'buy', expected: 'ETH_USDC-25JUL25-3000-C' },
  { symbol: 'BTCUSDT', direction: 'buy', expected: 'BTC-25JUL25-50000-C' },
  { symbol: 'ETHUSDT', direction: 'sell', expected: 'ETH-25JUL25-3000-P' }
];

let instrumentPassCount = 0;

instrumentTests.forEach((test, index) => {
  const result = generateInstrumentName(test.symbol, test.direction);
  const passed = result === test.expected;
  
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${index + 1}. ${test.symbol} (${test.direction})`);
  console.log(`   期望: ${test.expected}`);
  console.log(`   实际: ${result}`);
  
  if (passed) {
    instrumentPassCount++;
  }
  
  console.log('');
});

console.log('='.repeat(50));
console.log(`📊 Instrument测试结果: ${instrumentPassCount}/${instrumentTests.length} (${(instrumentPassCount/instrumentTests.length*100).toFixed(1)}%)`);

if (instrumentPassCount === instrumentTests.length) {
  console.log('🎉 所有Instrument Name生成测试通过！');
} else {
  console.log('⚠️ 部分Instrument Name测试失败。');
}

// 总结
const totalTests = totalCount + instrumentTests.length;
const totalPassed = passCount + instrumentPassCount;

console.log('\n📈 总体测试结果');
console.log('='.repeat(50));
console.log(`✅ 通过: ${totalPassed}/${totalTests} (${(totalPassed/totalTests*100).toFixed(1)}%)`);

if (totalPassed === totalTests) {
  console.log('🎉 所有测试通过！USDC期权支持逻辑正确实现。');
  process.exit(0);
} else {
  console.log('❌ 部分测试失败，需要修复逻辑。');
  process.exit(1);
}
