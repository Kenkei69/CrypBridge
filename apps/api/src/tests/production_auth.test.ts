import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fastify from 'fastify';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authPlugin } from '../plugins/auth.js';
import { registerErrorHandler } from '../plugins/error-handler.js';
import type { EnvConfig } from '../config/env.js';

describe('Production authentication', () => {
  it('verifies asymmetric Supabase claims and rejects forged, expired and wrong-audience tokens', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'ES256', use: 'sig' };
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    const app = fastify();
    try {
      registerErrorHandler(app);
      await app.register(authPlugin, { config: {
        APP_ENV: 'production', NODE_ENV: 'production', SUPABASE_URL: url,
        SUPABASE_JWT_SECRET: 'development-secret-not-accepted-in-production',
      } as EnvConfig });
      app.get('/protected', { preHandler: [app.authenticate] }, request => ({ id: request.user.id }));
      const token = (audience: string, expiration: number) => new SignJWT({ email: 'invited@example.com', role: 'authenticated' })
        .setProtectedHeader({ alg: 'ES256', kid: 'test-key' }).setSubject('11111111-1111-4111-8111-111111111111')
        .setIssuer(url + '/auth/v1').setAudience(audience).setExpirationTime(expiration).sign(privateKey);
      const now = Math.floor(Date.now() / 1000);
      const valid = await token('authenticated', now + 60);
      const call = (value: string) => app.inject({ url: '/protected', headers: { authorization: 'Bearer ' + value } });
      assert.equal((await call(valid)).statusCode, 200);
      assert.equal((await call(await token('other-project', now + 60))).statusCode, 401);
      assert.equal((await call(await token('authenticated', now - 60))).statusCode, 401);
      const forged = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('fake')
        .sign(new TextEncoder().encode('development-secret-not-accepted-in-production'));
      assert.equal((await call(forged)).statusCode, 401);
      await assert.rejects(() => app.generateTestToken({ email: 'anyone@example.com' }), /disabled/);
    } finally {
      await app.close();
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  });
});
