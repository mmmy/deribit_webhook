import { Router } from 'express';
import { ConfigLoader, DeribitAuth, MockDeribitClient } from '../services';
import { validateAccountFromQuery } from '../middleware/account-validation';
import { getUnifiedClient } from '../factory/client-factory';
import { getAuthenticationService } from '../services/authentication-service';
import { ApiResponse } from '../utils/response-formatter';

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
      
      return ApiResponse.ok(res, {
        account: accountName,
        mockMode: true,
        tokenType: authResult.result.token_type,
        expiresIn: authResult.result.expires_in
      }, { message: 'Authentication successful (MOCK MODE)' });
    } else {
      // Use real client with unified authentication service
      const authResult = await getAuthenticationService().authenticate(accountName);

      if (authResult.success && authResult.token) {
        return ApiResponse.ok(res, {
          account: accountName,
          mockMode: false,
          tokenExpiry: new Date(authResult.token.expiresAt).toISOString()
        }, { message: 'Authentication successful' });
      } else {
        return ApiResponse.unauthorized(res, authResult.error || 'Authentication failed', {
          meta: { accountName }
        });
      }
    }
  } catch (error) {
    return ApiResponse.internalError(res, error as Error, {
      message: 'Authentication error'
    });
  }
});

export { router as authRoutes };