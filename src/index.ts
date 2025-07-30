import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from './api';
import { CreateDeltaRecordInput, DeltaManager, DeltaRecordType } from './database';
import { ConfigLoader, DeribitAuth, DeribitClient, MockDeribitClient, OptionTradingService, WebhookResponse, WebhookSignalPayload } from './services';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
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
const deltaManager = DeltaManager.getInstance();

// Determine if we should use mock mode (when network is unavailable)
const useMockMode = process.env.USE_MOCK_MODE === 'true';

// 静态文件服务
app.use(express.static('public'));

// Delta管理页面路由
app.get('/delta/:accountId', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/delta-manager.html'));
});

app.get('/delta', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/delta-manager.html'));
});

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
        tokenType: authResult.result.token_type,
        expiresIn: authResult.result.expires_in
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

// Get account positions endpoint - 获取账户仓位列表
app.get('/api/account/:accountName/:currency', async (req, res) => {
  try {
    const { accountName, currency } = req.params;
    const currencyUpper = currency.toUpperCase();
    
    // 验证账户
    const account = configLoader.getAccountByName(accountName);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountName}`
      });
    }

    if (useMockMode) {
      // Mock模式：返回模拟数据
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
        }
      });
    } else {
      // 真实模式：调用Deribit API
      try {
        // 获取认证token
        await deribitAuth.authenticate(accountName);
        const tokenInfo = deribitAuth.getTokenInfo(accountName);
        
        if (!tokenInfo) {
          throw new Error('Authentication failed');
        }

        // 配置API
        const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
        const apiConfig = getConfigByEnvironment(isTestEnv);
        const authInfo = createAuthInfo(tokenInfo.accessToken);

        // 创建私有API实例
        const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

        // 并行请求账户摘要和持仓信息
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
          error: authError instanceof Error ? authError.message : 'Unknown auth error'
        });
      }
    }
  } catch (error) {
    console.error('Error in account positions endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get account positions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ===== WEBHOOK ENDPOINTS =====

// TradingView Webhook Signal
app.post('/webhook/signal', async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
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



// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ===== Delta管理API路由 =====

// 获取账户的Delta记录列表
app.get('/api/delta/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    // 验证账户是否存在
    const account = configLoader.getAccountByName(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountId}`
      });
    }

    // 获取Delta记录
    const records = deltaManager.getRecords({ account_id: accountId });

    // 获取账户汇总
    const summary = deltaManager.getAccountSummary(accountId);

    res.json({
      success: true,
      accountId,
      records,
      summary: summary[0] || {
        account_id: accountId,
        total_delta: 0,
        position_delta: 0,
        order_delta: 0,
        record_count: 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delta records',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 获取账户的实际仓位和未成交订单
app.get('/api/delta/:accountId/live-data', async (req, res) => {
  try {
    const { accountId } = req.params;
    const currency = (req.query.currency as string) || 'BTC';

    console.log(`🎯 Live data request: accountId=${accountId}, currency=${currency}, mockMode=${useMockMode}`);

    // 验证账户是否存在
    const account = configLoader.getAccountByName(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountId}`
      });
    }

    let positions = [];
    let openOrders = [];

    if (useMockMode) {
      console.log(`🎭 Using mock mode for ${accountId}`);
      // Mock模式：返回模拟数据
      positions = [
        {
          instrument_name: `${currency}-8AUG25-113000-C`,
          size: 10.5,
          direction: 'buy',
          average_price: 0.025,
          mark_price: 0.028,
          unrealized_pnl: 0.315,
          delta: 0.65
        }
      ];

      openOrders = [
        {
          order_id: 'mock_order_123',
          instrument_name: `${currency}-15AUG25-90000-P`,
          direction: 'sell',
          amount: 5.0,
          price: 0.015,
          order_type: 'limit',
          delta: -0.35
        }
      ];
    } else {
      // 真实模式：调用Deribit API
      console.log(`🔗 Using real Deribit API for ${accountId}`);
      try {
        console.log(`🔐 Authenticating account: ${accountId}`);
        await deribitAuth.authenticate(accountId);
        const tokenInfo = deribitAuth.getTokenInfo(accountId);

        if (!tokenInfo) {
          throw new Error('Authentication failed - no token info');
        }

        console.log(`✅ Authentication successful for ${accountId}`);

        const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
        const apiConfig = getConfigByEnvironment(isTestEnv);
        const authInfo = createAuthInfo(tokenInfo.accessToken);

        console.log(`🌐 Using ${isTestEnv ? 'TEST' : 'PRODUCTION'} environment: ${apiConfig.baseUrl}`);

        const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

        console.log(`📊 Fetching positions and orders for ${currency.toUpperCase()}`);

        // 并行获取仓位和未成交订单
        const [positionsResult, ordersResult] = await Promise.all([
          privateAPI.getPositions({ currency: currency.toUpperCase() }),
          privateAPI.getOpenOrders({ currency: currency.toUpperCase() })
        ]);

        positions = positionsResult || [];
        openOrders = ordersResult || [];

        console.log(`✅ Retrieved ${positions.length} positions and ${openOrders.length} open orders`);

      } catch (error) {
        console.error('Failed to get live data from Deribit, falling back to mock data:', error);

        // 回退到Mock数据
        positions = [
          {
            instrument_name: `${currency}-8AUG25-113000-C`,
            size: 10.5,
            direction: 'buy',
            average_price: 0.025,
            mark_price: 0.028,
            unrealized_pnl: 0.315,
            delta: 0.65
          }
        ];

        openOrders = [
          {
            order_id: 'fallback_order_123',
            instrument_name: `${currency}-15AUG25-90000-P`,
            direction: 'sell',
            amount: 5.0,
            price: 0.015,
            order_type: 'limit',
            delta: -0.35
          }
        ];
      }
    }

    res.json({
      success: true,
      accountId,
      currency,
      mockMode: useMockMode,
      data: {
        positions,
        openOrders
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get live data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 创建或更新Delta记录
app.post('/api/delta/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { instrument_name, delta, target_delta, move_position_delta, tv_id, record_type, order_id } = req.body;

    // 为了向后兼容，如果只提供了delta字段，将其作为target_delta使用
    const finalTargetDelta = target_delta !== undefined ? target_delta : delta;
    const finalMovePositionDelta = move_position_delta !== undefined ? move_position_delta : 0;

    // 验证必需字段 (tv_id现在是可选的)
    if (!instrument_name || finalTargetDelta === undefined || !record_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: instrument_name, target_delta (or delta), record_type'
      });
    }

    // 验证账户是否存在
    const account = configLoader.getAccountByName(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountId}`
      });
    }

    // 创建Delta记录
    const recordInput: CreateDeltaRecordInput = {
      account_id: accountId,
      instrument_name,
      target_delta: parseFloat(finalTargetDelta),
      move_position_delta: parseFloat(finalMovePositionDelta),
      tv_id: tv_id ? parseInt(tv_id) : null,
      record_type: record_type as DeltaRecordType,
      order_id: order_id || undefined
    };

    const record = deltaManager.upsertRecord(recordInput);

    res.json({
      success: true,
      message: 'Delta record created/updated successfully',
      record
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create/update delta record',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 更新Delta记录
app.put('/api/delta/:accountId/:recordId', async (req, res) => {
  try {
    const { accountId, recordId } = req.params;
    const { target_delta, move_position_delta, tv_id, order_id } = req.body;

    // 验证账户是否存在
    const account = configLoader.getAccountByName(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountId}`
      });
    }

    // 验证记录是否属于该账户
    const existingRecord = deltaManager.getRecordById(parseInt(recordId));
    if (!existingRecord || existingRecord.account_id !== accountId) {
      return res.status(404).json({
        success: false,
        message: 'Record not found or does not belong to this account'
      });
    }

    // 更新记录
    const updateData: any = {};
    if (target_delta !== undefined) updateData.target_delta = parseFloat(target_delta);
    if (move_position_delta !== undefined) updateData.move_position_delta = parseFloat(move_position_delta);
    if (tv_id !== undefined) updateData.tv_id = tv_id ? parseInt(tv_id) : null;
    if (order_id !== undefined) updateData.order_id = order_id;

    const updatedRecord = deltaManager.updateRecord(parseInt(recordId), updateData);

    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: 'Failed to update record'
      });
    }

    res.json({
      success: true,
      message: 'Delta record updated successfully',
      record: updatedRecord
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update delta record',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 删除Delta记录
app.delete('/api/delta/:accountId/:recordId', async (req, res) => {
  try {
    const { accountId, recordId } = req.params;

    // 验证账户是否存在
    const account = configLoader.getAccountByName(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `Account not found: ${accountId}`
      });
    }

    // 验证记录是否属于该账户
    const existingRecord = deltaManager.getRecordById(parseInt(recordId));
    if (!existingRecord || existingRecord.account_id !== accountId) {
      return res.status(404).json({
        success: false,
        message: 'Record not found or does not belong to this account'
      });
    }

    // 删除记录
    const deleted = deltaManager.deleteRecord(parseInt(recordId));

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Failed to delete record'
      });
    }

    res.json({
      success: true,
      message: 'Delta record deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete delta record',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Deribit Options Trading Microservice running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Test Environment: ${process.env.USE_TEST_ENVIRONMENT || 'true'}`);
  console.log(`🎭 Mock Mode: ${useMockMode}`);
  console.log(`📁 Config File: ${process.env.API_KEY_FILE || './config/apikeys.yml'}`);
  console.log(`🌐 Health Check: http://localhost:${port}/health`);
  console.log(`📡 Webhook Endpoint: http://localhost:${port}/webhook/signal`);
  console.log(`🎯 Delta Manager: http://localhost:${port}/delta`);

  // 显示配置的账户
  const accounts = configLoader.getEnabledAccounts();
  console.log(`👥 Enabled Accounts: ${accounts.map(a => a.name).join(', ')}`);
});

export default app;