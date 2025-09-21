import { Router } from 'express';
import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from '../api';
import { getOptionTradingService } from '../core';
import { validateAccountFromParams } from '../middleware/account-validation';
import { getAuthenticationService } from '../services/authentication-service';
import { DeribitClient } from '../services/deribit-client';
import { ApiResponse } from '../utils/response-formatter';

const router = Router();

// Get instruments endpoint
router.get('/api/instruments', async (req, res) => {
  try {
    const currency = req.query.currency as string || 'BTC';
    const kind = req.query.kind as string || 'option';

    // Use DeribitClient directly
    const deribitClient = new DeribitClient();
    const instruments = await deribitClient.getInstruments(currency, kind);

    return ApiResponse.ok(res, {
      currency,
      kind,
      count: instruments.length,
      instruments
    });
  } catch (error) {
    return ApiResponse.internalError(res, error instanceof Error ? error.message : 'Unknown error');
  }
});

// Get single instrument endpoint
router.get('/api/instrument/:instrumentName', async (req, res) => {
  try {
    const instrumentName = req.params.instrumentName;

    if (!instrumentName) {
      return ApiResponse.badRequest(res, 'Instrument name is required');
    }

    // Use DeribitClient directly
    const deribitClient = new DeribitClient();
    const instrument = await deribitClient.getInstrument(instrumentName);

    return ApiResponse.ok(res, {
      instrumentName,
      instrument
    });
  } catch (error) {
    return ApiResponse.internalError(res, error instanceof Error ? error.message : 'Unknown error');
  }
});

// Get account positions endpoint
router.get('/api/account/:accountName/:currency', validateAccountFromParams('accountName'), async (req, res) => {
  try {
    const { accountName, currency } = req.params;
    const currencyUpper = currency.toUpperCase();

    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    try {
      // Use authentication service
      const authResult = await getAuthenticationService().authenticate(accountName);

      if (!authResult.success || !authResult.token) {
        throw new Error(authResult.error || 'Authentication failed');
      }

      // Configure API
      const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
      const apiConfig = getConfigByEnvironment(isTestEnv);
      const authInfo = createAuthInfo(authResult.token.accessToken);

      // Create private API instance
      const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

      // Parallel requests for account summary and positions
      const [accountSummary, positions] = await Promise.all([
        privateAPI.getAccountSummary({
          currency: currencyUpper,
          extended: true
        }),
        privateAPI.getPositions({
          currency: currencyUpper
        })
      ]);

      return ApiResponse.ok(res, {
        summary: accountSummary,
        positions: positions,
        timestamp: new Date().toISOString()
      }, {
        meta: {
          accountName,
          currency: currencyUpper
        }
      });

    } catch (authError) {
      console.error(`Authentication error for account ${accountName}:`, authError);
      return ApiResponse.unauthorized(res, authError instanceof Error ? authError.message : 'Unknown auth error', {
        meta: { accountName }
      });
    }
  } catch (error) {
    console.error('Error in account positions endpoint:', error);
    return ApiResponse.internalError(res, error instanceof Error ? error.message : 'Unknown error');
  }
});

// Trading service status
router.get('/api/trading/status', async (req, res) => {
  try {
    const optionTradingService = getOptionTradingService();
    const status = await optionTradingService.getTradingStatus();
    
    return ApiResponse.ok(res, status);
  } catch (error) {
    return ApiResponse.internalError(res, error instanceof Error ? error.message : 'Unknown error');
  }
});

// Get option by delta endpoint
router.get('/api/options/:currency/delta/:delta', async (req, res) => {
  try {
    const { currency, delta } = req.params;
    const { minExpiredDays = '7', longSide = 'true' } = req.query;

    // Validate parameters
    const deltaValue = parseFloat(delta);
    const minExpiredDaysValue = parseInt(minExpiredDays as string);
    const longSideValue = (longSide as string).toLowerCase() === 'true';

    if (isNaN(deltaValue) || deltaValue < -1 || deltaValue > 1) {
      return ApiResponse.badRequest(res, 'Invalid delta value. Must be between -1 and 1');
    }

    if (isNaN(minExpiredDaysValue) || minExpiredDaysValue < 0) {
      return ApiResponse.badRequest(res, 'Invalid minExpiredDays value. Must be a positive number');
    }

    console.log(`🎯 Finding option by delta: ${currency}, delta: ${deltaValue}, minExpiredDays: ${minExpiredDaysValue}, longSide: ${longSideValue}`);

    // Use DeribitClient directly
    const deribitClient = new DeribitClient();
    const result = await deribitClient.getInstrumentByDelta(currency.toUpperCase(), minExpiredDaysValue, deltaValue, longSideValue, currency.toUpperCase());

    if (result) {
      return ApiResponse.ok(res, {
        instrument: result,
        searchParams: {
          currency: currency.toUpperCase(),
          targetDelta: deltaValue,
          minExpiredDays: minExpiredDaysValue,
          longSide: longSideValue,
          optionType: longSideValue ? 'call' : 'put'
        }
      }, { message: `Found optimal option for delta ${deltaValue}` });
    } else {
      return ApiResponse.notFound(res, `No suitable option found for delta ${deltaValue}`, {
        meta: {
          searchParams: {
            currency: currency.toUpperCase(),
            targetDelta: deltaValue,
            minExpiredDays: minExpiredDaysValue,
            longSide: longSideValue
          }
        }
      });
    }

  } catch (error) {
    console.error('Error in delta filter endpoint:', error);
    return ApiResponse.internalError(res, error instanceof Error ? error.message : 'Unknown error');
  }
});

export { router as tradingRoutes };
