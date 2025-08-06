import { Router } from 'express';
import { 
  ConfigLoader, 
  DeribitClient, 
  DeribitAuth,
  MockDeribitClient,
  OptionTradingService 
} from '../services';
import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from '../api';
import { getConfigLoader, getDeribitClient, getMockDeribitClient, getDeribitAuth, getOptionTradingService } from '../core';
import { validateAccountFromParams } from '../middleware/account-validation';

const router = Router();

// Get instruments endpoint
router.get('/api/instruments', async (req, res) => {
  try {
    const currency = req.query.currency as string || 'BTC';
    const kind = req.query.kind as string || 'option';
    const useMockMode = process.env.USE_MOCK_MODE === 'true';

    if (useMockMode) {
      const mockClient = getMockDeribitClient();
      const instruments = await mockClient.getInstruments(currency, kind);
      
      res.json({
        success: true,
        mockMode: true,
        currency,
        kind,
        count: instruments.length,
        instruments,
        timestamp: new Date().toISOString()
      });
    } else {
      const deribitClient = getDeribitClient();
      const instruments = await deribitClient.getInstruments(currency, kind);
      
      res.json({
        success: true,
        mockMode: false,
        currency,
        kind,
        count: instruments.length,
        instruments,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get instruments',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get single instrument endpoint
router.get('/api/instrument/:instrumentName', async (req, res) => {
  try {
    const instrumentName = req.params.instrumentName;
    
    if (!instrumentName) {
      return res.status(400).json({
        success: false,
        message: 'Instrument name is required',
        timestamp: new Date().toISOString()
      });
    }

    const useMockMode = process.env.USE_MOCK_MODE === 'true';

    if (useMockMode) {
      const mockClient = getMockDeribitClient();
      const instrument = await mockClient.getInstrument(instrumentName);
      
      res.json({
        success: true,
        mockMode: true,
        instrumentName,
        instrument,
        timestamp: new Date().toISOString()
      });
    } else {
      const deribitClient = getDeribitClient();
      const instrument = await deribitClient.getInstrument(instrumentName);
      
      res.json({
        success: true,
        mockMode: false,
        instrumentName,
        instrument,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get instrument',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get account positions endpoint
router.get('/api/account/:accountName/:currency', validateAccountFromParams('accountName'), async (req, res) => {
  try {
    const { accountName, currency } = req.params;
    const currencyUpper = currency.toUpperCase();
    
    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    const useMockMode = process.env.USE_MOCK_MODE === 'true';

    if (useMockMode) {
      // Mock mode: return simulated data
      const mockClient = getMockDeribitClient();
      const summary = await mockClient.getAccountSummary(currencyUpper);
      
      res.json({
        success: true,
        mockMode: true,
        accountName,
        currency: currencyUpper,
        data: {
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
        },
        timestamp: new Date().toISOString()
      });
    } else {
      // Real mode: call Deribit API
      try {
        const deribitAuth = getDeribitAuth();
        await deribitAuth.authenticate(accountName);
        const tokenInfo = deribitAuth.getTokenInfo(accountName);

        if (!tokenInfo) {
          throw new Error('Authentication failed');
        }

        // Configure API
        const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
        const apiConfig = getConfigByEnvironment(isTestEnv);
        const authInfo = createAuthInfo(tokenInfo.accessToken);

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

        res.json({
          success: true,
          mockMode: false,
          accountName,
          currency: currencyUpper,
          data: {
            summary: accountSummary,
            positions: positions,
            timestamp: new Date().toISOString()
          }
        });

      } catch (authError) {
        console.error(`Authentication error for account ${accountName}:`, authError);
        res.status(401).json({
          success: false,
          message: 'Authentication failed',
          accountName,
          error: authError instanceof Error ? authError.message : 'Unknown auth error',
          timestamp: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error('Error in account positions endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get account positions',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Trading service status
router.get('/api/trading/status', async (req, res) => {
  try {
    const optionTradingService = getOptionTradingService();
    const status = await optionTradingService.getTradingStatus();
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get trading status',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
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
      return res.status(400).json({
        success: false,
        message: 'Invalid delta value. Must be between -1 and 1',
        timestamp: new Date().toISOString()
      });
    }

    if (isNaN(minExpiredDaysValue) || minExpiredDaysValue < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid minExpiredDays value. Must be a positive number',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`🎯 Finding option by delta: ${currency}, delta: ${deltaValue}, minExpiredDays: ${minExpiredDaysValue}, longSide: ${longSideValue}`);

    const useMockMode = process.env.USE_MOCK_MODE === 'true';
    let result;

    if (useMockMode) {
      const mockClient = getMockDeribitClient();
      result = await mockClient.getInstrumentByDelta(currency.toUpperCase(), minExpiredDaysValue, deltaValue, longSideValue);
    } else {
      const deribitClient = getDeribitClient();
      result = await deribitClient.getInstrumentByDelta(currency.toUpperCase(), minExpiredDaysValue, deltaValue, longSideValue);
    }

    if (result) {
      res.json({
        success: true,
        message: `Found optimal option for delta ${deltaValue}`,
        data: {
          instrument: result,
          searchParams: {
            currency: currency.toUpperCase(),
            targetDelta: deltaValue,
            minExpiredDays: minExpiredDaysValue,
            longSide: longSideValue,
            optionType: longSideValue ? 'call' : 'put'
          }
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        message: `No suitable option found for delta ${deltaValue}`,
        searchParams: {
          currency: currency.toUpperCase(),
          targetDelta: deltaValue,
          minExpiredDays: minExpiredDaysValue,
          longSide: longSideValue
        },
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Error in delta filter endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to find option by delta',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as tradingRoutes };