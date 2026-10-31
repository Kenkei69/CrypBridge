import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Write Semantics & Anti-Fabrication Protections', () => {
  let app: FastifyInstance;
  let authToken: string;

  before(async () => {
    app = await buildApp();
    authToken = await app.generateTestToken({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      email: 'security@example.com',
    });
  });

  after(async () => {
    await app.close();
  });

  it('prohibits direct fabrication of approval snapshots via generic CRUD endpoints', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/approval-snapshots',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        amount: '100000000',
        status: 'active',
      },
    });

    // Endpoint does not exist (404) or is blocked
    assert.equal(res.statusCode, 404, 'No generic CRUD endpoint may exist for approval snapshots');
  });

  it('prohibits direct fabrication of settlements via generic CRUD endpoints', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/settlement-records',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        amount: '5000000',
        settlementType: 'onchain_mainnet',
      },
    });

    assert.equal(res.statusCode, 404, 'No generic CRUD endpoint may exist for settlement records');
  });

  it('prohibits direct client creation of audit events', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/audit-events',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        eventType: 'AUTH_LOGIN',
        actorType: 'admin',
      },
    });

    assert.equal(res.statusCode, 404, 'Clients cannot insert arbitrary audit events via API');
  });

  it('prohibits arbitrary signing endpoint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/signer/sign',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        payloadToSign: 'arbitrary_drainer_payload',
      },
    });

    assert.equal(res.statusCode, 404, 'No arbitrary signing endpoint may be exposed');
  });
});
