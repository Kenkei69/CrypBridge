import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Authentication & Session Management', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  it('rejects protected routes when Authorization header is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('rejects protected routes when token is malformed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: 'Bearer this.is.an.invalid.token',
      },
    });

    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('rejects protected routes when token has expired', async () => {
    // Generate token that expired 10 seconds ago
    const expiredToken = await app.generateTestToken(
      { email: 'expired@example.com', id: '00000000-0000-0000-0000-000000000099' },
      -10
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });

    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
    assert.match(body.error.message, /expired/i);
  });

  it('authenticates valid token, restores session, and returns profile', async () => {
    const testUserId = '00000000-0000-0000-0000-000000000010';
    const token = await app.generateTestToken({
      id: testUserId,
      email: 'user10@example.com',
      displayName: 'User Ten',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.user.id, testUserId);
    assert.equal(body.user.email, 'user10@example.com');
  });

  it('attaches correlation ID x-request-id on every response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/live',
      headers: {
        'x-request-id': 'custom-req-id-12345',
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-request-id'], 'custom-req-id-12345');
  });
});
