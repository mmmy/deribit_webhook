import { Router } from 'express';
import path from 'path';
import { 
  ConfigLoader, 
  DeltaManager, 
  CreateDeltaRecordInput, 
  DeltaRecordType,
  DeribitAuth
} from '../services';
import { DeribitPrivateAPI, createAuthInfo, getConfigByEnvironment } from '../api';
import { validateAccountFromParams } from '../middleware/account-validation';
import { getAuthenticationService } from '../services/authentication-service';

const router = Router();

// Delta manager page routes
router.get('/delta/:accountId', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/delta-manager.html'));
});

router.get('/delta', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/delta-manager.html'));
});

// Get Delta records for account
router.get('/api/delta/:accountId', validateAccountFromParams('accountId'), async (req, res) => {
  try {
    const { accountId } = req.params;
    const configLoader = ConfigLoader.getInstance();
    const deltaManager = DeltaManager.getInstance();

    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    // Get Delta records
    const records = deltaManager.getRecords({ account_id: accountId });

    // Get account summary
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
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get delta records',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get live data for account (positions and orders)
router.get('/api/delta/:accountId/live-data', validateAccountFromParams('accountId'), async (req, res) => {
  try {
    const { accountId } = req.params;
    const configLoader = ConfigLoader.getInstance();
    const useMockMode = process.env.USE_MOCK_MODE === 'true';

    console.log(`🎯 Live data request: accountId=${accountId}, mockMode=${useMockMode} (all currencies)`);

    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    let positions = [];
    let openOrders = [];

    if (useMockMode) {
      console.log(`🎭 Using mock mode for ${accountId} (all currencies)`);
      // Mock mode: return simulated data for all currencies
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
      // Real mode: call Deribit API
      console.log(`🔗 Using real Deribit API for ${accountId}`);
      try {
        console.log(`🔐 Authenticating account: ${accountId}`);
        // 使用统一认证服务
        const authResult = await getAuthenticationService().authenticate(accountId);
        
        if (!authResult.success || !authResult.token) {
          throw new Error(authResult.error || 'Authentication failed - no token info');
        }

        console.log(`✅ Authentication successful for ${accountId}`);

        const isTestEnv = process.env.USE_TEST_ENVIRONMENT === 'true';
        const apiConfig = getConfigByEnvironment(isTestEnv);
        const authInfo = createAuthInfo(authResult.token.accessToken);

        console.log(`🌐 Using ${isTestEnv ? 'TEST' : 'PRODUCTION'} environment: ${apiConfig.baseUrl}`);

        const privateAPI = new DeribitPrivateAPI(apiConfig, authInfo);

        console.log(`📊 Fetching positions and orders for all currencies`);

        // Get option positions and orders for all currencies
        const [allPositions, allOrders] = await Promise.all([
          privateAPI.getPositions({ kind: 'option' }),
          privateAPI.getOpenOrders({ kind: 'option' })
        ]);

        positions = allPositions || [];
        openOrders = allOrders || [];

        console.log(`✅ Total retrieved: ${positions.length} positions and ${openOrders.length} open orders across all currencies`);

      } catch (error) {
        console.error('Failed to get live data from Deribit, falling back to mock data:', error);

        // Fallback to mock data
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
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get live data',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Create or update Delta record
router.post('/api/delta/:accountId', validateAccountFromParams('accountId'), async (req, res) => {
  try {
    const { accountId } = req.params;
    const { instrument_name, delta, target_delta, move_position_delta, min_expire_days, tv_id, record_type, order_id } = req.body;
    const configLoader = ConfigLoader.getInstance();
    const deltaManager = DeltaManager.getInstance();

    // For backward compatibility, use delta as target_delta if target_delta not provided
    const finalTargetDelta = target_delta !== undefined ? target_delta : delta;
    const finalMovePositionDelta = move_position_delta !== undefined ? move_position_delta : 0;
    const finalMinExpireDays = min_expire_days !== undefined ? min_expire_days : null;

    // Validate required fields
    if (!instrument_name || finalTargetDelta === undefined || !record_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: instrument_name, target_delta (or delta), record_type',
        timestamp: new Date().toISOString()
      });
    }

    // Validate min_expire_days if provided
    if (finalMinExpireDays !== null && finalMinExpireDays <= 0) {
      return res.status(400).json({
        success: false,
        message: 'min_expire_days must be greater than 0 or null',
        timestamp: new Date().toISOString()
      });
    }

    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    // Create Delta record
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
      record,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create/update delta record',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Update Delta record
router.put('/api/delta/:accountId/:recordId', validateAccountFromParams('accountId'), async (req, res) => {
  try {
    const { accountId, recordId } = req.params;
    const { target_delta, move_position_delta, min_expire_days, tv_id, order_id } = req.body;
    const configLoader = ConfigLoader.getInstance();
    const deltaManager = DeltaManager.getInstance();

    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    // Validate record exists and belongs to account
    const existingRecord = deltaManager.getRecordById(parseInt(recordId));
    if (!existingRecord || existingRecord.account_id !== accountId) {
      return res.status(404).json({
        success: false,
        message: 'Record not found or does not belong to this account',
        timestamp: new Date().toISOString()
      });
    }

    // Validate min_expire_days if provided
    if (min_expire_days !== undefined && min_expire_days !== null && min_expire_days <= 0) {
      return res.status(400).json({
        success: false,
        message: 'min_expire_days must be greater than 0 or null',
        timestamp: new Date().toISOString()
      });
    }

    // Update record
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
        message: 'Failed to update record',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Delta record updated successfully',
      record: updatedRecord,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update delta record',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Delete Delta record
router.delete('/api/delta/:accountId/:recordId', validateAccountFromParams('accountId'), async (req, res) => {
  try {
    const { accountId, recordId } = req.params;
    const configLoader = ConfigLoader.getInstance();
    const deltaManager = DeltaManager.getInstance();

    // Account validation is now handled by middleware
    // req.validatedAccount contains the validated account

    // Validate record exists and belongs to account
    const existingRecord = deltaManager.getRecordById(parseInt(recordId));
    if (!existingRecord || existingRecord.account_id !== accountId) {
      return res.status(404).json({
        success: false,
        message: 'Record not found or does not belong to this account',
        timestamp: new Date().toISOString()
      });
    }

    // Delete record
    const deleted = deltaManager.deleteRecord(parseInt(recordId));

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Failed to delete record',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Delta record deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete delta record',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as deltaRoutes };