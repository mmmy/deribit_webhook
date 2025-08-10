import { Router } from 'express';
import { ConfigLoader } from '../services';
import { readFileSync } from 'fs';
import { join } from 'path';

const router = Router();

// 在模块初始化时读取版本信息并缓存
let cachedVersion: string;

try {
  const packagePath = join(__dirname, '../../package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  cachedVersion = packageJson.version;
  console.log(`📦 Service version loaded: v${cachedVersion}`);
} catch (error) {
  console.error('Failed to read package.json during initialization:', error);
  cachedVersion = '1.0.0'; // 降级版本
}

// 获取缓存的版本信息
function getPackageVersion(): string {
  return cachedVersion;
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: getPackageVersion()
  });
});

// Status endpoint with more details
router.get('/api/status', (req, res) => {
  try {
    const configLoader = ConfigLoader.getInstance();
    const accounts = configLoader.getEnabledAccounts();
    const useMockMode = process.env.USE_MOCK_MODE === 'true';

    res.json({
      service: 'Deribit Options Trading Microservice',
      version: getPackageVersion(),
      environment: process.env.NODE_ENV || 'development',
      mockMode: useMockMode,
      enabledAccounts: accounts.length,
      accounts: accounts.map(acc => ({ name: acc.name, enabled: true })),
      testEnvironment: process.env.USE_TEST_ENVIRONMENT || 'true',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get status',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as healthRoutes };