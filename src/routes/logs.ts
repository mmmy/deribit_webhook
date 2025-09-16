import { Router } from 'express';
import path from 'path';
import { LogManager } from '../services';

const router = Router();

// Log query page route
router.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/logs.html'));
});

// Log query API endpoint
router.get('/api/logs', async (req, res) => {
  try {
    const {
      startTime,
      endTime,
      maxRecords = '200',
      level,
      keyword
    } = req.query;

    // Parameter validation
    const maxRecordsNum = parseInt(maxRecords as string);
    if (isNaN(maxRecordsNum) || maxRecordsNum < 1 || maxRecordsNum > 5000) {
      return res.status(400).json({
        success: false,
        message: 'maxRecords must be a number between 1-1000',
        timestamp: new Date().toISOString()
      });
    }

    // Time validation
    if (startTime && isNaN(Date.parse(startTime as string))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid start time format',
        timestamp: new Date().toISOString()
      });
    }

    if (endTime && isNaN(Date.parse(endTime as string))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid end time format',
        timestamp: new Date().toISOString()
      });
    }

    // Query logs
    const logManager = LogManager.getInstance();
    const logs = await logManager.queryLogs({
      startTime: startTime as string,
      endTime: endTime as string,
      maxRecords: maxRecordsNum,
      level: level as string,
      keyword: keyword as string
    });

    // Get statistics
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
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Log query failed:', error);
    res.status(500).json({
      success: false,
      message: 'Log query failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export { router as logRoutes };
