function initializeSK8Middleware({ apiKey, baseUrl }) {
  if (!apiKey) {
    throw new Error('SK8 embedded middleware: "apiKey" is required');
  }

  const finalBaseUrl = baseUrl ?? 'http://localhost:3000/api';

  return async function embeddedMiddleware(req, res, next) {
    try {
      const clientId = req.clientId;
      if (clientId === null || clientId === undefined || clientId === '') {
        throw new Error(
          'SK8 embedded middleware: req.clientId is required and cannot be empty',
        );
      }

      const targetUrl = `${finalBaseUrl}${req.url}`;
      const headers = {
        'x-api-key': apiKey,
        'x-external-id': String(clientId),
      };

      if (req.headers['content-type']) {
        headers['Content-Type'] = req.headers['content-type'];
      } else {
        headers['Content-Type'] = 'application/json';
      }

      const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      const body = hasBody ? JSON.stringify(req.body ?? {}) : undefined;

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
      });

      const text = await upstream.text();
      res.statusCode = upstream.status;
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.end(text);
    } catch (err) {
      if (typeof next === 'function') {
        next(err);
      } else {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
      }
    }
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function oauthResultHtml(type, data) {
  const payload = JSON.stringify({ type: 'sk8_oauth_callback', ...data });
  return `<!DOCTYPE html>
<html>
<head><title>OAuth ${escapeHtml(type)}</title></head>
<body>
<p>${escapeHtml(type === 'success' ? 'Authorization successful. You may close this window.' : 'Authorization failed. You may close this window.')}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${escapeHtml(payload)}, '*');
  }
  window.close();
</script>
</body>
</html>`;
}

function initializeSK8OAuthCallback({ apiKey, baseUrl } = {}) {
  if (!apiKey) {
    throw new Error('SK8 OAuth callback: "apiKey" is required');
  }

  const finalBaseUrl = baseUrl ?? 'http://localhost:3000/api';

  return async function oauthCallbackMiddleware(req, res, next) {
    try {
      const { code, state, error, error_description } = req.query;

      if (error) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end(oauthResultHtml('error', {
          status: 'error',
          error,
          error_description: error_description || 'Authorization was denied or failed',
        }));
        return;
      }

      if (!code || !state) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html');
        res.end(oauthResultHtml('error', {
          status: 'error',
          error: 'missing_params',
          error_description: 'Missing required query parameters: code and state',
        }));
        return;
      }

      const exchangeUrl = `${finalBaseUrl}/api-gateway/v1/oauth/exchange`;
      const upstream = await fetch(exchangeUrl, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, state }),
      });

      const responseText = await upstream.text();

      if (!upstream.ok) {
        let errorMessage = 'Token exchange failed';
        try {
          const parsed = JSON.parse(responseText);
          if (parsed.error || parsed.message) {
            errorMessage = parsed.error || parsed.message;
          }
        } catch {
          // use default error message
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end(oauthResultHtml('error', {
          status: 'error',
          error: 'exchange_failed',
          error_description: errorMessage,
        }));
        return;
      }

      const result = JSON.parse(responseText);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html');
      res.end(oauthResultHtml('success', {
        status: 'success',
        configInstanceId: result.configInstanceId,
        connectionStatus: result.connectionStatus,
      }));
    } catch (err) {
      if (typeof next === 'function') {
        next(err);
      } else {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/html');
        res.end(oauthResultHtml('error', {
          status: 'error',
          error: 'internal_error',
          error_description: 'An unexpected error occurred',
        }));
      }
    }
  };
}

module.exports = { initializeSK8Middleware, initializeSK8OAuthCallback };
