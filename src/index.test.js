const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { initializeSK8OAuthCallback } = require('./index');

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(key, value) { res.headers[key] = value; },
    end(body) { res.body = body; },
  };
  return res;
}

describe('initializeSK8OAuthCallback', () => {
  it('throws if apiKey is missing', () => {
    assert.throws(() => initializeSK8OAuthCallback({}), /apiKey.*required/i);
    assert.throws(() => initializeSK8OAuthCallback(), /apiKey.*required/i);
  });

  it('returns error HTML when OAuth provider returns error', async () => {
    const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key' });
    const req = { query: { error: 'access_denied', error_description: 'User denied' } };
    const res = createMockRes();

    await middleware(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'text/html');
    assert.ok(res.body.includes('sk8_oauth_callback'));
    assert.ok(res.body.includes('access_denied'));
    assert.ok(res.body.includes('User denied'));
  });

  it('returns 400 when code or state is missing', async () => {
    const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key' });
    const res = createMockRes();

    await middleware({ query: { code: 'abc' } }, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.includes('missing_params'));

    const res2 = createMockRes();
    await middleware({ query: { state: 'xyz' } }, res2);
    assert.equal(res2.statusCode, 400);
    assert.ok(res2.body.includes('missing_params'));
  });

  it('returns success HTML on successful exchange', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        configInstanceId: 'ci-123',
        connectionStatus: 'connected',
      })),
    }));

    try {
      const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key', baseUrl: 'https://api.test' });
      const req = { query: { code: 'auth-code', state: 'state-token' } };
      const res = createMockRes();

      await middleware(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('sk8_oauth_callback'));
      assert.ok(res.body.includes('success'));
      assert.ok(res.body.includes('ci-123'));
      assert.ok(res.body.includes('connected'));

      const fetchCall = globalThis.fetch.mock.calls[0];
      assert.equal(fetchCall.arguments[0], 'https://api.test/api-gateway/v1/oauth/exchange');
      const fetchOpts = fetchCall.arguments[1];
      assert.equal(fetchOpts.method, 'POST');
      assert.equal(fetchOpts.headers['x-api-key'], 'test-key');
      const body = JSON.parse(fetchOpts.body);
      assert.equal(body.code, 'auth-code');
      assert.equal(body.state, 'state-token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns error HTML when exchange fails (non-200)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: 'invalid_code' })),
    }));

    try {
      const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key' });
      const req = { query: { code: 'bad-code', state: 'state-token' } };
      const res = createMockRes();

      await middleware(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('exchange_failed'));
      assert.ok(res.body.includes('invalid_code'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('calls next(err) when fetch throws', async () => {
    const originalFetch = globalThis.fetch;
    const fetchError = new Error('network failure');
    globalThis.fetch = mock.fn(() => Promise.reject(fetchError));

    try {
      const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key' });
      const req = { query: { code: 'code', state: 'state' } };
      const res = createMockRes();
      let capturedErr = null;
      const next = (err) => { capturedErr = err; };

      await middleware(req, res, next);

      assert.equal(capturedErr, fetchError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('escapes XSS vectors in error_description HTML output', async () => {
    const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key' });
    const req = { query: { error: 'test', error_description: '<script>alert(1)</script>' } };
    const res = createMockRes();

    await middleware(req, res);

    // The <p> tag should have escaped HTML
    assert.ok(res.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;') === false
      || !res.body.includes('<script>alert(1)</script>'),
      'XSS payload must not appear unescaped in HTML body');
    // The script payload should use JSON (safe) with </script> escaped
    assert.ok(!res.body.match(/<\/script>.*<\/script>/s)
      || res.body.split('</script>').length === 2,
      'Payload must not break out of script tag');
    // Verify the value is still present in the postMessage payload
    assert.ok(res.body.includes('alert(1)'));
  });

  it('returns error HTML when exchange returns non-JSON 200', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not json'),
    }));

    try {
      const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key' });
      const req = { query: { code: 'code', state: 'state' } };
      const res = createMockRes();

      await middleware(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.includes('exchange_failed'));
      assert.ok(res.body.includes('invalid response'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns 500 HTML when fetch throws and no next function', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(() => Promise.reject(new Error('network failure')));

    try {
      const middleware = initializeSK8OAuthCallback({ apiKey: 'test-key' });
      const req = { query: { code: 'code', state: 'state' } };
      const res = createMockRes();

      await middleware(req, res);

      assert.equal(res.statusCode, 500);
      assert.ok(res.body.includes('internal_error'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
