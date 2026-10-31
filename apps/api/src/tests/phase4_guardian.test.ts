import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { buildApp } from '../app.js';
import type { ExecutionPermit } from '@x402/shared';
import {
  guardianPolicies,
  spendingReservations,
  guardianDecisions,
  paymentExecutions,
} from '@x402/database/schema';
import { evaluateGuardianPolicy } from '../modules/guardian/policyEvaluator.js';
import {
  reserveSpendingBudget,
  commitSpendingReservation,
  releaseSpendingReservation,
} from '../modules/guardian/reservationService.js';
import { generateExecutionPermit } from '../modules/guardian/authorizationService.js';
import { ConstrainedSimulationSigner } from '../modules/payment-engine/constrainedSigner.js';
import { PaymentExecutionWorker } from '../modules/payment-engine/paymentExecutionWorker.js';
import { setKillSwitch } from '../modules/payment-engine/killSwitch.js';

describe('Phase 4: Blue Team Guardian Security Engine, Atomic Reservations, & Worker Fencing', () => {
  let app: FastifyInstance;

  const userAlice = {
    userId: '44444444-aaaa-4444-aaaa-111111111111',
    email: 'alice.phase4@guardian.local',
  };
  const userBob = {
    userId: '44444444-bbbb-4444-bbbb-222222222222',
    email: 'bob.phase4@guardian.local',
  };
  const userAdmin = {
    userId: '44444444-cccc-4444-cccc-000000000000',
    email: 'admin.phase4@guardian.local',
    role: 'admin' as const,
  };

  let aliceToken: string;
  let bobToken: string;
  let adminToken: string;

  before(async () => {
    process.env.NODE_ENV = 'test';
    app = await buildApp({ LOG_LEVEL: 'fatal' });
    await app.ready();

    // Clean up any lingering reservations or decisions for test users
    await app.db
      .delete(spendingReservations)
      .where(sql`user_id IN (${userAlice.userId}, ${userBob.userId})`);
    await app.db
      .delete(guardianDecisions)
      .where(sql`user_id IN (${userAlice.userId}, ${userBob.userId})`);

    aliceToken = await app.generateTestToken({
      id: userAlice.userId,
      email: userAlice.email,
    });
    bobToken = await app.generateTestToken({
      id: userBob.userId,
      email: userBob.email,
    });
    adminToken = await app.generateTestToken({
      id: userAdmin.userId,
      email: userAdmin.email,
      role: 'admin',
    });

    // Ensure profiles exist in DB for test users
    await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${aliceToken}` } });
    await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${bobToken}` } });
    await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${adminToken}` } });
  });

  after(async () => {
    setKillSwitch(false, 'Test teardown');
    await app.close();
  });

  // Helper to create an approved purchase intent with execution record
  async function createApprovedExecution(
    token: string,
    productId = '44444444-4444-4444-4444-444444444441',
    paymentOptionId = '55555555-5555-5555-5555-555555555501',
    options?: { resetToQueued?: boolean; mockMerchantFault?: any } | boolean
  ) {
    const resetToQueued = typeof options === 'boolean' ? options : !!options?.resetToQueued;
    const mockMerchantFault = typeof options === 'object' && options !== null ? options.mockMerchantFault : undefined;

    const draftResp = await app.inject({
      method: 'POST',
      url: '/api/v1/purchases/intents',
      headers: { authorization: `Bearer ${token}` },
      payload: { productId, paymentOptionId },
    });
    const intent = JSON.parse(draftResp.body).intent;

    const approvePayload: Record<string, any> = { expectedVersion: intent.version };
    if (mockMerchantFault) {
      approvePayload.mockMerchantFault = mockMerchantFault;
    }

    const approveResp = await app.inject({
      method: 'POST',
      url: `/api/v1/purchases/intents/${intent.id}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: approvePayload,
    });
    const approved = JSON.parse(approveResp.body);

    let execution = approved.execution;
    if (resetToQueued && execution) {
      // Release any existing reservation for this execution
      await app.db
        .update(spendingReservations)
        .set({ reservationStatus: 'RELEASED' })
        .where(eq(spendingReservations.paymentExecutionId, execution.id));

      const [reset] = await app.db
        .update(paymentExecutions)
        .set({
          executionStatus: 'QUEUED',
          workerId: null,
          workerLeaseExpiresAt: null,
          failureCode: null,
          failureReason: null,
        })
        .where(eq(paymentExecutions.id, execution.id))
        .returning();
      execution = reset;
    }

    return {
      draft: intent,
      approvedIntent: approved.purchaseIntent || intent,
      snapshot: approved.snapshot,
      execution,
    };
  }

  // =========================================================================
  // 1. LEGITIMATE BEHAVIOR & FULL GUARDIAN PIPELINE
  // =========================================================================
  describe('1. Legitimate Behavior & Full Guardian Pipeline', () => {
    it('executes legitimate purchase: passes Guardian gate, reserves budget, issues permit, signs, and commits reservation', async () => {
      const { execution, snapshot } = await createApprovedExecution(aliceToken);

      const worker = new PaymentExecutionWorker(app.db, 'development');
      const result = await worker.processExecution(execution.id);

      assert.strictEqual(result.executionStatus, 'SIMULATION_COMPLETED');
      assert.strictEqual(result.fulfillmentStatus, 'DELIVERED');
      assert.ok(result.settlementReference);
      assert.ok(result.fencingToken && result.fencingToken >= 1);

      // Verify that a GuardianDecision record was persisted with outcome ALLOW
      const decisions = await app.db
        .select()
        .from(guardianDecisions)
        .where(eq(guardianDecisions.paymentExecutionId, execution.id));

      assert.strictEqual(decisions.length, 1);
      assert.strictEqual(decisions[0]!.outcome, 'ALLOW');
      assert.strictEqual(decisions[0]!.reasonCode, 'AUTHORIZED');
      assert.ok(decisions[0]!.permitId);

      // Verify that the spending reservation transitioned to COMMITTED
      const reservations = await app.db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.paymentExecutionId, execution.id));

      assert.strictEqual(reservations.length, 1);
      assert.strictEqual(reservations[0]!.reservationStatus, 'COMMITTED');
      assert.strictEqual(reservations[0]!.amount, snapshot.exactAmount);
      assert.ok(reservations[0]!.committedAt);
    });

    it('handles resource delivery failure gracefully and retains COMMITTED budget reservation', async () => {
      const { execution } = await createApprovedExecution(aliceToken, undefined, undefined, {
        mockMerchantFault: 'resource_delivery_fail',
      });

      assert.strictEqual(execution.executionStatus, 'SIMULATION_COMPLETED');
      assert.strictEqual(execution.fulfillmentStatus, 'DELIVERY_FAILED');

      // The reservation MUST remain COMMITTED because simulated settlement occurred
      const [res] = await app.db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.paymentExecutionId, execution.id));

      assert.ok(res);
      assert.strictEqual(res!.reservationStatus, 'COMMITTED');

      // Safe retry delivers resource without double-charging or double-reserving
      const worker = new PaymentExecutionWorker(app.db, 'development');
      const retryResult = await worker.retryExecution(execution.id, userAlice.userId);
      assert.strictEqual(retryResult.executionStatus, 'SIMULATION_COMPLETED');
      assert.strictEqual(retryResult.fulfillmentStatus, 'DELIVERED');

      const allRes = await app.db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.paymentExecutionId, execution.id));
      assert.strictEqual(allRes.length, 1, 'Retry must not create duplicate reservations');
    });
  });

  // =========================================================================
  // 2. PARAMETER ATTACKS & GUARDIAN BLOCKING
  // =========================================================================
  describe('2. Parameter Attacks & Independent Guardian Blocking', () => {
    it('blocks overpayment parameter attack and records explainable decision', async () => {
      const { execution, snapshot } = await createApprovedExecution(aliceToken, undefined, undefined, true);

      // Tampered amount higher than approved
      const tamperedAmount = (BigInt(snapshot.exactAmount) + 1000000n).toString();

      const worker = new PaymentExecutionWorker(app.db, 'development');
      const result = await worker.processExecution(execution.id, {
        simulateTamperedAmount: tamperedAmount,
      });

      assert.strictEqual(result.executionStatus, 'BLOCKED');
      assert.strictEqual(result.failureCode, 'AMOUNT_MISMATCH');

      // Verify Guardian decision record for this run
      assert.ok(result.guardianDecisionId);
      const [decision] = await app.db
        .select()
        .from(guardianDecisions)
        .where(eq(guardianDecisions.id, result.guardianDecisionId!));

      assert.ok(decision);
      assert.strictEqual(decision!.outcome, 'BLOCK');
      assert.strictEqual(decision!.reasonCode, 'AMOUNT_MISMATCH');

      // Verify NO spending reservation is left active
      const activeRes = await app.db
        .select()
        .from(spendingReservations)
        .where(
          and(
            eq(spendingReservations.paymentExecutionId, execution.id),
            eq(spendingReservations.reservationStatus, 'COMMITTED')
          )
        );
      assert.strictEqual(activeRes.length, 0);
    });

    it('blocks wrong-recipient parameter attack', async () => {
      const { execution } = await createApprovedExecution(aliceToken, undefined, undefined, true);

      const attackerAddress = '0x000000000000000000000000000000000000dEaD';

      const worker = new PaymentExecutionWorker(app.db, 'development');
      const result = await worker.processExecution(execution.id, {
        simulateTamperedRecipient: attackerAddress,
      });

      assert.strictEqual(result.executionStatus, 'BLOCKED');
      assert.strictEqual(result.failureCode, 'RECIPIENT_MISMATCH');

      assert.ok(result.guardianDecisionId);
      const [decision] = await app.db
        .select()
        .from(guardianDecisions)
        .where(eq(guardianDecisions.id, result.guardianDecisionId!));

      assert.ok(decision);
      assert.strictEqual(decision!.outcome, 'BLOCK');
      assert.strictEqual(decision!.reasonCode, 'RECIPIENT_MISMATCH');
    });

    it('blocks altered asset or network outside positive allowlist', async () => {
      const { intent, snapshot } = {
        intent: {
          id: '33333333-3333-3333-3333-333333333331',
          userId: userAlice.userId,
          version: 1,
          status: 'approved' as const,
          proposedAmount: '10000000',
          assetIdentifier: 'ETH',
          networkIdentifier: 'eip155:1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        snapshot: {
          id: '44444444-4444-4444-4444-444444444441',
          userId: userAlice.userId,
          purchaseIntentId: '33333333-3333-3333-3333-333333333331',
          approvalVersion: 1,
          status: 'active' as const,
          exactAmount: '10000000',
          trustedRecipientAddress: '0x71C8364f3B7147a469f3796A775f0aCe374f514C',
          assetIdentifier: 'ETH',
          networkIdentifier: 'eip155:1',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          approvedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      };

      const evalResult = evaluateGuardianPolicy({
        userId: userAlice.userId,
        intent: intent as any,
        snapshot: snapshot as any,
      });

      assert.strictEqual(evalResult.outcome, 'BLOCK');
      assert.strictEqual(evalResult.reasonCode, 'UNSUPPORTED_EXECUTION_COMBINATION');
    });

    it('blocks cross-user approval reference (tenant isolation)', async () => {
      const { approvedIntent, snapshot } = await createApprovedExecution(aliceToken);

      // User Bob attempts to evaluate Alice's approval
      const evalResult = evaluateGuardianPolicy({
        userId: userBob.userId,
        intent: approvedIntent,
        snapshot,
      });

      assert.strictEqual(evalResult.outcome, 'BLOCK');
      assert.strictEqual(evalResult.reasonCode, 'OWNER_MISMATCH');
    });

    it('blocks expired or superseded approval snapshots', async () => {
      const { approvedIntent, snapshot } = await createApprovedExecution(aliceToken);

      // Test expired snapshot
      const expiredSnapshot = {
        ...snapshot,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };

      const evalResult = evaluateGuardianPolicy({
        userId: userAlice.userId,
        intent: approvedIntent,
        snapshot: expiredSnapshot,
      });

      assert.strictEqual(evalResult.outcome, 'BLOCK');
      assert.strictEqual(evalResult.reasonCode, 'SNAPSHOT_EXPIRED');
    });

    it('rejects tampered permit at the ConstrainedSimulationSigner boundary', async () => {
      const { execution, snapshot, approvedIntent } = await createApprovedExecution(aliceToken);

      const permit = generateExecutionPermit({
        executionId: execution.id,
        intentId: approvedIntent.id,
        snapshotId: snapshot.id,
        approvalVersion: snapshot.approvalVersion,
        policyId: '00000000-0000-0000-0000-000000000010',
        policyVersion: 1,
        reservationId: '99999999-9999-9999-9999-999999999999',
        fencingToken: 1,
        recipientAddress: snapshot.trustedRecipientAddress,
        amount: snapshot.exactAmount,
        assetIdentifier: snapshot.assetIdentifier,
        networkIdentifier: snapshot.networkIdentifier,
        snapshotExpiresAt: snapshot.expiresAt,
      });

      // Tamper with the permit amount without re-signing HMAC
      const tamperedPermit: ExecutionPermit = {
        ...permit,
        amount: '999999999',
      };

      const signer = new ConstrainedSimulationSigner('development');
      await assert.rejects(
        async () => {
          await signer.signSimulationAuthorization({
            executionId: execution.id,
            snapshot,
            intent: approvedIntent,
            requirementItem: {
              scheme: 'exact',
              network: 'eip155:84532',
              amount: snapshot.exactAmount,
              asset: 'USDC',
              payTo: snapshot.trustedRecipientAddress,
            },
            permit: tamperedPermit,
            fencingToken: 1,
            requirePermit: true,
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 400);
          assert.ok(err.message.includes('permit invalid') || err.message.includes('signature mismatch'));
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 3. REPLAY, WORKER FENCING, & CONCURRENCY
  // =========================================================================
  describe('3. Replay, Worker Fencing, & Concurrency Protections', () => {
    it('prevents duplicate settlement when same execution is re-processed', async () => {
      const { execution } = await createApprovedExecution(aliceToken);

      const worker = new PaymentExecutionWorker(app.db, 'development');
      const firstRun = await worker.processExecution(execution.id);
      assert.strictEqual(firstRun.executionStatus, 'SIMULATION_COMPLETED');

      // Second run immediately re-queries and returns completed execution without charging or reserving again
      const secondRun = await worker.processExecution(execution.id);
      assert.strictEqual(secondRun.executionStatus, 'SIMULATION_COMPLETED');
      assert.strictEqual(secondRun.settlementReference, firstRun.settlementReference);

      const count = await app.db
        .select()
        .from(spendingReservations)
        .where(eq(spendingReservations.paymentExecutionId, execution.id));
      assert.strictEqual(count.length, 1);
    });

    it('enforces worker fencing tokens: stale worker cannot sign or finalize work after newer worker claims lease', async () => {
      const { execution } = await createApprovedExecution(aliceToken, undefined, undefined, true);

      const worker1 = new PaymentExecutionWorker(app.db, 'development');

      // Simulate a stale worker whose lease generation was superseded by injecting simulateStaleWorkerFencingToken
      await assert.rejects(
        async () => {
          await worker1.processExecution(execution.id, {
            simulateStaleWorkerFencingToken: true,
          });
        },
        (err: any) => {
          assert.strictEqual(err.statusCode, 409);
          assert.ok(err.message.includes('STALE_WORKER_FENCING_TOKEN') || err.message.includes('fencing token'));
          return true;
        }
      );
    });

    it('enforces atomic budget concurrency: two concurrent 60 USDC purchases against a 100 USDC limit allow exactly one', async () => {
      const testUserId = crypto.randomUUID();
      await app.db.execute(sql`
        INSERT INTO profiles (id, email) VALUES (${testUserId}, ${'concurrent_' + testUserId + '@user.test'}) ON CONFLICT DO NOTHING
      `);

      // Create test policy with 100 USDC daily limit (100000000 base units)
      const testPolicyId = crypto.randomUUID();
      await app.db.insert(guardianPolicies).values({
        id: testPolicyId,
        userId: testUserId,
        policyVersion: 1,
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        maxAmountPerPayment: '100000000', // 100 USDC
        maxAmountPerTask: '200000000',
        maxAmountPerDailyWindow: '100000000', // 100 USDC limit
        dailyWindowSeconds: 86400,
        isActive: true,
      });

      // Prepare two concurrent 60 USDC reservation attempts (60000000 base units each)
      const purchaseIntent1 = crypto.randomUUID();
      const purchaseIntent2 = crypto.randomUUID();
      const convId = crypto.randomUUID();

      // Insert minimal purchase intents for FK
      await app.db.execute(sql`
        INSERT INTO conversations (id, user_id, title) VALUES (${convId}, ${testUserId}, 'Convo') ON CONFLICT DO NOTHING
      `);
      await app.db.execute(sql`
        INSERT INTO purchase_intents (id, user_id, product_id, merchant_id, proposed_amount, currency, version, status, network_identifier, asset_identifier)
        VALUES 
          (${purchaseIntent1}, ${testUserId}, '44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '60000000', 'USDC', 1, 'approved', 'eip155:84532', 'USDC'),
          (${purchaseIntent2}, ${testUserId}, '44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '60000000', 'USDC', 1, 'approved', 'eip155:84532', 'USDC')
        ON CONFLICT DO NOTHING
      `);

      // Run both reservations simultaneously in parallel
      const [res1, res2] = await Promise.all([
        reserveSpendingBudget(app.db, {
          userId: testUserId,
          purchaseIntentId: purchaseIntent1,
          assetIdentifier: 'USDC',
          networkIdentifier: 'eip155:84532',
          amount: '60000000',
        }),
        reserveSpendingBudget(app.db, {
          userId: testUserId,
          purchaseIntentId: purchaseIntent2,
          assetIdentifier: 'USDC',
          networkIdentifier: 'eip155:84532',
          amount: '60000000',
        }),
      ]);

      const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
      assert.strictEqual(successCount, 1, 'Exactly one 60 USDC purchase must succeed against a 100 USDC budget');

      const failedResult = !res1.success ? res1 : res2;
      assert.strictEqual(failedResult.reasonCode, 'BUDGET_EXCEEDED_DAILY');
    });
  });

  // =========================================================================
  // 4. BUDGET ACCOUNTING & LIFECYCLE
  // =========================================================================
  describe('4. Budget Accounting & Reservation Lifecycle', () => {
    it('enforces exact single-payment limit: exact limit succeeds, one unit above is blocked', async () => {
      const testUserId = crypto.randomUUID();
      await app.db.execute(sql`
        INSERT INTO profiles (id, email) VALUES (${testUserId}, ${'limits_' + testUserId + '@user.test'}) ON CONFLICT DO NOTHING
      `);

      const limitPolicyId = crypto.randomUUID();
      await app.db.insert(guardianPolicies).values({
        id: limitPolicyId,
        userId: testUserId,
        policyVersion: 1,
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        maxAmountPerPayment: '50000000', // 50 USDC
        maxAmountPerTask: '200000000',
        maxAmountPerDailyWindow: '500000000',
        dailyWindowSeconds: 86400,
        isActive: true,
      });

      const pIntentId1 = crypto.randomUUID();
      const pIntentId2 = crypto.randomUUID();
      await app.db.execute(sql`
        INSERT INTO purchase_intents (id, user_id, product_id, merchant_id, proposed_amount, currency, version, status, network_identifier, asset_identifier)
        VALUES 
          (${pIntentId1}, ${testUserId}, '44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '50000000', 'USDC', 1, 'approved', 'eip155:84532', 'USDC'),
          (${pIntentId2}, ${testUserId}, '44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '50000001', 'USDC', 1, 'approved', 'eip155:84532', 'USDC')
        ON CONFLICT DO NOTHING
      `);

      // 1. Exact limit (50000000 base units) -> Succeeds
      const exactRes = await reserveSpendingBudget(app.db, {
        userId: testUserId,
        purchaseIntentId: pIntentId1,
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        amount: '50000000',
      });
      assert.strictEqual(exactRes.success, true);

      // 2. One base unit above limit (50000001 base units) -> Blocked
      const aboveRes = await reserveSpendingBudget(app.db, {
        userId: testUserId,
        purchaseIntentId: pIntentId2,
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        amount: '50000001',
      });
      assert.strictEqual(aboveRes.success, false);
      assert.strictEqual(aboveRes.reasonCode, 'BUDGET_EXCEEDED_PER_PAYMENT');
    });

    it('safely releases reservation on definitive rejection and prevents release of committed reservation', async () => {
      const testUserId = crypto.randomUUID();
      await app.db.execute(sql`
        INSERT INTO profiles (id, email) VALUES (${testUserId}, ${'rel_' + testUserId + '@user.test'}) ON CONFLICT DO NOTHING
      `);
      const pIntentId = crypto.randomUUID();
      await app.db.execute(sql`
        INSERT INTO purchase_intents (id, user_id, product_id, merchant_id, proposed_amount, currency, version, status, network_identifier, asset_identifier)
        VALUES (${pIntentId}, ${testUserId}, '44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '1000000', 'USDC', 1, 'approved', 'eip155:84532', 'USDC')
        ON CONFLICT DO NOTHING
      `);

      const res = await reserveSpendingBudget(app.db, {
        userId: testUserId,
        purchaseIntentId: pIntentId,
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        amount: '1000000',
      });
      assert.strictEqual(res.success, true);
      const resId = res.reservation!.id;

      // Safely release
      const released = await releaseSpendingReservation(app.db, resId, 'Test definitive rejection');
      assert.strictEqual(released?.reservationStatus, 'RELEASED');

      // Now commit another reservation and ensure releaseSpendingReservation refuses to release it
      const pIntentId2 = crypto.randomUUID();
      await app.db.execute(sql`
        INSERT INTO purchase_intents (id, user_id, product_id, merchant_id, proposed_amount, currency, version, status, network_identifier, asset_identifier)
        VALUES (${pIntentId2}, ${testUserId}, '44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '1000000', 'USDC', 1, 'approved', 'eip155:84532', 'USDC')
        ON CONFLICT DO NOTHING
      `);

      const res2 = await reserveSpendingBudget(app.db, {
        userId: testUserId,
        purchaseIntentId: pIntentId2,
        assetIdentifier: 'USDC',
        networkIdentifier: 'eip155:84532',
        amount: '1000000',
      });
      await commitSpendingReservation(app.db, res2.reservation!.id);

      const attemptRelease = await releaseSpendingReservation(app.db, res2.reservation!.id, 'Illegal release attempt');
      assert.strictEqual(attemptRelease?.reservationStatus, 'COMMITTED', 'Committed spend must NEVER be released');
    });

    it('returns accurate budget summary through GET /api/v1/guardian/budget', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/api/v1/guardian/budget?assetIdentifier=USDC&networkIdentifier=eip155:84532',
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.strictEqual(resp.statusCode, 200);
      const data = JSON.parse(resp.body).budget;

      assert.ok(data.dailyLimitAmount);
      assert.ok(data.availableAmount);
      assert.ok(data.resetAtUtc);
      assert.strictEqual(data.assetIdentifier, 'USDC');
      assert.strictEqual(data.networkIdentifier, 'eip155:84532');
    });
  });

  // =========================================================================
  // 5. PROMPT INJECTION & AUTHORITY SEPARATION
  // =========================================================================
  describe('5. Prompt Injection & Authority Separation', () => {
    it('verifies that malicious merchant description cannot manipulate payment recipient or amount', async () => {
      // Product 6: 'Adversarial Security Audit Report' with adversarial probe content
      const { execution, snapshot } = await createApprovedExecution(
        aliceToken,
        '44444444-4444-4444-4444-444444444446',
        '55555555-5555-5555-5555-555555555510'
      );

      // The execution must strictly follow snapshot terms, not any prompt or text
      const worker = new PaymentExecutionWorker(app.db, 'development');
      const result = await worker.processExecution(execution.id);

      assert.strictEqual(result.executionStatus, 'SIMULATION_COMPLETED');
      assert.strictEqual(snapshot.trustedRecipientAddress, '0x3a4bF9e2E2F7730e25B71810fF009aD192a5d93e');
      assert.strictEqual(snapshot.exactAmount, '1000000');
    });

    it('verifies benign security text in product does not trigger false positive blocks', async () => {
      // Product 5: 'Real-Time Threat Intelligence Webhook' (contains words like drainer_addresses, phishing_domains)
      const { execution } = await createApprovedExecution(
        aliceToken,
        '44444444-4444-4444-4444-444444444445',
        '55555555-5555-5555-5555-555555555509'
      );

      const worker = new PaymentExecutionWorker(app.db, 'development');
      const result = await worker.processExecution(execution.id);

      assert.strictEqual(result.executionStatus, 'SIMULATION_COMPLETED');
      assert.strictEqual(result.fulfillmentStatus, 'DELIVERED');
    });
  });

  // =========================================================================
  // 6. ADMIN PRIVILEGE ISOLATION & KILL SWITCH
  // =========================================================================
  describe('6. Admin Privilege Isolation & Kill Switch', () => {
    it('prohibits ordinary users from modifying spending policy', async () => {
      const resp = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/guardian/policy',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          assetIdentifier: 'USDC',
          networkIdentifier: 'eip155:84532',
          maxAmountPerPayment: '999999999',
          maxAmountPerTask: '999999999',
          maxAmountPerDailyWindow: '999999999',
          dailyWindowSeconds: 86400,
          isActive: true,
        },
      });

      assert.strictEqual(resp.statusCode, 403);
      const body = JSON.parse(resp.body);
      assert.strictEqual(body.error.code, 'FORBIDDEN');
      assert.ok(body.error.message.includes('Administrator privileges required'));
    });

    it('allows administrator to update spending policy', async () => {
      const resp = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/guardian/policy',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          assetIdentifier: 'USDC',
          networkIdentifier: 'eip155:84532',
          maxAmountPerPayment: '150000000', // 150 USDC
          maxAmountPerTask: '300000000',
          maxAmountPerDailyWindow: '600000000',
          dailyWindowSeconds: 86400,
          isActive: true,
        },
      });

      assert.strictEqual(resp.statusCode, 200);
      const policy = JSON.parse(resp.body).policy;
      assert.strictEqual(policy.maxAmountPerPayment, '150000000');
    });

    it('prohibits self-elevation of administrator role via profile updates', async () => {
      // Alice attempts to submit role: 'admin' via profile PATCH
      const patchResp = await app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/profile',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          displayName: 'Alice Attacker',
          role: 'admin',
          metadata: { role: 'admin' },
        },
      });

      assert.strictEqual(patchResp.statusCode, 200);
      const user = JSON.parse(patchResp.body).user;
      assert.strictEqual(user.role, 'authenticated', 'Role must remain authenticated, never escalated');

      // Attempting admin operation still fails with 403
      const adminAttempt = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/guardian/policy',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          assetIdentifier: 'USDC',
          networkIdentifier: 'eip155:84532',
          maxAmountPerPayment: '999999999',
          maxAmountPerTask: '999999999',
          maxAmountPerDailyWindow: '999999999',
          dailyWindowSeconds: 86400,
          isActive: true,
        },
      });

      assert.strictEqual(adminAttempt.statusCode, 403);
    });

    it('enforces emergency kill switch: blocks new executions when active', async () => {
      setKillSwitch(true, 'Emergency security quarantine test');

      const { execution } = await createApprovedExecution(aliceToken, undefined, undefined, true);
      const worker = new PaymentExecutionWorker(app.db, 'development');
      const result = await worker.processExecution(execution.id);

      assert.strictEqual(result.executionStatus, 'BLOCKED');
      assert.strictEqual(result.failureCode, 'KILL_SWITCH_ACTIVE');

      setKillSwitch(false, 'Quarantine lifted');
    });

    it('enforces user isolation on decision history and inspection', async () => {
      // Create execution for Alice
      const { execution } = await createApprovedExecution(aliceToken);
      const worker = new PaymentExecutionWorker(app.db, 'development');
      await worker.processExecution(execution.id);

      const [aliceDecision] = await app.db
        .select()
        .from(guardianDecisions)
        .where(eq(guardianDecisions.paymentExecutionId, execution.id));

      assert.ok(aliceDecision);

      // Bob attempts to inspect Alice's decision
      const bobInspect = await app.inject({
        method: 'GET',
        url: `/api/v1/guardian/decisions/${aliceDecision!.id}`,
        headers: { authorization: `Bearer ${bobToken}` },
      });

      assert.strictEqual(bobInspect.statusCode, 404, 'Bob cannot access Alice decision');

      // Alice can inspect her decision
      const aliceInspect = await app.inject({
        method: 'GET',
        url: `/api/v1/guardian/decisions/${aliceDecision!.id}`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.strictEqual(aliceInspect.statusCode, 200);
      const fetched = JSON.parse(aliceInspect.body).decision;
      assert.strictEqual(fetched.id, aliceDecision!.id);
      assert.strictEqual(fetched.outcome, 'ALLOW');
    });
  });
});
