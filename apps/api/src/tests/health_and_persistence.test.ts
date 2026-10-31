import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app.js';

describe('Health Checks & Data Persistence', () => {
  it('/live returns 200 OK with timestamp', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/live' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'ok');
    assert.ok(body.timestamp);
    await app.close();
  });

  it('/ready returns 200 OK when database is reachable', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.checks.database, 'healthy');
    await app.close();
  });

  it('/ready returns 503 degraded when database connection fails', async () => {
    const app = await buildApp();

    // Temporarily replace sql client with a failing executor
    const originalSql = app.sql;
    (app as any).sql = async () => {
      throw new Error('Connection refused to database replica');
    };

    const res = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(res.statusCode, 503);
    const body = res.json();
    assert.equal(body.status, 'degraded');
    assert.equal(body.checks.database, 'unhealthy');

    (app as any).sql = originalSql;
    await app.close();
  });

  it('data persists across process and application restart', async () => {
    const persistUserId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    // Instance 1 writes data
    const app1 = await buildApp();
    const token1 = await app1.generateTestToken({ id: persistUserId, email: 'persist@example.com' });

    const createRes = await app1.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${token1}` },
      payload: { title: 'Persistent Conversation Across Restart' },
    });
    assert.equal(createRes.statusCode, 201);
    const convId = createRes.json().conversation.id;

    // Simulate process shutdown
    await app1.close();

    // Instance 2 starts up fresh
    const app2 = await buildApp();
    const token2 = await app2.generateTestToken({ id: persistUserId, email: 'persist@example.com' });

    const fetchRes = await app2.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}`,
      headers: { authorization: `Bearer ${token2}` },
    });

    assert.equal(fetchRes.statusCode, 200);
    const fetchedConv = fetchRes.json().conversation;
    assert.equal(fetchedConv.id, convId);
    assert.equal(fetchedConv.title, 'Persistent Conversation Across Restart');

    await app2.close();
  });
});
