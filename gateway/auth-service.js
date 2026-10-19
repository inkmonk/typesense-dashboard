// Auth sidecar for the Typesense gateway.
//
// nginx calls this for every /v1 request that carries a PIA token (auth_request). It checks the
// token with PIA, then answers with a status nginx understands:
//
//   200  allowed; the `X-Role` header says which Typesense key nginx should use
//        (`admin` when PIA says is_staff, otherwise `readonly`)
//   401  missing, malformed, invalid or expired token
//   403  valid token, but the user is not on the ops team (is_ops_team = false)
//   503  PIA could not be reached or answered badly; nginx turns this into a 500, so
//        the gateway fails closed
//
// It never sees or stores a Typesense key; those live in nginx. Results are cached per token
// for a short time so a page full of searches does not become a page full of PIA calls.
// The cost: a role change or deactivation can take up to CACHE_MS to apply.

import crypto from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function createAuthService({
  piaApiUrl,
  cacheMs = 60_000,
  denyCacheMs = 10_000,
  maxEntries = 2000,
  timeoutMs = 5000,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const cache = new Map(); // sha256(token) -> { result, expires }

  function remember(key, result, ttl) {
    cache.set(key, { result, expires: now() + ttl });
    while (cache.size > maxEntries) {
      cache.delete(cache.keys().next().value); // oldest first
    }
  }

  async function check(token) {
    const key = crypto.createHash('sha256').update(token).digest('hex');
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.result;

    let response;
    try {
      response = await fetchImpl(`${piaApiUrl}/auth/token-verify/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { status: 503 }; // not cached: PIA may be back a second later
    }

    if ([400, 401, 403].includes(response.status)) {
      const result = { status: 401 };
      remember(key, result, denyCacheMs);
      return result;
    }
    if (!response.ok) return { status: 503 };

    let roles;
    try {
      roles = await response.json();
    } catch {
      return { status: 503 };
    }
    const result = roles.is_ops_team
      ? { status: 200, role: roles.is_staff ? 'admin' : 'readonly' }
      : { status: 403 };
    remember(key, result, result.status === 200 ? cacheMs : denyCacheMs);
    return result;
  }

  return http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('typesense-auth ok');
      return;
    }
    if (req.url !== '/auth') {
      res.writeHead(404).end();
      return;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    if (!match) {
      res.writeHead(401).end();
      return;
    }
    const result = await check(match[1]);
    const headers = result.role ? { 'X-Role': result.role } : {};
    res.writeHead(result.status, headers).end();
  });
}

// Run directly: node auth-service.js
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // 9100 is taken by Prometheus node_exporter on the server, so this uses an unusual port
  const port = Number(process.env.PORT ?? 9177);
  const piaApiUrl = (process.env.PIA_API_URL ?? 'https://pia.printo.in/api/v1').replace(/\/$/, '');
  const server = createAuthService({
    piaApiUrl,
    cacheMs: Number(process.env.CACHE_MS ?? 60_000),
  });
  // loopback only: nginx is the sole caller
  server.listen(port, '127.0.0.1', () => {
    console.log(`typesense auth service on 127.0.0.1:${port}, PIA ${piaApiUrl}`);
  });
}
