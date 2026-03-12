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

module.exports = { initializeSK8Middleware };
