import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { simulationAllowed } from '../config/simulation.js';
import { loadConfig } from '../config/env.js';
import { ConstrainedSimulationSigner } from '../modules/payment-engine/constrainedSigner.js';
import { generateExecutionPermit } from '../modules/guardian/authorizationService.js';

const keys = ['APP_ENV', 'NODE_ENV', 'SIMULATION_MODE', 'ALLOW_HOSTED_SIMULATION', 'GUARDIAN_SIGNER_PERMIT_SECRET'] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
describe('Hosted simulation boundaries', () => {
  it('requires explicit production opt-in and still rejects disabled simulation', () => {
    process.env.NODE_ENV = 'production';
    process.env.SIMULATION_MODE = 'true';
    delete process.env.ALLOW_HOSTED_SIMULATION;
    assert.equal(simulationAllowed('production'), false);
    process.env.ALLOW_HOSTED_SIMULATION = 'true';
    assert.equal(simulationAllowed('production'), true);
    process.env.SIMULATION_MODE = 'false';
    assert.equal(simulationAllowed('production'), false);
    assert.throws(() => new ConstrainedSimulationSigner('production'));
  });
  it('does not permit hosted opt-in to bypass missing signing secrets', () => {
    process.env.APP_ENV = 'production';
    delete process.env.GUARDIAN_SIGNER_PERMIT_SECRET;
    assert.throws(() => generateExecutionPermit({
      executionId: 'execution', intentId: 'intent', snapshotId: 'snapshot', approvalVersion: 1,
      policyId: 'policy', policyVersion: 1, reservationId: 'reservation', fencingToken: 1,
      recipientAddress: '0x123', amount: '1', assetIdentifier: 'USDC', networkIdentifier: 'eip155:84532',
      snapshotExpiresAt: new Date(Date.now() + 60000).toISOString(),
    }), /GUARDIAN_SIGNER_PERMIT_SECRET/);
  });
  it('rejects wildcard CORS and missing production opt-in at startup', () => {
    const config = {
      DATABASE_URL: 'postgresql://localhost/demo', APP_ENV: 'production', NODE_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co', SIMULATION_MODE: 'true',
      ALLOW_HOSTED_SIMULATION: 'true', SIMULATION_SIGNER_SECRET: 'a'.repeat(64),
      GUARDIAN_SIGNER_PERMIT_SECRET: 'b'.repeat(64), ALLOWED_ORIGINS: 'https://*.example.com',
    };
    assert.throws(() => loadConfig(config), /exact HTTPS/);
    assert.throws(() => loadConfig({ ...config, ALLOWED_ORIGINS: 'https://demo.example.com', ALLOW_HOSTED_SIMULATION: 'false' }), /explicitly enabled/);
  });
});
