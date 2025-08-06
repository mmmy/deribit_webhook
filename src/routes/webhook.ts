import { Router } from 'express';
import { getOptionTradingService } from '../core';
import { validateAccountFromBody } from '../middleware/account-validation';
import {
  WebhookSignalPayload
} from '../services';
import { ApiResponse } from '../utils/response-formatter';

const router = Router();

// TradingView Webhook Signal
router.post('/webhook/signal', validateAccountFromBody('accountName'), async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`📡 [${requestId}] Received webhook signal:`, req.body);

    // 1. Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return ApiResponse.badRequest(res, 'Invalid request body', { meta: { requestId } });
    }

    const payload = req.body as WebhookSignalPayload;

    // 2. Validate required fields
    const requiredFields = ['accountName', 'side', 'symbol', 'size', 'qtyType'];
    const missingFields = requiredFields.filter(field => !payload[field as keyof WebhookSignalPayload]);

    if (missingFields.length > 0) {
      return ApiResponse.badRequest(res, `Missing required fields: ${missingFields.join(', ')}`, { meta: { requestId } });
    }

    // 3. Account validation is now handled by middleware
    // req.validatedAccount contains the validated account
    
    // 4. Process trading signal
    console.log(`🔄 [${requestId}] Processing signal for account: ${payload.accountName}`);
    const optionTradingService = getOptionTradingService();
    const result = await optionTradingService.processWebhookSignal(payload);

    if (!result.success) {
      console.error(`❌ [${requestId}] Trading failed:`, result.error || result.message);
      return ApiResponse.internalError(res, result.error || 'Trading operation failed', {
        meta: {
          requestId,
          orderId: result.orderId,
          instrumentName: result.instrumentName,
          executedQuantity: result.executedQuantity,
          executedPrice: result.executedPrice
        }
      });
    }

    console.log(`✅ [${requestId}] Trading successful:`, result);
    return ApiResponse.ok(res, {
      orderId: result.orderId,
      instrumentName: result.instrumentName,
      executedQuantity: result.executedQuantity,
      executedPrice: result.executedPrice
    }, { message: result.message, meta: { requestId } });

  } catch (error) {
    console.error(`💥 [${requestId}] Webhook processing error:`, error);

    return ApiResponse.internalError(res, error instanceof Error ? error.message : 'Unknown error', { meta: { requestId } });
  }
});

export { router as webhookRoutes };
