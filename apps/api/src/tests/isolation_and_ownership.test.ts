import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Tenant Isolation & Ownership Boundaries', () => {
  let app: FastifyInstance;
  let tokenUserA: string;
  let tokenUserB: string;
  const userAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  before(async () => {
    app = await buildApp();
    tokenUserA = await app.generateTestToken({ id: userAId, email: 'usera@example.com' });
    tokenUserB = await app.generateTestToken({ id: userBId, email: 'userb@example.com' });
  });

  after(async () => {
    await app.close();
  });

  it('enforces isolation: User B cannot access User A conversation or messages', async () => {
    // 1. User A creates conversation
    const createConvRes = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${tokenUserA}` },
      payload: { title: 'User A Secret Conversation' },
    });
    assert.equal(createConvRes.statusCode, 201);
    const convA = createConvRes.json().conversation;
    assert.equal(convA.userId, userAId);

    // 2. User A adds message
    const createMsgRes = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convA.id}/messages`,
      headers: { authorization: `Bearer ${tokenUserA}` },
      payload: { content: 'Secret message from A', role: 'user' },
    });
    assert.equal(createMsgRes.statusCode, 201);

    // 3. User B attempts to read User A's conversation
    const userBReadConv = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convA.id}`,
      headers: { authorization: `Bearer ${tokenUserB}` },
    });
    assert.equal(userBReadConv.statusCode, 404, 'User B must receive 404 when querying A conversation');

    // 4. User B attempts to read messages of User A's conversation
    const userBReadMsgs = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convA.id}/messages`,
      headers: { authorization: `Bearer ${tokenUserB}` },
    });
    assert.equal(userBReadMsgs.statusCode, 404, 'User B must receive 404 when querying messages in A conversation');

    // 5. User B attempts to post message into User A's conversation
    const userBPostMsg = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convA.id}/messages`,
      headers: { authorization: `Bearer ${tokenUserB}` },
      payload: { content: 'Attacking conversation from B', role: 'user' },
    });
    assert.equal(userBPostMsg.statusCode, 404, 'User B must not be able to post messages into A conversation');
  });

  it('rejects ownership spoofing in request bodies', async () => {
    // User A passes User B's ID in body to hijack ownership
    const spoofAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { authorization: `Bearer ${tokenUserA}` },
      payload: {
        title: 'Spoofed Title',
        userId: userBId, // Attempted spoof
      },
    });

    assert.equal(spoofAttempt.statusCode, 201);
    const conv = spoofAttempt.json().conversation;
    // Ownership MUST be derived from verified token (User A), NEVER client-supplied body
    assert.equal(conv.userId, userAId);
    assert.notEqual(conv.userId, userBId);
  });

  it('enforces isolation on purchase intents and history', async () => {
    // 1. User A creates purchase intent from catalog product
    const createIntentRes = await app.inject({
      method: 'POST',
      url: '/api/v1/purchases/intents',
      headers: { authorization: `Bearer ${tokenUserA}` },
      payload: {
        productId: '44444444-4444-4444-4444-444444444441',
      },
    });
    assert.equal(createIntentRes.statusCode, 201);
    const intentA = createIntentRes.json().intent;
    assert.equal(intentA.userId, userAId);

    // 2. User B tries to read User A's purchase intent
    const userBReadIntent = await app.inject({
      method: 'GET',
      url: `/api/v1/purchases/intents/${intentA.id}`,
      headers: { authorization: `Bearer ${tokenUserB}` },
    });
    assert.equal(userBReadIntent.statusCode, 404);

    // 3. User B reads their history -> must not see User A's intent
    const userBHistory = await app.inject({
      method: 'GET',
      url: '/api/v1/history',
      headers: { authorization: `Bearer ${tokenUserB}` },
    });
    assert.equal(userBHistory.statusCode, 200);
    const userBIntents = userBHistory.json().history.intents;
    assert.ok(!userBIntents.some((i: { id: string }) => i.id === intentA.id));
  });
});
