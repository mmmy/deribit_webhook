import { Router } from 'express';
import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { tradingRoutes } from './trading';
import { webhookRoutes } from './webhook';
import { deltaRoutes } from './delta';
import { logRoutes } from './logs';
import { positionsRoutes } from './positions';

const router = Router();

// Health and status routes
router.use('/', healthRoutes);

// Authentication routes
router.use('/', authRoutes);

// Trading and instruments routes
router.use('/', tradingRoutes);

// Webhook routes
router.use('/', webhookRoutes);

// Delta management routes
router.use('/', deltaRoutes);

// Log management routes
router.use('/', logRoutes);

// Position polling routes
router.use('/', positionsRoutes);

export { router as routes };