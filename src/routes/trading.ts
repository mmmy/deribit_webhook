import { Router } from 'express';
import { 
  ConfigLoader, 
  DeribitClient, 
  DeribitAuth,
  MockDeribitClient,
  OptionTradingService 
} from '../services';
import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from '../api';
import { getConfigLoader, getDeribitClient, getMockDeribitClient, getDeribitAuth, getOptionTradingService, getClientFactory } from '../core';
import { validateAccountFromParams } from '../middleware/account-validation';
import { getUnifiedClient } from '../factory/client-factory';
import { getAuthenticationService } from '../services/authentication-service';
import { ApiResponse } from '../utils/response-formatter';

const router = Router();

// Get instruments endpoint
router.get('/api/instruments', async (req, res) => {
  try {
    const currency = req.query.currency as string || 'BTC';
    const kind = req.query.kind as string || 'option';
    
    // 使用统一客户端，自动处理Mock/Real模式
    const client = getUnifiedClient();
    const instruments = await client.getInstruments(currency, kind);
    
    return ApiResponse.ok(res, {
      mockMode: client.isMock,
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

    // 使用统一客户端，自动处理Mock/Real模式
    const client = getUnifiedClient();
    const instrument = await client.getInstrument(instrumentName);
    
    return ApiResponse.ok(res, {
      mockMode: client.isMock,
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

    // 使用统一客户端，自动处理Mock/Real模式
    const client = getUnifiedClient();

    if (client.isMock) {
      // Mock mode: return simulated data
      const summary = await client.getAccountSummary(currencyUpper);
      
      return ApiResponse.ok(res, {
        summary,
        positions: [
          {
            instrument_name: `${currencyUpper}-25JUL25-50000-C`,
            size: 10.5,
            direction: 'buy',
            average_price: 0.025,
            mark_price: 0.028,
            unrealized_pnl: 0.315,
            delta: 0.65
          }
        ]  
      }, {
        meta: { 
          mockMode: true, 
          accountName, 
          currency: currencyUpper 
        } 
      });
    } else {
      // Real mode: call Deribit API
      try {
        // 使用统一认证服务
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
            mockMode: false, 
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

    // 使用统一客户端，自动处理Mock/Real模式
    const client = getUnifiedClient();
    const result = await client.getInstrumentByDelta(currency.toUpperCase(), minExpiredDaysValue, deltaValue, longSideValue, currency.toUpperCase());

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