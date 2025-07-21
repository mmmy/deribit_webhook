import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { ConfigLoader, DeribitAuth, DeribitClient, MockDeribitClient, OptionTradingService, WebhookResponse, WebhookSignalPayload } from './services';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize services
const deribitAuth = new DeribitAuth();
const deribitClient = new DeribitClient();
const mockClient = new MockDeribitClient();
const configLoader = ConfigLoader.getInstance();
const optionTradingService = new OptionTradingService();

// Determine if we should use mock mode (when network is unavailable)
const useMockMode = process.env.USE_MOCK_MODE === 'true';

// API routes
app.get('/api/status', (req, res) => {
  const accounts = configLoader.getEnabledAccounts();
  res.json({ 
    service: 'Deribit Options Trading Microservice',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    mockMode: useMockMode,
    enabledAccounts: accounts.length,
    testEnvironment: process.env.USE_TEST_ENVIRONMENT || 'true'
  });
});

// Authentication test endpoint
app.get('/api/auth/test', async (req, res) => {
  try {
    const accountName = req.query.account as string || 'account_1';
    const account = configLoader.getAccountByName(accountName);
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountName}`
      });
    }

    if (useMockMode) {
      // Use mock client
      const authResult = await mockClient.authenticate(account);
      res.json({
        success: true,
        message: 'Authentication successful (MOCK MODE)',
        account: accountName,
        mockMode: true,
        tokenType: authResult.token_type,
        expiresIn: authResult.expires_in
      });
    } else {
      // Use real client
      const success = await deribitAuth.testConnection(accountName);
      
      if (success) {
        const tokenInfo = deribitAuth.getTokenInfo(accountName);
        res.json({
          success: true,
          message: 'Authentication successful',
          account: accountName,
          mockMode: false,
          tokenExpiry: tokenInfo ? new Date(tokenInfo.expiresAt).toISOString() : null
        });
      } else {
        res.status(401).json({
          success: false,
          message: 'Authentication failed'
        });
      }
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get instruments endpoint
app.get('/api/instruments', async (req, res) => {
  try {
    const currency = req.query.currency as string || 'BTC';
    const kind = req.query.kind as string || 'option';
    
    if (useMockMode) {
      const instruments = await mockClient.getInstruments(currency, kind);
      res.json({
        success: true,
        mockMode: true,
        currency,
        kind,
        count: instruments.length,
        instruments
      });
    } else {
      const instruments = await deribitClient.getInstruments(currency, kind);
      res.json({
        success: true,
        mockMode: false,
        currency,
        kind,
        count: instruments.length,
        instruments
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get instruments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get account summary endpoint
app.get('/api/account/:currency', async (req, res) => {
  try {
    const currency = req.params.currency.toUpperCase();
    
    if (useMockMode) {
      const summary = await mockClient.getAccountSummary(currency);
      res.json({
        success: true,
        mockMode: true,
        currency,
        summary
      });
    } else {
      res.json({
        success: false,
        message: 'Real account summary not implemented yet',
        mockMode: false
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get account summary',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===== WEBHOOK ENDPOINTS =====

// TradingView Webhook Signal
app.post('/webhook/signal', async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // 🔴 DEBUG BREAKPOINT: 在这里设置断点 - Webhook信号接收
    console.log(`📡 [${requestId}] Received webhook signal:`, req.body);
    
    // 1. 验证请求体
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        timestamp: new Date().toISOString(),
        requestId
      } as WebhookResponse);
    }

    const payload = req.body as WebhookSignalPayload;

    // 2. 验证必需字段
    const requiredFields = ['accountName', 'side', 'symbol', 'size'];
    const missingFields = requiredFields.filter(field => !payload[field as keyof WebhookSignalPayload]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        timestamp: new Date().toISOString(),
        requestId
      } as WebhookResponse);
    }

    // 3. 验证账户名
    const account = configLoader.getAccountByName(payload.accountName);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${payload.accountName}`,
        timestamp: new Date().toISOString(),
        requestId
      } as WebhookResponse);
    }

    // 4. 处理交易信号
    console.log(`🔄 [${requestId}] Processing signal for account: ${payload.accountName}`);
    const result = await optionTradingService.processWebhookSignal(payload);

    // 5. 返回结果
    const response: WebhookResponse = {
      success: result.success,
      message: result.message,
      data: {
        orderId: result.orderId,
        instrumentName: result.instrumentName,
        executedQuantity: result.executedQuantity,
        executedPrice: result.executedPrice
      },
      timestamp: new Date().toISOString(),
      requestId
    };

    if (!result.success) {
      response.error = result.error;
      console.error(`❌ [${requestId}] Trading failed:`, result.error);
      return res.status(500).json(response);
    }

    console.log(`✅ [${requestId}] Trading successful:`, result);
    res.json(response);

  } catch (error) {
    console.error(`💥 [${requestId}] Webhook processing error:`, error);
    
    const errorResponse: WebhookResponse = {
      success: false,
      message: 'Internal server error processing webhook',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      requestId
    };

    res.status(500).json(errorResponse);
  }
});

// Trading service status
app.get('/api/trading/status', async (req, res) => {
  try {
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
app.get('/api/options/:currency/delta/:delta', async (req, res) => {
  try {
    const { currency, delta } = req.params;
    const { minExpiredDays = '7', longSide = 'true' } = req.query;

    // 验证参数
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

    // 调用期权筛选服务
    let result;
    if (useMockMode) {
      result = await mockClient.getInstrumentByDelta(currency.toUpperCase(), minExpiredDaysValue, deltaValue, longSideValue);
    } else {
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

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Using test environment: ${process.env.USE_TEST_ENVIRONMENT || 'true'}`);
});

export default app;