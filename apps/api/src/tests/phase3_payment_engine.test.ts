import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import {
  encodeX402Header,
  decodeX402Header,
  PHASE3_PINNED_EXECUTION,
  type X402V2PaymentRequired,
} from '@x402/shared';
import { parseAndValidatePaymentRequirements } from '../modules/payment-engine/requirementsParser.js';
import { ConstrainedSimulationSigner } from '../modules/payment-engine/constrainedSigner.js';
import { setKillSwitch } from '../modules/payment-engine/killSwitch.js';

describe('Phase 3: Simulated x402 Payment Engine, Constrained Signer, & Lifecycle', () => {
  let app: FastifyInstance;

  const userAlice = {
    userId: '11111111-1111-1111-1111-111111111111',
    email: 'alice@guardian.local',
  };
  const userBob = {
    userId: '22222222-2222-2222-2222-222222222222',
    email: 'bob@guardian.local',
  };

  let aliceToken: string;
  let bobToken: string;

  before(async () => {
    app = await buildApp({ LOG_LEVEL: 'fatal' });
    await app.ready();

    aliceToken = await app.generateTestToken({
      id: userAlice.userId,
      email: userAlice.email,
    });
    bobToken = await app.generateTestToken({
      id: userBob.userId,
      email: userBob.email,
    });

    // Ensure kill switch is deactivated for test start
    setKillSwitch(false);
  });

  after(async () => {
    setKillSwitch(false);
    await app.close();
  });

  // ==========================================
  // 1. x402 V2 Header Transport & Requirements Parser Tests
  // ==========================================
  describe('x402 V2 Header Encoding & Strict Parsing', () => {
    const validTerms = {
      scheme: PHASE3_PINNED_EXECUTION.scheme,
      networkIdentifier: PHASE3_PINNED_EXECUTION.network,
      assetIdentifier: PHASE3_PINNED_EXECUTION.assetSymbol,
      exactAmount: '5000000',
      trustedRecipientAddress: '0x1111111111111111111111111111111111111111',
      resourceId: 'res_gpu_h100_compute',
    };

    it('correctly encodes and decodes Base64 x402 headers', () => {
      const payload: X402V2PaymentRequired = {
        x402Version: 2,
        resource: {
          url: 'https://merchant.local/api/v1/mock-merchant/resources/res_gpu_h100_compute',
          description: 'H100 GPU compute access',
        },
        accepts: [
          {
            scheme: PHASE3_PINNED_EXECUTION.scheme,
            network: PHASE3_PINNED_EXECUTION.network,
            asset: PHASE3_PINNED_EXECUTION.assetAddress,
            amount: '5000000',
            payTo: '0x1111111111111111111111111111111111111111',
          },
        ],
      };

      const header = encodeX402Header(payload);
      assert.ok(typeof header === 'string');
      assert.ok(header.length > 20);

      const decoded = decodeX402Header<X402V2PaymentRequired>(header);
      assert.equal(decoded.x402Version, 2);
      assert.equal(decoded.accepts[0]?.amount, '5000000');
    });

    it('parses and validates matching x402 V2 requirements', () => {
      const doc: X402V2PaymentRequired = {
        x402Version: 2,
        resource: {
          url: 'https://merchant.local/api/v1/mock-merchant/resources/res_gpu_h100_compute',
        },
        accepts: [
          {
            scheme: PHASE3_PINNED_EXECUTION.scheme,
            network: PHASE3_PINNED_EXECUTION.network,
            asset: PHASE3_PINNED_EXECUTION.assetAddress,
            amount: '5000000',
            payTo: '0x1111111111111111111111111111111111111111',
          },
        ],
      };

      const header = encodeX402Header(doc);
      const parsed = parseAndValidatePaymentRequirements(header, validTerms);
      assert.ok(parsed.valid);
      assert.equal(parsed.matchedRequirement.amount, '5000000');
      assert.equal(parsed.matchedRequirement.network, PHASE3_PINNED_EXECUTION.network);
    });

    it('rejects oversized header payload exceeding 64KB', () => {
      const hugeData = 'x'.repeat(70000);
      assert.throws(
        () => parseAndValidatePaymentRequirements(hugeData, validTerms),
        /payload size/
      );
    });

    it('rejects non-Base64 or corrupt header', () => {
      assert.throws(
        () => parseAndValidatePaymentRequirements('!!!not_base64!!!', validTerms),
        /unable to decode base64 payload/
      );
    });

    it('rejects non-version 2 requirement headers', () => {
      const invalidVersionDoc = {
        x402Version: 1, // Invalid: Phase 3 pins version 2
        resource: { url: 'https://example.com' },
        accepts: [{ scheme: 'exact', network: 'eip155:84532', asset: 'USDC', amount: '5000000', payTo: '0x111' }],
      };
      const header = encodeX402Header(invalidVersionDoc);
      assert.throws(
        () => parseAndValidatePaymentRequirements(header, validTerms),
        /Invalid x402 V2 payment requirement schema/
      );
    });

    it('rejects price tampering / amount mismatch in requirement header', () => {
      const tamperedDoc: X402V2PaymentRequired = {
        x402Version: 2,
        resource: { url: 'https://example.com' },
        accepts: [
          {
            scheme: PHASE3_PINNED_EXECUTION.scheme,
            network: PHASE3_PINNED_EXECUTION.network,
            asset: PHASE3_PINNED_EXECUTION.assetAddress,
            amount: '9999999', // Tampered! Expected 5000000
            payTo: '0x1111111111111111111111111111111111111111',
          },
        ],
      };
      const header = encodeX402Header(tamperedDoc);
      assert.throws(
        () => parseAndValidatePaymentRequirements(header, validTerms),
        /amount mismatch/
      );
    });

    it('rejects recipient address deviation in requirement header', () => {
      const rogueRecipientDoc: X402V2PaymentRequired = {
        x402Version: 2,
        resource: { url: 'https://example.com' },
        accepts: [
          {
            scheme: PHASE3_PINNED_EXECUTION.scheme,
            network: PHASE3_PINNED_EXECUTION.network,
            asset: PHASE3_PINNED_EXECUTION.assetAddress,
            amount: '5000000',
            payTo: '0x9999999999999999999999999999999999999999', // Rogue!
          },
        ],
      };
      const header = encodeX402Header(rogueRecipientDoc);
      assert.throws(
        () => parseAndValidatePaymentRequirements(header, validTerms),
        /recipient address mismatch/
      );
    });
  });

  // ==========================================
  // 2. Constrained Simulation Signer Security Boundaries
  // ==========================================
  describe('Constrained Simulation Signer Boundaries', () => {
    it('refuses execution if app environment is production', () => {
      assert.throws(
        () => new ConstrainedSimulationSigner('production'),
        /strictly prohibited in production/i
      );
    });

    it('rejects unsupported networks or assets (only Base Sepolia USDC is permitted)', async () => {
      const devSigner = new ConstrainedSimulationSigner('development');
      await assert.rejects(
        () =>
          devSigner.signSimulationAuthorization({
            executionId: '00000000-0000-0000-0000-000000000001',
            snapshot: {
              id: '00000000-0000-0000-0000-000000000002',
              purchaseIntentId: '00000000-0000-0000-0000-000000000003',
              userId: userAlice.userId,
              productId: '00000000-0000-0000-0000-000000000004',
              merchantId: '00000000-0000-0000-0000-000000000005',
              trustedRecipientAddress: '0x1111111111111111111111111111111111111111',
              exactAmount: '5000000',
              assetIdentifier: 'SOL', // Unsupported
              networkIdentifier: 'solana:devnet', // Unsupported
              approvalVersion: 1,
              schemeParameters: {},
              status: 'active',
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              approvedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            intent: {
              id: '00000000-0000-0000-0000-000000000003',
              userId: userAlice.userId,
              conversationId: null,
              productId: '00000000-0000-0000-0000-000000000004',
              merchantId: '00000000-0000-0000-0000-000000000005',
              proposedAmount: '5000000',
              currency: 'SOL',
              assetIdentifier: 'SOL',
              networkIdentifier: 'solana:devnet',
              version: 1,
              status: 'approved',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            requirementItem: {
              scheme: 'exact',
              network: 'solana:devnet',
              asset: 'SOL',
              amount: '5000000',
              payTo: '0x1111111111111111111111111111111111111111',
            },
          }),
        /Permits only Base Sepolia/
      );
    });

    it('produces verified simulated payload for pinned Base Sepolia USDC', async () => {
      const devSigner = new ConstrainedSimulationSigner('development');
      const result = await devSigner.signSimulationAuthorization({
        executionId: '00000000-0000-0000-0000-000000000001',
        snapshot: {
          id: '00000000-0000-0000-0000-000000000002',
          purchaseIntentId: '00000000-0000-0000-0000-000000000003',
          userId: userAlice.userId,
          productId: '00000000-0000-0000-0000-000000000004',
          merchantId: '00000000-0000-0000-0000-000000000005',
          trustedRecipientAddress: '0x1111111111111111111111111111111111111111',
          exactAmount: '5000000',
          assetIdentifier: PHASE3_PINNED_EXECUTION.assetSymbol,
          networkIdentifier: PHASE3_PINNED_EXECUTION.network,
          approvalVersion: 1,
          schemeParameters: {},
          status: 'active',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          approvedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        intent: {
          id: '00000000-0000-0000-0000-000000000003',
          userId: userAlice.userId,
          conversationId: null,
          productId: '00000000-0000-0000-0000-000000000004',
          merchantId: '00000000-0000-0000-0000-000000000005',
          proposedAmount: '5000000',
          currency: 'USDC',
          assetIdentifier: PHASE3_PINNED_EXECUTION.assetSymbol,
          networkIdentifier: PHASE3_PINNED_EXECUTION.network,
          version: 1,
          status: 'approved',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        requirementItem: {
          scheme: PHASE3_PINNED_EXECUTION.scheme,
          network: PHASE3_PINNED_EXECUTION.network,
          asset: PHASE3_PINNED_EXECUTION.assetAddress,
          amount: '5000000',
          payTo: '0x1111111111111111111111111111111111111111',
        },
        resourceUrl: 'https://merchant.local/api/v1/mock-merchant/resources/res_gpu_h100_compute',
      });

      assert.ok(result.authorizationId.startsWith('sim_auth_'));
      assert.ok(result.signature.startsWith('SIMULATED_V2_AUTH_'));
      assert.equal(result.payload.x402Version, 2);
      assert.equal(result.payload.payload.simulated, true);
    });
  });

  // ==========================================
  // 3. Controlled Mock Merchant Protocol Routes
  // ==========================================
  describe('Controlled Mock Merchant HTTP Protocol', () => {
    it('returns HTTP 402 with PAYMENT-REQUIRED header when accessing paywalled resource without signature', async () => {
      // Find a catalog product
      const catRes = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/products',
      });
      const products = catRes.json().products;
      const gpu = products.find((p: any) => p.name.includes('Cloud GPU'));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/mock-merchant/resources/${gpu.id}`,
      });

      assert.equal(res.statusCode, 402);
      const reqHeader = res.headers['payment-required'] as string;
      assert.ok(reqHeader, 'payment-required header present');

      const challenge = decodeX402Header<X402V2PaymentRequired>(reqHeader);
      assert.equal(challenge.x402Version, 2);
      assert.ok(challenge.accepts.length > 0);
      assert.equal(challenge.accepts[0]?.network, PHASE3_PINNED_EXECUTION.network);
    });

    it('returns 402 with corrupt requirements when fault injection is enabled', async () => {
      const catRes = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/products',
      });
      const gpu = catRes.json().products.find((p: any) => p.name.includes('Cloud GPU'));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/mock-merchant/resources/${gpu.id}?fault=corrupt_requirements`,
      });

      assert.equal(res.statusCode, 402);
      const reqHeader = res.headers['payment-required'] as string;
      assert.equal(reqHeader, 'NOT_VALID_BASE64_CORRUPT!@#$');
    });
  });

  // ==========================================
  // 4. Complete End-to-End Payment Lifecycle
  // ==========================================
  describe('Full Payment Lifecycle: Discover -> Select Option -> Approve -> Execute -> Deliver Resource', () => {
    let cloudGpuProduct: any;
    let baseSepoliaOption: any;

    before(async () => {
      const catRes = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/products',
      });
      cloudGpuProduct = catRes.json().products.find((p: any) => p.name.includes('Cloud GPU'));
      assert.ok(cloudGpuProduct, 'Cloud GPU found');

      baseSepoliaOption = cloudGpuProduct.paymentOptions.find(
        (opt: any) => opt.networkIdentifier === PHASE3_PINNED_EXECUTION.network
      );
      assert.ok(baseSepoliaOption, 'Base Sepolia USDC option found in catalog');
    });

    it('creates draft intent, selects Base Sepolia USDC, approves, executes, and delivers resource', async () => {
      // 1. Create Purchase Intent
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/purchases/intents',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          productId: cloudGpuProduct.id,
          paymentOptionId: baseSepoliaOption.id,
        },
      });

      assert.equal(createRes.statusCode, 201);
      const intent = createRes.json().intent;
      assert.equal(intent.status, 'draft');
      assert.equal(intent.networkIdentifier, PHASE3_PINNED_EXECUTION.network);

      // 2. Authoritative Preview
      const previewRes = await app.inject({
        method: 'GET',
        url: `/api/v1/purchases/intents/${intent.id}/preview`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(previewRes.statusCode, 200);
      const { preview, execution: previewExec } = previewRes.json();
      assert.equal(preview.canApprove, true);
      assert.equal(preview.networkIdentifier, PHASE3_PINNED_EXECUTION.network);
      assert.equal(previewExec, null, 'No execution before approval');

      // 3. User Approves Terms Explicitly
      const idempotencyKey = `phase3_test_${Date.now()}`;
      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/intents/${intent.id}/approve`,
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          expectedVersion: intent.version,
          idempotencyKey,
        },
      });

      assert.equal(approveRes.statusCode, 200);
      const approveBody = approveRes.json();
      assert.equal(approveBody.status, 'approved');
      assert.equal(approveBody.message, 'Purchase approved — payment has not been executed.');
      assert.ok(approveBody.snapshot, 'Snapshot returned');
      assert.ok(approveBody.execution, 'Execution record created');

      // The execution was immediately processed synchronously by the state machine
      const exec = approveBody.execution;
      assert.equal(exec.executionStatus, 'SIMULATION_COMPLETED');
      assert.equal(exec.fulfillmentStatus, 'DELIVERED');
      assert.ok(exec.settlementReference?.startsWith('sim_settle'));
      assert.ok(exec.deliveredResource, 'Delivered resource attached');
      assert.equal(exec.deliveredResource.success, true);

      // 4. Inspect Execution Details via API
      const execDetailsRes = await app.inject({
        method: 'GET',
        url: `/api/v1/purchases/executions/${exec.id}`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(execDetailsRes.statusCode, 200);
      const details = execDetailsRes.json();
      assert.equal(details.execution.id, exec.id);
      assert.equal(details.execution.executionStatus, 'SIMULATION_COMPLETED');
      assert.equal(details.snapshot.id, approveBody.snapshot.id);

      // 5. Inspect Paywalled Resource Endpoint
      const resourceRes = await app.inject({
        method: 'GET',
        url: `/api/v1/purchases/executions/${exec.id}/resource`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(resourceRes.statusCode, 200);
      const resourceBody = resourceRes.json();
      assert.equal(resourceBody.simulated, true);
      assert.ok(resourceBody.resource.title);
      assert.ok(resourceBody.resource.deliveredPayload);

      // 6. Idempotent Replay of Approve
      const replayApproveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/intents/${intent.id}/approve`,
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          expectedVersion: intent.version,
          idempotencyKey,
        },
      });

      assert.equal(replayApproveRes.statusCode, 200);
      const replayBody = replayApproveRes.json();
      assert.equal(replayBody.idempotent, true);
      assert.equal(replayBody.execution.id, exec.id);

      // 7. Preview after approval contains completed execution
      const previewAfterRes = await app.inject({
        method: 'GET',
        url: `/api/v1/purchases/intents/${intent.id}/preview`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(previewAfterRes.statusCode, 200);
      const previewAfter = previewAfterRes.json();
      assert.equal(previewAfter.preview.status, 'approved');
      assert.equal(previewAfter.execution.id, exec.id);
      assert.equal(previewAfter.execution.executionStatus, 'SIMULATION_COMPLETED');
    });

    it('rejects option change while execution is in-flight', async () => {
      // Create intent and set execution to in-flight state (SETTLING_SIMULATION)
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/purchases/intents',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          productId: cloudGpuProduct.id,
          paymentOptionId: baseSepoliaOption.id,
        },
      });
      const intent = createRes.json().intent;

      // Insert an in-flight execution record
      const [snap] = await (app as any).db.select().from((await import('@x402/database/schema')).approvalSnapshots).limit(1);
      await (app as any).db.insert((await import('@x402/database/schema')).paymentExecutions).values({
        userId: userAlice.userId,
        purchaseIntentId: intent.id,
        approvalSnapshotId: snap.id,
        executionStatus: 'SETTLING_SIMULATION',
        fulfillmentStatus: 'NOT_STARTED',
        networkIdentifier: PHASE3_PINNED_EXECUTION.network,
        assetIdentifier: PHASE3_PINNED_EXECUTION.assetSymbol,
        amount: '5000000',
        recipientAddress: '0x1111111111111111111111111111111111111111',
        merchantId: cloudGpuProduct.merchantId,
      });

      const altOption = cloudGpuProduct.paymentOptions.find((opt: any) => opt.id !== baseSepoliaOption.id);
      if (altOption) {
        const patchRes = await app.inject({
          method: 'PATCH',
          url: `/api/v1/purchases/intents/${intent.id}/option`,
          headers: { authorization: `Bearer ${aliceToken}` },
          payload: { paymentOptionId: altOption.id },
        });

        assert.equal(patchRes.statusCode, 400);
        assert.ok(patchRes.json().error.message.includes('Cannot change payment option while payment execution is in-flight'));
      }
    });

    it('blocks execution when unpinned catalog option is selected', async () => {
      // Find a non-pinned option (e.g. Solana Devnet or Base Mainnet)
      const unpinnedOption = cloudGpuProduct.paymentOptions.find(
        (opt: any) => opt.networkIdentifier !== PHASE3_PINNED_EXECUTION.network
      );

      if (unpinnedOption) {
        const createRes = await app.inject({
          method: 'POST',
          url: '/api/v1/purchases/intents',
          headers: { authorization: `Bearer ${aliceToken}` },
          payload: {
            productId: cloudGpuProduct.id,
            paymentOptionId: unpinnedOption.id,
          },
        });

        const intent = createRes.json().intent;
        assert.equal(intent.networkIdentifier, unpinnedOption.networkIdentifier);

        // Approve terms
        const approveRes = await app.inject({
          method: 'POST',
          url: `/api/v1/purchases/intents/${intent.id}/approve`,
          headers: { authorization: `Bearer ${aliceToken}` },
          payload: { expectedVersion: intent.version },
        });

        assert.equal(approveRes.statusCode, 200);
        const exec = approveRes.json().execution;

        // The state machine rejects execution of unpinned network/asset combination
        assert.equal(exec.executionStatus, 'BLOCKED');
        assert.equal(exec.failureCode, 'UNSUPPORTED_EXECUTION_COMBINATION');
        assert.ok(exec.failureReason?.includes('Phase 3 execution supports') || exec.failureReason?.includes('not supported'));
      }
    });

    it('enforces isolation: Bob cannot view or retry Alice’s execution', async () => {
      // Create intent and execution for Alice
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/purchases/intents',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          productId: cloudGpuProduct.id,
          paymentOptionId: baseSepoliaOption.id,
        },
      });
      const intent = createRes.json().intent;

      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/intents/${intent.id}/approve`,
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { expectedVersion: intent.version },
      });
      const exec = approveRes.json().execution;

      // Bob tries to access Alice's execution
      const bobRes = await app.inject({
        method: 'GET',
        url: `/api/v1/purchases/executions/${exec.id}`,
        headers: { authorization: `Bearer ${bobToken}` },
      });
      assert.equal(bobRes.statusCode, 404);

      // Bob tries to access Alice's delivered resource
      const bobResourceRes = await app.inject({
        method: 'GET',
        url: `/api/v1/purchases/executions/${exec.id}/resource`,
        headers: { authorization: `Bearer ${bobToken}` },
      });
      assert.equal(bobResourceRes.statusCode, 404);
    });
  });

  // ==========================================
  // 5. Fault Injection, Reconciliation, & Safe Retries
  // ==========================================
  describe('Fault Scenarios, Ledger Reconciliation, & Delivery Retry', () => {
    let cloudGpuProduct: any;
    let baseSepoliaOption: any;

    before(async () => {
      const catRes = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/products',
      });
      cloudGpuProduct = catRes.json().products.find((p: any) => p.name.includes('Cloud GPU'));
      baseSepoliaOption = cloudGpuProduct.paymentOptions.find(
        (opt: any) => opt.networkIdentifier === PHASE3_PINNED_EXECUTION.network
      );
    });

    it('handles lost response by entering RECONCILIATION_REQUIRED, then successfully reconciles via retry', async () => {
      // Create intent
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/purchases/intents',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          productId: cloudGpuProduct.id,
          paymentOptionId: baseSepoliaOption.id,
        },
      });
      const intent = createRes.json().intent;

      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/intents/${intent.id}/approve`,
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          expectedVersion: intent.version,
          mockMerchantFault: 'lost_response',
        },
      });
      const exec = approveRes.json().execution;
      assert.equal(exec.executionStatus, 'RECONCILIATION_REQUIRED');

      // Safe retry reconciliation without creating a double charge
      const retryRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/executions/${exec.id}/retry`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(retryRes.statusCode, 200);
      const retryResult = retryRes.json().result;
      assert.equal(retryResult.executionStatus, 'SIMULATION_COMPLETED');
      assert.ok(retryResult.settlementReference?.startsWith('sim_settle'));
    });

    it('handles resource delivery failure gracefully and allows safe retry without re-charging', async () => {
      // Create intent
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/purchases/intents',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          productId: cloudGpuProduct.id,
          paymentOptionId: baseSepoliaOption.id,
        },
      });
      const intent = createRes.json().intent;

      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/intents/${intent.id}/approve`,
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          expectedVersion: intent.version,
          mockMerchantFault: 'resource_delivery_fail',
        },
      });
      const exec = approveRes.json().execution;
      assert.equal(exec.executionStatus, 'SIMULATION_COMPLETED');
      assert.equal(exec.fulfillmentStatus, 'DELIVERY_FAILED');
      assert.ok(exec.settlementReference?.startsWith('sim_settle'));

      // Safe retry delivery
      const retryRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/executions/${exec.id}/retry`,
        headers: { authorization: `Bearer ${aliceToken}` },
      });

      assert.equal(retryRes.statusCode, 200);
      const retryResult = retryRes.json().result;
      assert.equal(retryResult.fulfillmentStatus, 'DELIVERED');
      assert.ok(retryResult.deliveredResource);
    });
  });

  // ==========================================
  // 6. Emergency Kill Switch Controls
  // ==========================================
  describe('Emergency Kill Switch Controls', () => {
    it('allows inspecting and activating global kill switch', async () => {
      // Check initial state
      const initialRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/kill-switch',
      });
      assert.equal(initialRes.statusCode, 200);
      assert.equal(initialRes.json().killSwitch.active, false);

      // Activate kill switch
      const activateRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/kill-switch',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: {
          enabled: true,
          reason: 'Emergency maintenance drill',
        },
      });

      assert.equal(activateRes.statusCode, 200);
      assert.equal(activateRes.json().killSwitch.active, true);
      assert.equal(activateRes.json().killSwitch.reason, 'Emergency maintenance drill');

      // Attempting to approve an intent while kill switch is active blocks execution
      const catRes = await app.inject({ method: 'GET', url: '/api/v1/catalog/products' });
      const gpu = catRes.json().products.find((p: any) => p.name.includes('Cloud GPU'));
      const opt = gpu.paymentOptions.find((o: any) => o.networkIdentifier === PHASE3_PINNED_EXECUTION.network);

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/purchases/intents',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { productId: gpu.id, paymentOptionId: opt.id },
      });
      const intent = createRes.json().intent;

      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/purchases/intents/${intent.id}/approve`,
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { expectedVersion: intent.version },
      });

      assert.equal(approveRes.statusCode, 200);
      const exec = approveRes.json().execution;
      assert.equal(exec.executionStatus, 'BLOCKED');
      assert.equal(exec.failureCode, 'KILL_SWITCH_ACTIVE');

      // Deactivate kill switch
      const deactRes = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/kill-switch',
        headers: { authorization: `Bearer ${aliceToken}` },
        payload: { enabled: false },
      });
      assert.equal(deactRes.statusCode, 200);
      assert.equal(deactRes.json().killSwitch.active, false);
    });
  });
});
