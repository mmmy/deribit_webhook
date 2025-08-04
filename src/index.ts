import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from './api';
import { CreateDeltaRecordInput, DeltaManager, DeltaRecordType } from './database';
import { ConfigLoader, DeribitAuth, DeribitClient, LogManager, MockDeribitClient, OptionTradingService, WebhookResponse, WebhookSignalPayload } from './services';
import { executePositionAdjustment } from './services/position-adjustment';

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
const logManager = LogManager.getInstance();

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

// 日志查询页面路由
app.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/logs.html'));
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
    accounts: accounts.map(acc => ({ name: acc.name, enabled: true })),
    testEnvironment: process.env.USE_TEST_ENVIRONMENT || 'true'
  });
});

// 日志查询接口
app.get('/api/logs', async (req, res) => {
  try {
    const {
      startTime,
      endTime,
      maxRecords = '200',
      level,
      keyword
    } = req.query;

    // 参数验证
    const maxRecordsNum = parseInt(maxRecords as string);
    if (isNaN(maxRecordsNum) || maxRecordsNum < 1 || maxRecordsNum > 1000) {
      return res.status(400).json({
        success: false,
        message: '最大条数必须是1-1000之间的数字'
      });
    }

    // 时间验证
    if (startTime && isNaN(Date.parse(startTime as string))) {
      return res.status(400).json({
        success: false,
        message: '开始时间格式无效'
      });
    }

    if (endTime && isNaN(Date.parse(endTime as string))) {
      return res.status(400).json({
        success: false,
        message: '结束时间格式无效'
      });
    }

    // 查询日志
    const logs = await logManager.queryLogs({
      startTime: startTime as string,
      endTime: endTime as string,
      maxRecords: maxRecordsNum,
      level: level as string,
      keyword: keyword as string
    });

    // 获取统计信息
    const stats = await logManager.getLogStats();

    res.json({
      success: true,
      data: {
        logs,
        stats,
        query: {
          startTime,
          endTime,
          maxRecords: maxRecordsNum,
          level,
          keyword,
          resultCount: logs.length
        }
      }
    });

  } catch (error) {
    console.error('❌ 查询日志失败:', error);
    res.status(500).json({
      success: false,
      message: '查询日志失败',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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

// Get single instrument endpoint
app.get('/api/instrument/:instrumentName', async (req, res) => {
  try {
    const instrumentName = req.params.instrumentName;

    if (!instrumentName) {
      return res.status(400).json({
        success: false,
        message: 'Instrument name is required'
      });
    }

    if (useMockMode) {
      const instrument = await mockClient.getInstrument(instrumentName);
      res.json({
        success: true,
        mockMode: true,
        instrumentName,
        instrument
      });
    } else {
      const instrument = await deribitClient.getInstrument(instrumentName);
      res.json({
        success: true,
        mockMode: false,
        instrumentName,
        instrument
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get instrument',
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
    const requiredFields = ['accountName', 'side', 'symbol', 'size', 'qtyType'];
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
  stopPositionsPolling();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  stopPositionsPolling();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  stopPositionsPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  stopPositionsPolling();
  process.exit(0);
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

// 获取账户的实际仓位和未成交订单（所有品种期权）
app.get('/api/delta/:accountId/live-data', async (req, res) => {
  try {
    const { accountId } = req.params;

    console.log(`🎯 Live data request: accountId=${accountId}, mockMode=${useMockMode} (all currencies)`);

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
      console.log(`🎭 Using mock mode for ${accountId} (all currencies)`);
      // Mock模式：返回所有品种期权的模拟数据
      positions = [
        {
          instrument_name: 'BTC-8AUG25-113000-C',
          size: 10.5,
          direction: 'buy',
          average_price: 0.025,
          mark_price: 0.028,
          unrealized_pnl: 0.315,
          delta: 0.65
        },
        {
          instrument_name: 'ETH-8AUG25-3500-P',
          size: -5.0,
          direction: 'sell',
          average_price: 0.018,
          mark_price: 0.015,
          unrealized_pnl: 0.15,
          delta: -0.42
        },
        {
          instrument_name: 'SOL-8AUG25-200-C',
          size: 20.0,
          direction: 'buy',
          average_price: 0.012,
          mark_price: 0.014,
          unrealized_pnl: 0.04,
          delta: 0.38
        }
      ];

      openOrders = [
        {
          order_id: 'mock_order_123',
          instrument_name: 'BTC-15AUG25-90000-P',
          direction: 'sell',
          amount: 5.0,
          price: 0.015,
          order_type: 'limit',
          delta: -0.35
        },
        {
          order_id: 'mock_order_456',
          instrument_name: 'ETH-15AUG25-4000-C',
          direction: 'buy',
          amount: 8.0,
          price: 0.022,
          order_type: 'limit',
          delta: 0.58
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

        console.log(`📊 Fetching positions and orders for all currencies`);

        // 获取所有货币的期权仓位和订单（不指定currency参数）
        const [allPositions, allOrders] = await Promise.all([
          privateAPI.getPositions({ kind: 'option' }),
          privateAPI.getOpenOrders({ kind: 'option' })
        ]);

        positions = allPositions || [];
        openOrders = allOrders || [];

        console.log(`✅ Total retrieved: ${positions.length} positions and ${openOrders.length} open orders across all currencies`);

      } catch (error) {
        console.error('Failed to get live data from Deribit, falling back to mock data:', error);

        // 回退到Mock数据（所有品种）
        positions = [
          {
            instrument_name: 'BTC-8AUG25-113000-C',
            size: 10.5,
            direction: 'buy',
            average_price: 0.025,
            mark_price: 0.028,
            unrealized_pnl: 0.315,
            delta: 0.65
          },
          {
            instrument_name: 'ETH-8AUG25-3500-P',
            size: -5.0,
            direction: 'sell',
            average_price: 0.018,
            mark_price: 0.015,
            unrealized_pnl: 0.15,
            delta: -0.42
          }
        ];

        openOrders = [
          {
            order_id: 'fallback_order_123',
            instrument_name: 'BTC-15AUG25-90000-P',
            direction: 'sell',
            amount: 5.0,
            price: 0.015,
            order_type: 'limit',
            delta: -0.35
          },
          {
            order_id: 'fallback_order_456',
            instrument_name: 'ETH-15AUG25-4000-C',
            direction: 'buy',
            amount: 8.0,
            price: 0.022,
            order_type: 'limit',
            delta: 0.58
          }
        ];
      }
    }

    res.json({
      success: true,
      accountId,
      currencies: ['BTC', 'ETH', 'SOL'],
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
    const { instrument_name, delta, target_delta, move_position_delta, min_expire_days, tv_id, record_type, order_id } = req.body;

    // 为了向后兼容，如果只提供了delta字段，将其作为target_delta使用
    const finalTargetDelta = target_delta !== undefined ? target_delta : delta;
    const finalMovePositionDelta = move_position_delta !== undefined ? move_position_delta : 0;
    const finalMinExpireDays = min_expire_days !== undefined ? min_expire_days : null;

    // 验证必需字段 (tv_id现在是可选的)
    if (!instrument_name || finalTargetDelta === undefined || !record_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: instrument_name, target_delta (or delta), record_type'
      });
    }

    // 验证min_expire_days如果不为null必须大于0
    if (finalMinExpireDays !== null && finalMinExpireDays <= 0) {
      return res.status(400).json({
        success: false,
        message: 'min_expire_days must be greater than 0 or null'
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
      min_expire_days: finalMinExpireDays !== null ? parseInt(finalMinExpireDays) : null,
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
    const { target_delta, move_position_delta, min_expire_days, tv_id, order_id } = req.body;

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

    // 验证min_expire_days如果提供的话必须大于0或为null
    if (min_expire_days !== undefined && min_expire_days !== null && min_expire_days <= 0) {
      return res.status(400).json({
        success: false,
        message: 'min_expire_days must be greater than 0 or null'
      });
    }

    // 更新记录
    const updateData: any = {};
    if (target_delta !== undefined) updateData.target_delta = parseFloat(target_delta);
    if (move_position_delta !== undefined) updateData.move_position_delta = parseFloat(move_position_delta);
    if (min_expire_days !== undefined) updateData.min_expire_days = min_expire_days !== null ? parseInt(min_expire_days) : null;
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

// ===== 仓位轮询API =====

// 手动触发仓位轮询
app.post('/api/positions/poll', async (req, res) => {
  try {
    console.log('📡 Manual positions polling triggered via API');

    const results = await pollAllAccountsPositions();

    res.json({
      success: true,
      message: 'Positions polling completed successfully',
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Manual polling failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to poll positions',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// 获取轮询状态
app.get('/api/positions/polling-status', (req, res) => {
  res.json({
    success: true,
    data: {
      isActive: pollingInterval !== null,
      intervalMinutes: 15,
      nextPollEstimate: pollingInterval ?
        new Date(Date.now() + 15 * 60 * 1000).toISOString() :
        null,
      enabledAccounts: configLoader.getEnabledAccounts().map(a => a.name)
    },
    timestamp: new Date().toISOString()
  });
});

// 启动轮询
app.post('/api/positions/start-polling', (req, res) => {
  try {
    if (pollingInterval !== null) {
      return res.json({
        success: false,
        message: 'Polling is already active',
        data: {
          isActive: true,
          intervalMinutes: 15
        },
        timestamp: new Date().toISOString()
      });
    }

    console.log('📡 Manual start polling triggered via API');
    startPositionsPolling();

    res.json({
      success: true,
      message: 'Positions polling started successfully',
      data: {
        isActive: true,
        intervalMinutes: 15,
        nextPollEstimate: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to start polling:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start polling',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// 停止轮询
app.post('/api/positions/stop-polling', (req, res) => {
  try {
    if (pollingInterval === null) {
      return res.json({
        success: false,
        message: 'Polling is not active',
        data: {
          isActive: false
        },
        timestamp: new Date().toISOString()
      });
    }

    console.log('📡 Manual stop polling triggered via API');
    stopPositionsPolling();

    res.json({
      success: true,
      message: 'Positions polling stopped successfully',
      data: {
        isActive: false,
        intervalMinutes: 15
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to stop polling:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop polling',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// ===== 仓位调整功能 =====

// executePositionAdjustment函数已迁移到 src/services/position-adjustment.ts

// ===== 定时轮询功能 =====

/**
 * 轮询所有启用账户的期权仓位
 */
async function pollAllAccountsPositions() {
  const requestId = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  try {
    console.log(`🔄 [${requestId}] Starting positions polling for all enabled accounts`);

    const accounts = configLoader.getEnabledAccounts();
    if (accounts.length === 0) {
      console.log(`⚠️ [${requestId}] No enabled accounts found for polling`);
      return;
    }

    const currencies = ['BTC', 'ETH', 'SOL'];
    const results = [];

    for (const account of accounts) {
      try {
        console.log(`📊 [${requestId}] Polling account: ${account.name}`);

        if (useMockMode) {
          // Mock模式：生成模拟数据（直接生成仓位数组，与真实API保持一致）
          const mockPositions = currencies.map(currency => ({
            instrument_name: `${currency}-8AUG25-${currency === 'BTC' ? '113000' : currency === 'ETH' ? '3500' : '200'}-C`,
            size: Math.random() * 20 - 10, // -10 到 10 之间的随机数
            direction: Math.random() > 0.5 ? 'buy' : 'sell',
            average_price: Math.random() * 0.05,
            mark_price: Math.random() * 0.05,
            unrealized_pnl: (Math.random() - 0.5) * 2,
            delta: (Math.random() - 0.5) * 2
          })).filter(pos => pos.size !== 0); // 只保留非零仓位

          results.push({
            accountName: account.name,
            success: true,
            mockMode: true,
            data: mockPositions,
            timestamp: new Date().toISOString()
          });

          console.log(`✅ [${requestId}] Mock data generated for ${account.name}: ${mockPositions.length} positions`);
        } else {
          // 真实模式：调用Deribit API
          await deribitAuth.authenticate(account.name);
          const tokenInfo = deribitAuth.getTokenInfo(account.name);

          if (!tokenInfo) {
            throw new Error(`Authentication failed for ${account.name}`);
          }

          const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
          const apiConfig = getConfigByEnvironment(isTestEnv);
          const authInfo = createAuthInfo(tokenInfo.accessToken);
          const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

          // 获取所有期权仓位（不指定货币，返回所有货币的期权）
          const allPositions = await privateAPI.getPositions({
            kind: 'option'
          });

          // 只保留有仓位的记录（size != 0）
          const activePositions = allPositions.filter(pos => pos.size !== 0);
          // 分析仓位delta并查询数据库记录
          for (const pos of activePositions) {
            try {
              // 1. 计算仓位delta = pos.delta / pos.size
              const positionDelta = pos.delta && pos.size !== 0 ? pos.delta / pos.size : 0;

              // 2. 根据pos查询Delta数据库记录
              const deltaRecords = deltaManager.getRecords({
                account_id: account.name,
                instrument_name: pos.instrument_name
              });

              if (deltaRecords.length > 0) {
                // 找到最新的记录
                const latestRecord = deltaRecords.sort((a, b) => {
                  const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                  const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                  return timeB - timeA;
                })[0];

                if (latestRecord.min_expire_days != null && latestRecord.move_position_delta !== undefined) {
                  const targetDeltaAbs = Math.abs(latestRecord.target_delta || 0);
                  const positionDeltaAbs = Math.abs(positionDelta);

                  // 4. 如果move_position_delta的绝对值 < 仓位delta的绝对值，打印仓位信息
                  if (targetDeltaAbs < positionDeltaAbs) {
                    console.log(`📊 [${requestId}] Position Delta Analysis - ${account.name}:`);
                    console.log(`   🎯 Instrument: ${pos.instrument_name}`);
                    console.log(`   📈 Position Size: ${pos.size}`);
                    console.log(`   🔢 Position Delta: ${pos.delta?.toFixed(4) || 'N/A'}`);
                    console.log(`   📐 Delta per Unit: ${positionDelta.toFixed(4)}`);
                    console.log(`   🎯 Target Delta: ${latestRecord.target_delta}`);
                    console.log(`   📊 Move Position Delta: ${latestRecord.move_position_delta || 0}`);
                    console.log(`   ⚖️ Condition: |${latestRecord.move_position_delta || 0}| < |${positionDelta.toFixed(4)}| = ${targetDeltaAbs < positionDeltaAbs ? 'TRUE' : 'FALSE'}`);
                    console.log(`   📅 Record Created: ${latestRecord.created_at ? new Date(latestRecord.created_at).toLocaleString() : 'Unknown'}`);
                    console.log(`   🆔 Record ID: ${latestRecord.id}`);

                    // 发送开始调整的通知到企业微信
                    try {
                      const bot = configLoader.getAccountWeChatBot(account.name);
                      if (bot) {
                        const notificationContent = `🔄 **Delta 仓位调整开始**
👤 **账户**: ${account.name}
🎯 **合约**: ${pos.instrument_name}
📈 **仓位大小**: ${pos.size}
🔢 **仓位Delta**: ${pos.delta?.toFixed(4) || 'N/A'}
📐 **单位Delta**: ${positionDelta.toFixed(4)}
🎯 **目标Delta**: ${targetDeltaAbs}
📊 **移动仓位Delta**: ${latestRecord.move_position_delta || 0}
⚖️ **触发条件**: |${targetDeltaAbs || 0}| < |${positionDelta.toFixed(4)}| = ${targetDeltaAbs < positionDeltaAbs ? 'TRUE' : 'FALSE'}
📅 **记录创建时间**: ${latestRecord.created_at ? new Date(latestRecord.created_at).toLocaleString('zh-CN') : '未知'}
🆔 **记录ID**: ${latestRecord.id}
🔄 **请求ID**: ${requestId}
⏰ **开始时间**: ${new Date().toLocaleString('zh-CN')}`;

                        await bot.sendMarkdown(notificationContent);
                        console.log(`📱 [${requestId}] WeChat notification sent for account: ${account.name}`);
                      } else {
                        console.log(`⚠️ [${requestId}] WeChat Bot not configured for account: ${account.name}`);
                      }
                    } catch (error) {
                      console.error(`❌ [${requestId}] Failed to send WeChat notification for account ${account.name}:`, error);
                    }

                    // 触发仓位调整
                    const adjustmentResult = await executePositionAdjustment(
                      {
                        requestId,
                        accountName: account.name,
                        currentPosition: pos,
                        deltaRecord: latestRecord,
                        accessToken: tokenInfo.accessToken
                      },
                      {
                        deribitClient,
                        deltaManager,
                        deribitAuth
                      }
                    );

                    if (adjustmentResult.success) {
                      // 发送成功通知到企业微信
                      try {
                        const successBot = configLoader.getAccountWeChatBot(account.name);
                        if (successBot) {
                          const successContent = `✅ **Delta 仓位调整成功**

👤 **账户**: ${account.name}
📊 **调整详情**: ${adjustmentResult.oldInstrument} → ${adjustmentResult.newInstrument}
📈 **仓位变化**: ${adjustmentResult.adjustmentSummary?.oldSize} → ${adjustmentResult.adjustmentSummary?.newDirection} ${adjustmentResult.adjustmentSummary?.newQuantity}
🎯 **目标Delta**: ${adjustmentResult.adjustmentSummary?.targetDelta}
🔄 **请求ID**: ${requestId}
⏰ **完成时间**: ${new Date().toLocaleString('zh-CN')}

🎉 **调整已成功完成！**`;

                          await successBot.sendMarkdown(successContent);
                          console.log(`📱 [${requestId}] Success notification sent for account: ${account.name}`);
                        }
                      } catch (error) {
                        console.error(`❌ [${requestId}] Failed to send success notification for account ${account.name}:`, error);
                      }

                      console.log(`🎉 [${requestId}] Position adjustment completed successfully:`);
                      console.log(`   📊 ${adjustmentResult.oldInstrument} → ${adjustmentResult.newInstrument}`);
                      console.log(`   📈 Size: ${adjustmentResult.adjustmentSummary?.oldSize} → ${adjustmentResult.adjustmentSummary?.newDirection} ${adjustmentResult.adjustmentSummary?.newQuantity}`);
                      console.log(`   🎯 Target Delta: ${adjustmentResult.adjustmentSummary?.targetDelta}`);
                    } else {
                      // 发送错误通知到企业微信
                      try {
                        const errorBot = configLoader.getAccountWeChatBot(account.name);
                        if (errorBot) {
                          const errorContent = `❌ **Delta 仓位调整失败**

👤 **账户**: ${account.name}
🎯 **工具**: ${pos.instrument_name}
📈 **仓位大小**: ${pos.size}
🔢 **仓位Delta**: ${pos.delta?.toFixed(4) || 'N/A'}
🎯 **目标Delta**: ${latestRecord.target_delta}
🆔 **记录ID**: ${latestRecord.id}
🔄 **请求ID**: ${requestId}

💬 **失败原因**: ${adjustmentResult.reason}
${adjustmentResult.error ? `📋 **错误详情**: \`\`\`\n${adjustmentResult.error}\n\`\`\`` : ''}

⏰ **失败时间**: ${new Date().toLocaleString('zh-CN')}

⚠️ **请检查系统状态并手动处理**`;

                          await errorBot.sendMarkdown(errorContent);
                          console.log(`📱 [${requestId}] Error notification sent for account: ${account.name}`);
                        }
                      } catch (notificationError) {
                        console.error(`❌ [${requestId}] Failed to send error notification for account ${account.name}:`, notificationError);
                      }

                      console.log(`❌ [${requestId}] Position adjustment failed: ${adjustmentResult.reason}`);
                      if (adjustmentResult.error) {
                        console.log(`   💥 Error: ${adjustmentResult.error}`);
                      }
                    }
                  }
                } else {
                  console.log(`📝 [${requestId}] Found record for ${pos.instrument_name} but target_delta is null`);
                }
              } else {
                console.log(`📝 [${requestId}] No delta records found for ${pos.instrument_name} in account ${account.name}`);
              }

            } catch (posError) {
              console.warn(`⚠️ [${requestId}] Failed to analyze position ${pos.instrument_name}:`, posError);
            }
          }
          results.push({
            accountName: account.name,
            success: true,
            mockMode: false,
            data: activePositions,
            timestamp: new Date().toISOString()
          });

          console.log(`✅ [${requestId}] Real data fetched for ${account.name}: ${activePositions.length} active positions`);
        }

      } catch (accountError) {
        console.error(`❌ [${requestId}] Failed to poll account ${account.name}:`, accountError);
        results.push({
          accountName: account.name,
          success: false,
          error: accountError instanceof Error ? accountError.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    }

    // 汇总结果
    const successCount = results.filter(r => r.success).length;
    const totalPositions = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.data?.length || 0), 0);

    console.log(`📊 [${requestId}] Polling completed: ${successCount}/${accounts.length} accounts successful, ${totalPositions} total positions`);

    // 这里可以添加后续处理逻辑，比如：
    // 1. 将数据存储到数据库
    // 2. 计算总体风险指标
    // 3. 触发风险管理规则
    // 4. 发送通知等

    return results;

  } catch (error) {
    console.error(`💥 [${requestId}] Polling error:`, error);
    throw error;
  }
}

// 启动定时轮询
let pollingInterval: NodeJS.Timeout | null = null;

function startPositionsPolling() {
  // 从环境变量读取轮询间隔，默认15分钟
  const pollingIntervalMinutes = parseInt(process.env.POLLING_INTERVAL_MINUTES || '15', 10);
  const POLLING_INTERVAL = pollingIntervalMinutes * 60 * 1000;

  console.log(`⏰ Starting positions polling every ${pollingIntervalMinutes} minutes`);

  // 立即执行一次
  pollAllAccountsPositions().catch(error => {
    console.error('Initial polling failed:', error);
  });

  // 设置定时轮询
  pollingInterval = setInterval(() => {
    pollAllAccountsPositions().catch(error => {
      console.error('Scheduled polling failed:', error);
    });
  }, POLLING_INTERVAL);
}

function stopPositionsPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log(`⏹️ Positions polling stopped`);
  }
}

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
  console.log(`📊 Manual Polling: http://localhost:${port}/api/positions/poll`);
  console.log(`📈 Polling Status: http://localhost:${port}/api/positions/polling-status`);
  console.log(`▶️ Start Polling: http://localhost:${port}/api/positions/start-polling`);
  console.log(`⏹️ Stop Polling: http://localhost:${port}/api/positions/stop-polling`);

  // 显示配置的账户
  const accounts = configLoader.getEnabledAccounts();
  console.log(`👥 Enabled Accounts: ${accounts.map(a => a.name).join(', ')}`);

  // 检查是否自动启动轮询（默认启动）
  const autoStartPolling = process.env.AUTO_START_POLLING !== 'false';
  console.log(`🔄 Auto Start Polling: ${autoStartPolling}`);

  if (autoStartPolling) {
    // 启动定时轮询
    startPositionsPolling();
  } else {
    console.log(`⏸️ Polling not started automatically. Use POST /api/positions/start-polling to start manually.`);
  }
});

export default app;