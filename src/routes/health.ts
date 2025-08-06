import { Router } from 'express';
import { ConfigLoader } from '../services';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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
      version: '1.0.0',
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