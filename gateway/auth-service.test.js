// Run with: node --test gateway/auth-service.test.js
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createAuthService } from './auth-service.js';

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server.address().port)),
  );
}

describe('auth service', () => {
  let pia, service, piaPort, servicePort;
  let piaCalls = 0;
  let piaDown = false;
  let clock = 1_000_000;

  before(async () => {
    // Fake PIA: the token string decides the answer.
    pia = http.createServer((req, res) => {
      piaCalls += 1;
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (piaDown) return res.writeHead(502).end();
        const { token } = JSON.parse(body);
        const send = (code, obj) =>
          res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(obj));
        if (token === 'staff') return send(200, { is_ops_team: true, is_staff: true });
        if (token === 'ops') return send(200, { is_ops_team: true, is_staff: false });
        if (token === 'outsider') return send(200, { is_ops_team: false, is_staff: true });
        if (token === 'broken') return res.writeHead(200).end('not json');
        return send(401, { detail: 'invalid' });
      });
    });
    piaPort = await listen(pia);
    service = createAuthService({
      piaApiUrl: `http://127.0.0.1:${piaPort}`,
      cacheMs: 60_000,
      denyCacheMs: 10_000,
      now: () => clock,
    });
    servicePort = await listen(service);
  });

  after(() => {
    pia.close();
    service.close();
  });

  const call = (authorization) =>
    fetch(`http://127.0.0.1:${servicePort}/auth`, {
      headers: authorization ? { Authorization: authorization } : {},
    });

  it('401 without a bearer token', async () => {
    assert.equal((await call()).status, 401);
    assert.equal((await call('Basic abc')).status, 401);
  });

  it('staff get the admin role', async () => {
    const res = await call('Bearer staff');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-role'), 'admin');
  });

  it('ops-team members who are not staff get read-only', async () => {
    const res = await call('Bearer ops');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-role'), 'readonly');
  });

  it('403 for users outside the ops team, even if staff', async () => {
    const res = await call('Bearer outsider');
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('x-role'), null);
  });

  it('401 for a token PIA rejects', async () => {
    assert.equal((await call('Bearer nonsense')).status, 401);
  });

  it('caches by token, and expires the cache', async () => {
    await call('Bearer staff');
    const before = piaCalls;
    await call('Bearer staff');
    await call('Bearer staff');
    assert.equal(piaCalls, before, 'repeat calls must not reach PIA');
    clock += 61_000;
    await call('Bearer staff');
    assert.equal(piaCalls, before + 1, 'an expired entry is re-checked');
  });

  it('fails closed with 503 when PIA is down or answers badly, and does not cache that', async () => {
    assert.equal((await call('Bearer broken')).status, 503);
    piaDown = true;
    assert.equal((await call('Bearer fresh-token')).status, 503);
    piaDown = false;
    assert.equal((await call('Bearer ops-after-outage')).status, 401, 'recovers once PIA is back');
  });

  it('serves /health and 404s other paths', async () => {
    assert.equal((await fetch(`http://127.0.0.1:${servicePort}/health`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${servicePort}/other`)).status, 404);
  });
});
