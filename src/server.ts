import dotenv from 'dotenv';
import { createApp } from './app';
import { pollingManager } from './routes/positions';
import { ConfigLoader } from './services';

// Load environment variables
dotenv.config();

const port = process.env.PORT || 3000;

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  try {
    // Create Express app
    const app = createApp();

    // Set up graceful shutdown handlers
    setupGracefulShutdown();

    // Start the server
    const server = app.listen(port, () => {
      console.log(`🚀 Deribit Options Trading Microservice running on port ${port}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔧 Test Environment: ${process.env.USE_TEST_ENVIRONMENT || 'true'}`);
      console.log(`📁 Config File: ${process.env.API_KEY_FILE || './config/apikeys.yml'}`);
      
      // Service endpoints
      console.log('\n📡 Available Endpoints:');
      console.log(`🌐 Health Check: http://localhost:${port}/health`);
      console.log(`📡 Webhook Endpoint: http://localhost:${port}/webhook/signal`);
      console.log(`🎯 Delta Manager: http://localhost:${port}/delta`);
      console.log(`📊 Manual Polling: http://localhost:${port}/api/positions/poll`);
      console.log(`📈 Polling Status: http://localhost:${port}/api/positions/polling-status`);
      console.log(`▶️ Start Polling: http://localhost:${port}/api/positions/start-polling`);
      console.log(`⏹️ Stop Polling: http://localhost:${port}/api/positions/stop-polling`);
      console.log(`📋 Logs: http://localhost:${port}/logs`);

      // Show configured accounts
      try {
        const configLoader = ConfigLoader.getInstance();
        const accounts = configLoader.getEnabledAccounts();
        console.log(`\n👥 Enabled Accounts: ${accounts.map(a => a.name).join(', ')}`);
      } catch (error) {
        console.warn('⚠️ Warning: Could not load account configuration:', error);
      }

      // Auto-start polling if configured
      const autoStartPolling = process.env.AUTO_START_POLLING !== 'false';
      console.log(`\n🔄 Auto Start Polling: ${autoStartPolling}`);

      if (autoStartPolling) {
        console.log('🟢 Starting automatic position polling...');
        pollingManager.startPolling();
      } else {
        console.log('⏸️ Polling not started automatically. Use POST /api/positions/start-polling to start manually.');
      }
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use. Please choose a different port.`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    shutdown();
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown();
  });

  // Handle graceful shutdown signals
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    shutdown();
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    shutdown();
  });
}

/**
 * Perform graceful shutdown
 */
function shutdown(): void {
  try {
    // Stop position polling
    console.log('⏹️ Stopping position polling...');
    pollingManager.stopPolling();

    console.log('✅ Server shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Start the server if this file is executed directly
if (require.main === module) {
  startServer();
}