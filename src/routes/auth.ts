import { Router } from 'express';
import { ConfigLoader, DeribitAuth, MockDeribitClient } from '../services';

const router = Router();

// Authentication test endpoint
router.get('/api/auth/test', async (req, res) => {
  try {
    const accountName = req.query.account as string || 'account_1';
    const configLoader = ConfigLoader.getInstance();
    const account = configLoader.getAccountByName(accountName);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountName}`,
        timestamp: new Date().toISOString()
      });
    }

    const useMockMode = process.env.USE_MOCK_MODE === 'true';

    if (useMockMode) {
      // Use mock client
      const mockClient = new MockDeribitClient();
      const authResult = await mockClient.authenticate(account);
      
      res.json({
        success: true,
        message: 'Authentication successful (MOCK MODE)',
        account: accountName,
        mockMode: true,
        tokenType: authResult.result.token_type,
        expiresIn: authResult.result.expires_in,
        timestamp: new Date().toISOString()
      });
    } else {
      // Use real client
      const deribitAuth = new DeribitAuth();
      const success = await deribitAuth.testConnection(accountName);

      if (success) {
        const tokenInfo = deribitAuth.getTokenInfo(accountName);
        res.json({
          success: true,
          message: 'Authentication successful',
          account: accountName,
          mockMode: false,
          tokenExpiry: tokenInfo ? new Date(tokenInfo.expiresAt).toISOString() : null,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(401).json({
          success: false,
          message: 'Authentication failed',
          account: accountName,
          timestamp: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as authRoutes };