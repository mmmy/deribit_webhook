import { Router } from 'express';
import { ConfigLoader, DeribitAuth, MockDeribitClient } from '../services';
import { validateAccountFromQuery } from '../middleware/account-validation';
import { getUnifiedClient } from '../factory/client-factory';

const router = Router();

// Authentication test endpoint
router.get('/api/auth/test', validateAccountFromQuery('account'), async (req, res) => {
  try {
    const accountName = req.query.account as string || 'account_1';
    
    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    // 使用统一客户端，自动处理Mock/Real模式
    const client = getUnifiedClient();

    if (client.isMock) {
      // Use unified mock client
      const authResult = await (client as any).mockClient.authenticate(req.validatedAccount!);
      
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