# x402 Guardian — Phase 3 Acceptance Criteria & Evidence

This document evaluates the completed Phase 3 implementation against all 14 mandatory objectives and acceptance criteria.

---

## 1. Acceptance Criteria Mapping

### Criterion 1: Complete Simulated Payment Execution Lifecycle
* **Objective**: Connect explicit user approval from Phase 2 into an automated, durable payment execution lifecycle: worker queue, merchant 402 challenge negotiation, terms validation, simulation signing, mock settlement, and paywalled resource delivery.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`paymentExecutionWorker.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/paymentExecutionWorker.ts): `PaymentExecutionWorker` handles end-to-end execution.
  - Route integration in [`apps/api/src/modules/purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L705): `POST /api/v1/purchases/intents/:id/approve` atomically creates an `approval_snapshots` row and a `payment_executions` row (`QUEUED`), then invokes the worker.
  - State machine lifecycle transitions: `QUEUED` -> `VALIDATING` -> `SIMULATING_AUTHORIZATION` -> `SETTLING_SIMULATION` -> `SIMULATION_COMPLETED`.
  - Automated tests in [`phase3_payment_engine.test.ts`](file:///home/runner/workspace/apps/api/src/tests/phase3_payment_engine.test.ts): `creates draft intent, selects Base Sepolia USDC, approves, executes, and delivers resource`.
  - Visual verification: [`01_approval_before_execution.png`](file:///home/runner/workspace/docs/screenshots/01_approval_before_execution.png), [`02_processing_card.png`](file:///home/runner/workspace/docs/screenshots/02_processing_card.png), [`03_simulated_completion.png`](file:///home/runner/workspace/docs/screenshots/03_simulated_completion.png).

---

### Criterion 2: Pinned x402 V2 Protocol Combination
* **Objective**: Pin execution strictly to the x402 V2 protocol specification: `x402Version: 2`, scheme `'exact'`, network `'eip155:84532'` (Base Sepolia), and token `'0x036CbD53842c5426634e7929541eC2318f3dCF7e'` (USDC). Other catalog options remain selectable for preview/authorization, but execution rejects unpinned combinations with clear reason codes.
* **Status**: ACCEPTED
* **Evidence**:
  - Pinned specification constants in [`packages/shared/src/constants/index.ts`](file:///home/runner/workspace/packages/shared/src/constants/index.ts#L10): `PHASE3_PINNED_EXECUTION` defining `x402Version: 2`, `scheme: 'exact'`, `networkIdentifier: 'eip155:84532'`, and `tokenContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'`.
  - Authorization Gate enforcement in [`authorizationGate.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/authorizationGate.ts#L48): validates network and asset, rejecting non-pinned networks with code `'UNSUPPORTED_EXECUTION_COMBINATION'`.
  - Automated tests: `blocks execution when unpinned catalog option is selected (solana:devnet / eip155:8453)`.
  - Visual verification: [`05_blocked_execution.png`](file:///home/runner/workspace/docs/screenshots/05_blocked_execution.png) showing blocked execution card with reason code `UNSUPPORTED_EXECUTION_COMBINATION`.

---

### Criterion 3: Wire Protocol Transport & Base64 Encoding
* **Objective**: Implement Base64 JSON transport encoders and decoders for `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` headers with 64KB size limits, corrupt header defense, and version checks.
* **Status**: ACCEPTED
* **Evidence**:
  - Transport utilities in [`packages/shared/src/types/x402.ts`](file:///home/runner/workspace/packages/shared/src/types/x402.ts#L65): `encodeX402Header()` and `decodeX402Header()`.
  - Parser implementation in [`requirementsParser.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/requirementsParser.ts): parses Base64 payloads, rejects strings > 64KB, validates against `X402V2PaymentRequiredSchema`, enforces `x402Version === 2`, and rejects corrupt or non-Base64 input.
  - Automated tests:
    - `encodes and decodes standard x402 V2 requirement objects`
    - `rejects header payloads exceeding 64KB size threshold`
    - `rejects corrupt Base64 or non-JSON payloads`
    - `rejects version mismatch (e.g. version 1)`

---

### Criterion 4: Authorization Gate & Anti-Tampering Defense
* **Objective**: Guard against malicious or modified merchant terms. Compares merchant-demanded 402 requirements against the server-authoritative immutable `approval_snapshots`.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`authorizationGate.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/authorizationGate.ts):
    - Validates ownership (`snapshot.userId === execution.userId`).
    - Validates snapshot status is active and not expired (`snapshot.expiresAt > now`).
    - Compares demanded recipient against `snapshot.trustedRecipientAddress` (case-insensitive hex check).
    - Compares demanded exact amount against `snapshot.exactAmount` (BigInt string equality).
    - Compares network and asset against snapshot terms.
  - Automated tests:
    - `rejects merchant requirements where price is tampered higher than approved terms`
    - `rejects merchant requirements where recipient address does not match approved recipient`

---

### Criterion 5: Constrained Simulation Signer & Production Refusal
* **Objective**: Constrained simulation signer that independently verifies terms before signing, produces HMAC-SHA256 simulation integrity tokens, and strictly refuses to sign for production targets.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`constrainedSigner.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/constrainedSigner.ts):
    - Checks `isProductionTarget()` against known mainnet networks (`eip155:1`, `eip155:8453`, `solana:mainnet-beta`); throws `SIGNER_REFUSED_PRODUCTION` if production target is detected.
    - Generates deterministic simulated authorization ID `sim_auth_<uuid>`.
    - Generates HMAC-SHA256 signature token using server-side HMAC key over authorization terms (`${authId}:${network}:${asset}:${amount}:${payTo}`).
    - Emits structured `X402V2PaymentPayload` with `x402Version: 2`, `scheme: 'exact'`, and simulated client payload.
  - Automated tests:
    - `refuses to sign if network is a production network`
    - `refuses to sign if terms mismatch snapshot`
    - `generates valid simulation signature and integrity token for pinned Base Sepolia USDC`

---

### Criterion 6: Controlled Mock Merchant HTTP Protocol
* **Objective**: Spec-compliant mock merchant service and endpoints returning 402 with `PAYMENT-REQUIRED` on unsigned requests, and 200 with `PAYMENT-RESPONSE` plus resource payload upon receiving valid `PAYMENT-SIGNATURE`.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`mockMerchantService.ts`](file:///home/runner/workspace/apps/api/src/modules/mock-merchant/mockMerchantService.ts) and routes in [`mock-merchant/index.ts`](file:///home/runner/workspace/apps/api/src/modules/mock-merchant/index.ts):
    - `GET /api/v1/mock-merchant/resources/:id` without `PAYMENT-SIGNATURE` returns HTTP 402 with `PAYMENT-REQUIRED` header containing base64 requirements.
    - `GET /api/v1/mock-merchant/resources/:id` with valid `PAYMENT-SIGNATURE` returns HTTP 200 with `PAYMENT-RESPONSE` header and unlocked demonstration resource.
    - Configurable test fault injections: `'corrupt_requirements'`, `'lost_response'`, `'delivery_failure'`.
  - Automated tests:
    - `returns HTTP 402 with PAYMENT-REQUIRED header when accessing paywalled resource without signature`
    - `returns 402 with corrupt requirements when fault injection is enabled`

---

### Criterion 7: Durable Payment Execution Worker & Leases
* **Objective**: Atomic worker lease acquisition to prevent race conditions across parallel workers or concurrent client actions. Implements state transitions, lease timeouts, and lease release.
* **Status**: ACCEPTED
* **Evidence**:
  - Schema columns in [`packages/database/src/schema/index.ts`](file:///home/runner/workspace/packages/database/src/schema/index.ts#L107): `workerLeaseExpiresAt`, `workerInstanceId`, `reconciliationAttempts`.
  - Implemented in [`paymentExecutionWorker.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/paymentExecutionWorker.ts#L60):
    - `acquireLease()` performs atomic SQL update: `UPDATE payment_executions SET worker_instance_id = ..., worker_lease_expires_at = ... WHERE id = ... AND (worker_lease_expires_at IS NULL OR worker_lease_expires_at < NOW())`.
    - Handles unexpected worker termination by clearing leases on failure.
  - Prevents option switching during in-flight processing (`VALIDATING`, `SIMULATING_AUTHORIZATION`, `SETTLING_SIMULATION`).
  - Automated test: `rejects option change while execution is in-flight`.

---

### Criterion 8: Settled Simulation Ledger & Replay Protection
* **Objective**: Durable settlement records table storing completed simulated transactions, preventing replay or double-settlement.
* **Status**: ACCEPTED
* **Evidence**:
  - Schema in [`packages/database/src/schema/index.ts`](file:///home/runner/workspace/packages/database/src/schema/index.ts#L125): `settlementRecords` table linked via foreign key `paymentExecutionId` to `paymentExecutions`.
  - Migration script: [`0003_phase3_payment_engine_and_executions.sql`](file:///home/runner/workspace/packages/database/src/migrations/0003_phase3_payment_engine_and_executions.sql).
  - Implementation in [`simulationSettlementAdapter.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/simulationSettlementAdapter.ts#L75): checks existing settlements for `paymentExecutionId` or authorization hash; returns existing settlement without duplicate inserts.
  - Automated test: `executes full payment lifecycle and records immutable settlement record`.

---

### Criterion 9: Ledger Reconciliation for Ambiguous Outcomes
* **Objective**: When merchant responses are dropped or interrupted in transit (`lost_response`), transition execution to `RECONCILIATION_REQUIRED` and resolve outcome without duplicate charges by querying the settlement ledger.
* **Status**: ACCEPTED
* **Evidence**:
  - Fault handling in [`paymentExecutionWorker.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/paymentExecutionWorker.ts#L415): detects network timeout / dropped response, marks execution as `RECONCILIATION_REQUIRED`, and leaves settlement record intact.
  - Reconcile endpoint [`POST /api/v1/purchases/executions/:id/retry`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L943): calls `worker.retryExecution()`, checks ledger via `settlementEngine.reconcileOutcome()`, detects settled state, delivers resource, and updates status to `SIMULATION_COMPLETED`.
  - Frontend UI component [`CompactApprovalCard.tsx`](file:///home/runner/workspace/apps/web/src/components/CompactApprovalCard.tsx#L470): displays amber Reconciliation Card with "Reconcile Status" button (`data-testid="reconcile-btn"`).
  - Automated test: `handles lost response by entering RECONCILIATION_REQUIRED, then successfully reconciles via retry`.
  - Visual verification: [`06_reconciliation_pending.png`](file:///home/runner/workspace/docs/screenshots/06_reconciliation_pending.png).

---

### Criterion 10: Paywalled Demonstration Resource Delivery & Safe Retry
* **Objective**: Verified settlement unlocks real demonstration resources from the database. Delivery failure allows safe retry without re-charging.
* **Status**: ACCEPTED
* **Evidence**:
  - Schema table in [`packages/database/src/schema/index.ts`](file:///home/runner/workspace/packages/database/src/schema/index.ts#L85): `mockMerchantResources` table storing paywalled payload fixtures.
  - Seed fixtures in [`packages/database/src/seed.ts`](file:///home/runner/workspace/packages/database/src/seed.ts#L225): 6 demonstration resources (e.g. Cloud GPU SSH compute keys, LLM inference API bearer tokens, 30-day Threat Feed JSON bundles).
  - Delivery retry handler in [`paymentExecutionWorker.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/paymentExecutionWorker.ts#L587): safely fetches paywalled resource from database and marks `fulfillmentStatus = 'DELIVERED'` without re-authorizing or re-settling.
  - Demonstration resource modal inspector in [`CompactApprovalCard.tsx`](file:///home/runner/workspace/apps/web/src/components/CompactApprovalCard.tsx#L550): displays JSON/text resource payload, metadata, and copy options.
  - Automated test: `handles resource delivery failure gracefully and allows safe retry without re-charging`.
  - Visual verification: [`04_demonstration_resource.png`](file:///home/runner/workspace/docs/screenshots/04_demonstration_resource.png).

---

### Criterion 11: Emergency Kill Switch Controls
* **Objective**: Global administrative kill switch to immediately halt all payment executions in an emergency.
* **Status**: ACCEPTED
* **Evidence**:
  - Implementation in [`killSwitch.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/killSwitch.ts): in-memory emergency kill switch toggle with audit logging.
  - API routes in [`purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L985): `GET /api/v1/admin/kill-switch` and `POST /api/v1/admin/kill-switch`.
  - Authorization Gate enforcement in [`authorizationGate.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/authorizationGate.ts#L40): throws `AppError.forbidden('Emergency kill switch is currently active', 'KILL_SWITCH_ACTIVE')`.
  - Automated test: `allows inspecting and activating global kill switch`.

---

### Criterion 12: Multi-Tenant User Isolation & Ownership
* **Objective**: Strict ownership enforcement prevents users from viewing, processing, or retrying executions owned by other users.
* **Status**: ACCEPTED
* **Evidence**:
  - Database schema RLS policies in [`0003_phase3_payment_engine_and_executions.sql`](file:///home/runner/workspace/packages/database/src/migrations/0003_phase3_payment_engine_and_executions.sql).
  - API route queries enforce `where(and(eq(paymentExecutions.id, id), eq(paymentExecutions.userId, request.user.id)))`.
  - Automated test in [`phase3_payment_engine.test.ts`](file:///home/runner/workspace/apps/api/src/tests/phase3_payment_engine.test.ts#L430): `enforces isolation: Bob cannot view or retry Alice’s execution`.

---

### Criterion 13: Frontend UI Result Cards & Modal Inspector
* **Objective**: Responsive, accessible frontend cards reflecting processing, settled, blocked, and reconciliation states, plus modal resource inspection.
* **Status**: ACCEPTED
* **Evidence**:
  - Implementation in [`CompactApprovalCard.tsx`](file:///home/runner/workspace/apps/web/src/components/CompactApprovalCard.tsx):
    - `data-testid="processing-card"`
    - `data-testid="simulated-completion-card"`
    - `data-testid="blocked-card"`
    - `data-testid="reconciliation-card"`
    - `data-testid="demonstration-resource-modal"`
  - Responsive design supports desktop viewports (1280px) and mobile viewports (375px).
  - Visual verification:
    - [`02_processing_card.png`](file:///home/runner/workspace/docs/screenshots/02_processing_card.png)
    - [`03_simulated_completion.png`](file:///home/runner/workspace/docs/screenshots/03_simulated_completion.png)
    - [`04_demonstration_resource.png`](file:///home/runner/workspace/docs/screenshots/04_demonstration_resource.png)
    - [`05_blocked_execution.png`](file:///home/runner/workspace/docs/screenshots/05_blocked_execution.png)
    - [`06_reconciliation_pending.png`](file:///home/runner/workspace/docs/screenshots/06_reconciliation_pending.png)
    - [`07_mobile_result_card.png`](file:///home/runner/workspace/docs/screenshots/07_mobile_result_card.png)

---

### Criterion 14: Prominent Simulation Invariant
* **Objective**: Every UI card, modal inspector, API response, and documentation artifact explicitly states that no real funds were transferred, no blockchain transactions were broadcast, and all private keys are mocked/simulated.
* **Status**: ACCEPTED
* **Evidence**:
  - UI banners in [`CompactApprovalCard.tsx`](file:///home/runner/workspace/apps/web/src/components/CompactApprovalCard.tsx):
    - Approval warning notice: *"Approving will start a simulated purchase under simulation mode. No real funds or blockchain signatures are used."*
    - Completion card banner: *"Simulation Mode: No real funds were transferred. No blockchain transaction occurred."*
    - Processing notice: *"Simulation Mode: Server-controlled mock settlement; no real funds transferred."*
    - Blocked notice: *"Zero-Loss Boundary Enforced: No payment authorization was produced and no settlement occurred."*
  - Resource payload banner: *"Demonstration Paywalled Resource — Accessible exclusively via simulated x402 payment flow."*
  - Visual confirmation present across all captured screenshots.

---

### Criterion 15: Hardened Review Controls & Security Boundaries
* **Objective**: Enforce server-verified administrator authentication on emergency controls, restrict fault injection to automated test environments, guarantee purchase-level settlement uniqueness, protect against stale worker races, and verify fresh database bootstrapping on disposable databases.
* **Status**: ACCEPTED
* **Evidence**:
  - Kill-switch mutation (`POST /api/v1/admin/kill-switch`) protected with `app.requireAdmin` (verifying token `role === 'admin'`). Non-admin callers receive 403 `ADMIN_REQUIRED`, unauthenticated callers receive 401 `UNAUTHORIZED`.
  - Fault injection controls (`mockMerchantFault`, `query.fault`) restricted strictly to `process.env.NODE_ENV === 'test'`. Non-test requests are rejected with 403 `FAULT_INJECTION_RESTRICTED`.
  - Migration `0004_settlement_purchase_intent_unique.sql` created a unique index on `settlement_records(purchase_intent_id)`. Replay settlement queries and conflict recovery in `SimulationSettlementEngine` guarantee strict 1:1 settlement uniqueness per purchase intent.
  - Stale worker handling in `PaymentExecutionWorker` verifies `worker_id` lease ownership on all intermediate state transitions (`updateExecutionWithLease`); stale workers are safely rejected with 409 `WORKER_LEASE_LOST`.
  - Historical Phase 2 approvals do not auto-execute; re-approval is strictly idempotent, and execution requires an explicit request to `POST /api/v1/purchases/intents/:id/execute`.
  - Disposable database verification: created fresh database `x402_disposable_test`, ran all 4 migrations (`0001` through `0004`), executed seeds, and dropped cleanly without resetting the primary development database.
