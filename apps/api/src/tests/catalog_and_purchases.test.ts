import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Catalog & Purchase Intent Authorization', () => {
  let app: FastifyInstance;
  let authToken: string;
  const testUserId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  before(async () => {
    app = await buildApp();
    authToken = await app.generateTestToken({ id: testUserId, email: 'catalogtest@example.com' });
  });

  after(async () => {
    await app.close();
  });

  it('reads seeded products with exact base-unit integer pricing and trusted merchant info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/catalog/products',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.products.length >= 5);

    const gpuProduct = body.products.find(
      (p: { name: string }) => p.name === 'Cloud GPU 1-Hour Compute'
    );
    assert.ok(gpuProduct);
    assert.equal(gpuProduct.priceAmount, '5000000'); // Exact 5 USDC base units string
    assert.equal(gpuProduct.currency, 'USDC');
    assert.equal(gpuProduct.merchant.isTrusted, true);
  });

  it('reads trusted merchants list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/catalog/merchants',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.merchants.length >= 3);
    assert.ok(body.merchants.every((m: { isTrusted: boolean }) => m.isTrusted === true));
  });

  it('creates draft intent using backend catalog values; rejects client price manipulation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/purchases/intents',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        productId: '44444444-4444-4444-4444-444444444441',
        // Attacker attempts to change price to 1 base unit and redirect funds to attacker address
        proposedAmount: '1',
        trustedRecipientAddress: '0xAttackerAddress000000000000000000000000',
      },
    });

    assert.equal(res.statusCode, 201);
    const intent = res.json().intent;
    // Price MUST be authoritative catalog price (5000000), not the attacker's "1"
    assert.equal(intent.proposedAmount, '5000000');
    // Recipient address MUST be Cloud Compute Corp's trusted address
    assert.equal(
      intent.merchant.trustedRecipientAddress,
      '0x71C8364f3B7147a469f3796A775f0aCe374f514C'
    );
    assert.notEqual(intent.merchant.trustedRecipientAddress, '0xAttackerAddress000000000000000000000000');
    assert.equal(intent.status, 'draft');
  });

  it('rejects invalid UUID or malformed requests with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/purchases/intents',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        productId: 'not-a-valid-uuid',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('rejects nonexistent product with 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/purchases/intents',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        productId: '00000000-9999-9999-9999-000000000000',
      },
    });

    assert.equal(res.statusCode, 404);
    const body = res.json();
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
