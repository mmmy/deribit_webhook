import { Router } from 'express';
import { 
  ConfigLoader, 
  OptionTradingService, 
  WebhookResponse, 
  WebhookSignalPayload 
} from '../services';
import { getConfigLoader, getOptionTradingService } from '../core';
import { validateAccountFromBody } from '../middleware/account-validation';

const router = Router();

// TradingView Webhook Signal
router.post('/webhook/signal', validateAccountFromBody('accountName'), async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    console.log(`📡 [${requestId}] Received webhook signal:`, req.body);

    // 1. Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        timestamp: new Date().toISOString(),
        requestId
      } as WebhookResponse);
    }

    const payload = req.body as WebhookSignalPayload;

    // 2. Validate required fields
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

    // 3. Account validation is now handled by middleware
    // req.validatedAccount contains the validated account
    
    // 4. Process trading signal
    console.log(`🔄 [${requestId}] Processing signal for account: ${payload.accountName}`);
    const optionTradingService = getOptionTradingService();
    const result = await optionTradingService.processWebhookSignal(payload);

    // 5. Return result
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

export { router as webhookRoutes };