import { Router } from 'express';
import { validateAccountFromQuery } from '../middleware/account-validation';
import { getAuthenticationService } from '../services/authentication-service';
import { ApiResponse } from '../utils/response-formatter';

const router = Router();

// Authentication test endpoint
router.get('/api/auth/test', validateAccountFromQuery('account'), async (req, res) => {
  try {
    const accountName = req.query.account as string || 'account_1';

    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    // Use authentication service
    const authResult = await getAuthenticationService().authenticate(accountName);

    if (authResult.success && authResult.token) {
      return ApiResponse.ok(res, {
        account: accountName,
        tokenExpiry: new Date(authResult.token.expiresAt).toISOString()
      }, { message: 'Authentication successful' });
    } else {
      return ApiResponse.unauthorized(res, authResult.error || 'Authentication failed', {
        meta: { accountName }
      });
    }
  } catch (error) {
    return ApiResponse.internalError(res, error as Error, {
      message: 'Authentication error'
    });
  }
});

export { router as authRoutes };
