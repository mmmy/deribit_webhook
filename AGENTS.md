# AGENTS.md - Deribit Options Trading Microservice

This document provides essential information for AI agents working in this Node.js + TypeScript Deribit options trading microservice codebase.

## Project Overview

This is a production-ready Deribit options trading microservice built with Node.js, TypeScript, and Express. It implements OAuth 2.0 authentication, multi-account management, and a comprehensive options trading system with webhook integration.

## Essential Commands

### Development Commands
```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Start with Node.js inspector for debugging
npm run debug

# Build for production
npm run build

# Start production server
npm start
```

### Testing Commands
```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# Verbose output
npm run test:verbose

# CI environment testing
npm run test:ci

# Unit tests without leak detection
npm run test:unit

# Unit tests with coverage
npm run test:unit:coverage
```

### Utility Commands
```bash
# Clean build artifacts
npm run clean

# Restart nodemon (type 'rs' in dev console)
rs
```

### Deployment
```bash
# Automated Ubuntu deployment (production)
./deploy.sh

# Manual PM2 management
pm2 start ecosystem.config.js
pm2 logs deribit-webhook
pm2 restart deribit-webhook
```

## Architecture & Code Organization

### Directory Structure
```
src/
├── config/          # Configuration loading (YAML + environment)
├── core/            # Dependency injection container
├── services/        # Business logic services
├── routes/          # Express route handlers
├── middleware/      # Express middleware
├── utils/           # Utility functions
├── types/           # TypeScript type definitions
├── database/        # SQLite database management
├── polling/         # Background polling services
├── jobs/            # Scheduled jobs
├── factory/         # Factory patterns
├── api/             # API client implementations
└── app.ts           # Express app configuration
```

### Dependency Injection System

The project uses a custom dependency injection container (`src/core/di-container.ts`):

**Service Registration**: Services are registered in `src/core/service-registry.ts`
**Service Tokens**: Defined in `src/core/service-tokens.ts` using symbols
**Usage Pattern**: 
```typescript
// In routes/services
import { container } from '../core/di-container';
import { SERVICE_TOKENS } from '../core/service-tokens';

const someService = container.resolve(SERVICE_TOKENS.SomeService);
```

### Configuration System

**Environment Variables**: `.env` file (copy from `.env.example`)
**API Keys**: YAML configuration at `config/apikeys.yml` (copy from example)
**Config Loader**: Singleton pattern in `src/config/index.ts`

Important environment variables:
- `USE_TEST_ENVIRONMENT=true` - Use Deribit testnet
- `USE_MOCK_MODE=true` - Use mock API responses
- `API_KEY_FILE=./config/apikeys.yml` - Path to API configuration

### TypeScript Path Aliases

Configured in `tsconfig.json`:
```typescript
"@/*": ["src/*"],
"@/types": ["src/types"],
"@/services": ["src/services"],
"@/config": ["src/config"]
```

## Code Patterns & Conventions

### Service Layer Pattern
All business logic follows the service pattern with dependency injection:
```typescript
export class ExampleService {
  constructor(
    private configLoader: ConfigLoader,
    private deribitClient: DeribitClient
  ) {}
  
  async businessMethod(): Promise<ResultType> {
    // Implementation
  }
}
```

### Error Handling
Global error handler in `src/middleware/error-handler.ts`
All services throw errors that are caught and formatted consistently

### Response Format
Standardized API responses using `src/utils/response-formatter.ts`:
```typescript
// Success
{
  "success": true,
  "message": "Operation completed",
  "data": { ... },
  "timestamp": "2023-01-01T00:00:00.000Z"
}

// Error
{
  "success": false,
  "message": "Error description",
  "error": "detailed_error_info",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

### Route Handler Pattern
All routes follow this structure:
```typescript
router.post('/endpoint', async (req, res, next) => {
  try {
    const service = container.resolve(SERVICE_TOKENS.SomeService);
    const result = await service.someMethod(req.body);
    sendSuccess(res, result, 'Success message');
  } catch (error) {
    next(error); // Passes to global error handler
  }
});
```

## Testing Approach

### Test Structure
- **Unit Tests**: `tests/**/*.test.ts`
- **Setup File**: `tests/setup.ts` (global test configuration)
- **Coverage**: Excludes `src/index.ts` and `src/server.ts`

### Test Patterns
```typescript
// Mock Express Response
const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

// Service testing with DI container reset
beforeEach(() => {
  container.clear();
  // Re-register services for test
});
```

### Jest Configuration
- **Test Environment**: Node.js
- **Timeout**: 15 seconds
- **Module Mapping**: Matches TypeScript path aliases
- **Coverage Exclusions**: Entry points and type definitions

## Key Services & Components

### Core Services
- **ConfigLoader**: Manages YAML and environment configuration
- **DeribitAuth**: OAuth 2.0 authentication with token refresh
- **DeribitClient**: Real Deribit API client
- **MockDeribitClient**: Development/testing mock client

### Business Services
- **OptionService**: Options trading logic
- **OptionTradingService**: Order execution and management
- **DeltaManager**: SQLite database for Delta options tracking
- **WeChatNotificationService**: Enterprise WeChat notifications

### Background Services
- **PositionPollingService**: Monitors and adjusts positions
- **DeltaCleanupJob**: Daily cleanup of expired options

## Important Gotchas

### Configuration Management
- API keys in `config/apikeys.yml` are ignored by Git
- Must copy `apikeys.example.yml` to `apikeys.yml` for local development
- Environment variables override YAML configuration

### Mock Mode
- Set `USE_MOCK_MODE=true` to avoid network calls during development
- Mock client simulates all Deribit API responses
- Useful for testing without real API keys

### Database
- SQLite database at `data/delta_records.db`
- Database initialization happens automatically on first run
- Database files are excluded from Git

### Multi-Account Support
- Each account can be enabled/disabled independently
- WeChat bot configuration is per-account
- Accounts can be in test or production mode separately

### Chinese Language Support
- Codebase supports Chinese comments and log messages
- Webhook filtering checks for Chinese ignore keywords ("忽略")
- Error messages and user-facing text may be in Chinese

## Development Workflow

### When Adding New Services
1. Create service class in `src/services/`
2. Add service token to `src/core/service-tokens.ts`
3. Register service in `src/core/service-registry.ts`
4. Use dependency injection in routes/other services

### When Adding New Routes
1. Create route file in `src/routes/`
2. Export as `router`
3. Import in `src/routes/index.ts`
4. Follow error handling pattern with `next(error)`

### When Adding Configuration
1. Add default to `.env.example`
2. Access via `process.env` or ConfigLoader
3. Document usage in relevant README files

### Testing New Features
1. Write unit tests alongside implementation
2. Mock external dependencies
3. Use Jest module path mapping for imports
4. Ensure coverage for critical paths

## Security Considerations

- API credentials stored in separate YAML file, not in code
- Environment variables for sensitive configuration
- Helmet middleware for security headers
- CORS configuration in Express app
- Rate limiting considerations for production

## Production Deployment

- Uses PM2 process manager
- Automated deployment script for Ubuntu 20.04+
- Structured logging to files
- Health check endpoint at `/health`
- Graceful shutdown handling
- Memory limits and restart policies configured

## Mock Development Mode

For development without real API access:
1. Set `USE_MOCK_MODE=true` in `.env`
2. Mock client responds with realistic data
3. All trading operations simulate success
4. OAuth flow returns valid mock tokens
5. WebSocket connections simulated

This mode enables full-featured development and testing without requiring Deribit API credentials.