import { Router } from 'express';
import { PollingManager } from '../polling/polling-manager';
import { ConfigLoader } from '../services';

const router = Router();

// Create a single polling manager instance
const pollingManager = new PollingManager();

// Manual trigger for position polling
router.post('/api/positions/poll', async (req, res) => {
  try {
    console.log('📡 Manual positions polling triggered via API');

    const results = await pollingManager.triggerPolling();

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

// Get polling status
router.get('/api/positions/polling-status', (req, res) => {
  try {
    const status = pollingManager.getStatus();
    const configLoader = ConfigLoader.getInstance();
    
    res.json({
      success: true,
      data: {
        ...status,
        enabledAccounts: configLoader.getEnabledAccounts().map(a => a.name)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get polling status',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Start polling
router.post('/api/positions/start-polling', (req, res) => {
  try {
    if (pollingManager.isActive()) {
      return res.json({
        success: false,
        message: 'Polling is already active',
        data: pollingManager.getStatus(),
        timestamp: new Date().toISOString()
      });
    }

    console.log('📡 Manual start polling triggered via API');
    const started = pollingManager.startPolling();

    if (started) {
      res.json({
        success: true,
        message: 'Positions polling started successfully',
        data: pollingManager.getStatus(),
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to start polling',
        timestamp: new Date().toISOString()
      });
    }
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

// Stop polling
router.post('/api/positions/stop-polling', (req, res) => {
  try {
    if (!pollingManager.isActive()) {
      return res.json({
        success: false,
        message: 'Polling is not active',
        data: pollingManager.getStatus(),
        timestamp: new Date().toISOString()
      });
    }

    console.log('📡 Manual stop polling triggered via API');
    const stopped = pollingManager.stopPolling();

    if (stopped) {
      res.json({
        success: true,
        message: 'Positions polling stopped successfully',
        data: pollingManager.getStatus(),
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to stop polling',
        timestamp: new Date().toISOString()
      });
    }
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

// Export both the router and the polling manager for server startup
export { router as positionsRoutes, pollingManager };