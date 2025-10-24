// Jest测试环境设置文件
import { TextDecoder, TextEncoder } from 'util';

// 全局设置
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.USE_TEST_ENVIRONMENT = 'true';

// 模拟控制台方法以减少测试输出噪音
global.console = {
  ...console,
  // 保留 error 和 warn 用于调试
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// 全局测试超时设置
jest.setTimeout(10000);

// 在所有测试之前运行
beforeAll(() => {
  // 可以在这里设置全局测试数据或服务
});

// 在所有测试之后运行
afterAll(() => {
  // 清理资源
});

// 在每个测试之前运行
beforeEach(() => {
  // 重置所有模拟
  jest.clearAllMocks();
});

// 在每个测试之后运行
afterEach(() => {
  // 清理定时器和句柄
  jest.clearAllTimers();
  jest.useRealTimers();
});