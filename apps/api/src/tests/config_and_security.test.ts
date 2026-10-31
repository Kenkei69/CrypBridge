import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config/env.js';
import { DefaultDestinationPolicy } from '../modules/integrations/destinationPolicy.js';
import { SimulationPaymentSigner } from '../modules/integrations/mockSigner.js';
import { SimulationSettlementAdapter } from '../modules/integrations/settlementAdapter.js';
import { AppError } from '@x402/shared';
import { buildApp } from '../app.js';

describe('Configuration & Security Boundaries', () => {
  it('fails startup on invalid configuration (missing DATABASE_URL or short secret)', () => {
    assert.throws(
      () => {
        loadConfig({ DATABASE_URL: 'invalid-url', SUPABASE_JWT_SECRET: 'short' });
      },
      (err: Error) => {
        return err.message.includes('Invalid environment configuration');
      }
    );
  });

  it('prohibits SimulationPaymentSigner from starting in production environment', () => {
    assert.throws(
      () => {
        new SimulationPaymentSigner('production');
      },
      (err: AppError) => {
        return err.code === 'SIMULATION_FORBIDDEN_IN_PROD';
      }
    );
  });

  it('prohibits SimulationSettlementAdapter from starting in production environment', () => {
    assert.throws(
      () => {
        new SimulationSettlementAdapter('production');
      },
      (err: AppError) => {
        return err.code === 'SIMULATION_FORBIDDEN_IN_PROD';
      }
    );
  });

  it('destination policy enforces SSRF protection against private IPs', () => {
    const policy = new DefaultDestinationPolicy(['api.merchant.com'], false);

    const privateHosts = [
      'http://127.0.0.1/payment',
      'http://169.254.169.254/latest/meta-data',
      'http://192.168.1.5:8080/drain',
      'http://10.0.0.1/admin',
      'http://localhost/hack',
    ];

    for (const target of privateHosts) {
      const res = policy.validateUrl(target);
      assert.equal(res.allowed, false, `Expected ${target} to be blocked by SSRF policy`);
      assert.match(res.reason || '', /SSRF|Disallowed protocol/);
    }
  });

  it('destination policy validates allowed trusted merchant domains', () => {
    const policy = new DefaultDestinationPolicy(['api.merchant.com'], false);

    const allowed = policy.validateUrl('https://api.merchant.com/v1/pay');
    assert.equal(allowed.allowed, true);

    const disallowed = policy.validateUrl('https://evil-hacker.com/drain');
    assert.equal(disallowed.allowed, false);
  });

  it('rejects requests from disallowed origins via CORS', async () => {
    const app = await buildApp({
      ALLOWED_ORIGINS: ['http://trusted.local'],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/live',
      headers: {
        origin: 'http://malicious-site.com',
      },
    });

    // Disallowed origin triggers 500/error response in CORS middleware or omits access-control-allow-origin
    const allowOrigin = res.headers['access-control-allow-origin'];
    assert.notEqual(allowOrigin, 'http://malicious-site.com');

    await app.close();
  });
});
