require('ts-node/register/transpile-only');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('POST /webhook/signal ignores payloads with comment containing \\u5ffd\\u7565', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deribit-webhook-test-'));
  const configPath = path.join(tempDir, 'apikeys.yml');

  fs.writeFileSync(
    configPath,
    [
      'accounts:',
      '  - name: test-account',
      '    description: Test account for webhook ignore test',
      '    clientId: dummy',
      '    clientSecret: dummy-secret',
      '    enabled: true',
      '    grantType: client_credentials',
      'settings:',
      '  connectionTimeout: 5000',
      '  maxReconnectAttempts: 3',
      '  rateLimitPerMinute: 60'
    ].join('\n'),
    'utf8'
  );

  const previousConfigPath = process.env.API_KEY_FILE;
  process.env.API_KEY_FILE = configPath;
  process.env.USE_TEST_ENVIRONMENT = 'true';

  // Require after environment setup so ConfigLoader picks up the temporary config
  const { createApp } = require('../../src/app');

  const app = createApp();
  const server = app.listen(0);

  t.after(() => {
    server.close();
    delete require.cache[require.resolve('../../src/app')];
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (previousConfigPath === undefined) {
      delete process.env.API_KEY_FILE;
    } else {
      process.env.API_KEY_FILE = previousConfigPath;
    }
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object', 'server did not expose a listening address');

  const response = await fetch(`http://127.0.0.1:${address.port}/webhook/signal`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      accountName: 'test-account',
      side: 'buy',
      symbol: 'BTC-30DEC22-20000-C',
      size: '1',
      qtyType: 'fixed',
      comment: decodeURIComponent('%E8%AF%B7%E5%BF%BD%E7%95%A5%E6%AD%A4%E5%8D%95')
    })
  });

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.message, 'Signal ignored');
  assert.equal(body.data, null);
  assert.equal(body.meta?.ignored, true);
});
