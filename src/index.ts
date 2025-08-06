/**
 * Deribit Options Trading Microservice
 * Main entry point - simply starts the server
 */

import { startServer } from './server';

// Start the application
startServer().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});