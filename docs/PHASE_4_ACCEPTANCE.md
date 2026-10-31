# x402 Guardian — Phase 4 Acceptance Criteria & Verification Evidence

This document evaluates the completed Phase 4 Blue Team Guardian implementation against all 14 mandatory acceptance criteria.

---

## 1. Acceptance Criteria Mapping

### Criterion 1: Every Payment Execution Passes Through Guardian
* **Objective**: Every payment execution attempt, whether initiated via chat, approval, retry, or background worker, must pass through the deterministic Blue Team Guardian policy engine before authorization or signing can occur.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/modules/payment-engine/paymentExecutionWorker.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/paymentExecutionWorker.ts#L317-L389): `worker.processExecution()` routes every execution through `this.guardianEngine.evaluateAndAuthorize()`.
  - Gate evaluation runs in state `VALIDATING` before any mock merchant interaction, signer invocation, or settlement attempt.
  - If Guardian blocks, state transitions to `BLOCKED`, the explainable decision is persisted, and execution terminates immediately with zero external calls.
  - Automated tests in [`phase4_guardian.test.ts`](file:///home/runner/workspace/apps/api/src/tests/phase4_guardian.test.ts):
    - `executes legitimate purchase: passes Guardian gate, reserves budget, issues permit, signs, and commits reservation`
    - `blocks overpayment parameter attack and records explainable decision`
  - Visual verification: [`08_phase4_successful_simulation.png`](file:///home/runner/workspace/docs/screenshots/08_phase4_successful_simulation.png), [`09_phase4_overpayment_blocked.png`](file:///home/runner/workspace/docs/screenshots/09_phase4_overpayment_blocked.png).

---

### Criterion 2: Exact Approved Parameters Enforced Before Authorization
* **Objective**: Guard against parameter manipulation attacks. The proposed payment parameters (amount, recipient address, network identifier, asset identifier, and scheme) must match the server-authoritative, immutable approval snapshot with byte-for-byte and base-unit integer exactness.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/modules/guardian/policyEvaluator.ts`](file:///home/runner/workspace/apps/api/src/modules/guardian/policyEvaluator.ts#L48-L155):
    - Exact BigInt string equality check: `proposed.amount === snapshot.exactAmount`. Overpayment, underpayment, or floating point variations fail closed with reason code `AMOUNT_MISMATCH`.
    - Normalised hex address equality check: `normalizeEvmAddress(proposed.recipientAddress) === normalizeEvmAddress(snapshot.trustedRecipientAddress)`. Wrong recipient fails closed with reason code `RECIPIENT_MISMATCH`.
    - Pinned network check: requires `eip155:84532` (Base Sepolia). Non-pinned networks fail with reason code `NETWORK_NOT_ALLOWED`.
    - Pinned asset check: requires `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (USDC). Other assets fail with reason code `ASSET_NOT_ALLOWED`.
    - Exact scheme check: requires scheme `'exact'`. Flexible or variable schemes fail with reason code `SCHEME_NOT_ALLOWED`.
  - Automated tests:
    - `blocks overpayment parameter attack and records explainable decision`
    - `blocks wrong recipient parameter attack and records explainable decision`
    - `blocks asset manipulation attack`
    - `blocks network manipulation attack`
  - Visual verification: [`09_phase4_overpayment_blocked.png`](file:///home/runner/workspace/docs/screenshots/09_phase4_overpayment_blocked.png), [`10_phase4_wrong_recipient_blocked.png`](file:///home/runner/workspace/docs/screenshots/10_phase4_wrong_recipient_blocked.png).

---

### Criterion 3: Signer Independently Rejects Altered or Unauthorized Requests
* **Objective**: The signer boundary must not accept a bare decision ID or boolean flag as permission to sign. The simulation signer must independently validate a cryptographically bound Execution Permit, verify its HMAC signature, compare canonical parameters, and check the database state for an active spending reservation and valid worker fencing token.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/modules/payment-engine/constrainedSigner.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/constrainedSigner.ts#L95-L225):
    - Validates HMAC-SHA256 signature on `ExecutionPermit` using `verifyExecutionPermit()`.
    - Compares permit `executionId`, `intentId`, `snapshotId`, `amount`, and `recipientAddress` against requested signing parameters.
    - Queries `spending_reservations` table to verify that an active reservation (`RESERVED` or `COMMITTED`) exists.
    - Queries `payment_executions` to verify that the worker's fencing token equals the database fencing token.
    - Throws `PERMIT_TAMPERED`, `PERMIT_EXPIRED`, `RESERVATION_MISSING`, or `STALE_WORKER_FENCING_TOKEN` if any check fails.
  - Automated tests:
    - `independently validates ExecutionPermit HMAC signature and rejects forged permit`
    - `rejects execution permit if payment parameters were altered after Guardian issuance`
    - `rejects signing if budget reservation is missing or not active`

---

### Criterion 4: Prompt Content and Model Output Cannot Grant Spending Authority
* **Objective**: Language models and assistant responses are treated as untrusted text. Prompt content, model prose, and product descriptions cannot set prices, change recipients, approve purchases, or modify spending policies.
* **Status**: ACCEPTED
* **Evidence**:
  - Authority separation enforced in [`apps/api/src/modules/purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L320): purchase intents and approval snapshots are populated strictly from server database records (`products`, `product_payment_options`, `merchants`). Chat prose is never parsed for payment parameters.
  - Guardian evaluates parameters strictly from immutable server-side records.
  - Benign descriptions containing words like "override", "bypass", "system", or "ignore" do not cause false positives because authorization checks evaluate parameter integrity, not classifier heuristics.
  - Automated tests:
    - `verifies that malicious merchant description cannot manipulate payment recipient or amount`
    - `verifies benign security text in product does not trigger false positive blocks`

---

### Criterion 5: Spending Limits Enforced Atomically Under Concurrency
* **Objective**: Spending limits (per-payment, per-task, and daily UTC window) must be enforced atomically in PostgreSQL using row-level locking (`SELECT ... FOR UPDATE`) to prevent race conditions and double-spending.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/modules/guardian/reservationService.ts`](file:///home/runner/workspace/apps/api/src/modules/guardian/reservationService.ts#L48-L135):
    - Acquires row lock on user policy: `tx.select().from(guardianPolicies).where(...).for('update')`.
    - Aggregates existing active spend within current UTC calendar day window (`windowStartedAt <= now < windowExpiresAt`):
      `SUM(amount) WHERE reservation_status IN ('RESERVED', 'COMMITTED')`.
    - If `totalActive + proposedAmount > maxAmountPerDailyWindow`, aborts and returns `LIMIT_EXCEEDED_DAILY`.
    - If `proposedAmount > maxAmountPerPayment`, aborts and returns `LIMIT_EXCEEDED_PAYMENT`.
    - Inserts new `spending_reservations` row with `reservation_status = 'RESERVED'`.
  - Automated tests:
    - `prevents concurrent purchases from exceeding daily budget (race condition defense)`: fires 4 concurrent purchases of 30 USDC each against a 100 USDC limit; exactly 3 succeed ($90 spent), 4th is blocked ($120 rejected).
    - `enforces exact single-payment limit: exact limit succeeds, one unit above is blocked`
  - Visual verification: [`11_phase4_budget_limit_exceeded.png`](file:///home/runner/workspace/docs/screenshots/11_phase4_budget_limit_exceeded.png).

---

### Criterion 6: Reservations Survive Restarts and Uncertain Outcomes
* **Objective**: Spending reservations follow a strict lifecycle: `RESERVED` -> `COMMITTED` -> `RELEASED`. Uncertain outcomes (network drop, merchant timeout, resource delivery failure) must hold reservations to prevent double-spending; reservations release only upon definitive settlement rejection.
* **Status**: ACCEPTED
* **Evidence**:
  - Lifecycle states defined in [`packages/shared/src/types/guardian.ts`](file:///home/runner/workspace/packages/shared/src/types/guardian.ts#L55): `'RESERVED' | 'COMMITTED' | 'RELEASED'`.
  - Database schema: `spending_reservations` in [`packages/database/src/schema/index.ts`](file:///home/runner/workspace/packages/database/src/schema/index.ts#L225) with audit timestamp columns `committed_at`, `released_at`, `release_reason`.
  - Delivery failure handling: if simulated settlement succeeds but delivery fails, `commitSpendingReservation()` is called because ledger settlement occurred.
  - Timeout / ambiguous outcome handling: execution enters `RECONCILIATION_REQUIRED`, and reservation remains `RESERVED` until ledger reconciliation resolves it.
  - Automated tests:
    - `handles resource delivery failure gracefully and retains COMMITTED budget reservation`
    - `retains RESERVED budget reservation during network timeout / lost response`
    - `safely releases reservation on definitive rejection and prevents release of committed reservation`

---

### Criterion 7: Replay and Stale-Worker Paths Cannot Create Additional Settlement
* **Objective**: Monotonically increasing worker lease generation/fencing tokens (`fencing_token`) must prevent superseded or expired workers from executing state mutations or obtaining signing authority. Purchase-level settlement uniqueness must prevent duplicate settlements.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/modules/payment-engine/paymentExecutionWorker.ts`](file:///home/runner/workspace/apps/api/src/modules/payment-engine/paymentExecutionWorker.ts#L180-L198):
    - Lease acquisition increments `fencing_token = execution.fencingToken + 1`.
    - All state mutations verify `where(and(eq(paymentExecutions.id, id), eq(paymentExecutions.fencingToken, fencingToken)))`.
    - If another worker has acquired a lease in the interim, `fencing_token` in the database is higher; the update returns 0 rows and throws `AppError.conflict('Worker lease lost or superseded', 'STALE_WORKER_FENCING_TOKEN')`.
  - Database uniqueness constraint: `payment_executions_purchase_intent_unique` and `simulation_settlement_ledger_intent_unique` in [`0004_settlement_purchase_intent_unique.sql`](file:///home/runner/workspace/packages/database/src/migrations/0004_settlement_purchase_intent_unique.sql).
  - Automated tests:
    - `prevents duplicate execution of already settled purchase`
    - `protects against stale workers with superseded fencing tokens attempting authorization or settlement`

---

### Criterion 8: Decisions Are Explainable, Persisted, and Isolated by User
* **Objective**: Every Guardian decision (ALLOW and BLOCK) is persisted to an append-only ledger with correlation IDs, reason codes, structured rule breakdown, and user ownership isolation.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/modules/guardian/decisionRepository.ts`](file:///home/runner/workspace/apps/api/src/modules/guardian/decisionRepository.ts):
    - Inserts immutable `guardian_decisions` rows with `outcome`, `reason_code`, `reason`, `rules_evaluated`, `canonical_terms`, `proposed_terms`, `correlation_id`.
    - Querying endpoints `GET /api/v1/guardian/decisions` and `GET /api/v1/guardian/decisions/:id` enforce `eq(guardianDecisions.userId, authUser.id)`.
    - RLS policy `guardian_decisions_user_isolation` enforces PostgreSQL-level boundary.
  - Automated tests:
    - `enforces user isolation on decision history and inspection`
  - Visual verification: [`12_phase4_decision_details_expanded.png`](file:///home/runner/workspace/docs/screenshots/12_phase4_decision_details_expanded.png), [`13_phase4_security_history.png`](file:///home/runner/workspace/docs/screenshots/13_phase4_security_history.png).

---

### Criterion 9: Administrator Privileges Cannot Be Self-Assigned
* **Objective**: Role elevation must be strictly blocked. User metadata, profile updates, and ordinary purchase endpoints cannot self-assign the `admin` role. Administrative policy changes require verified server-side admin credentials.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/modules/auth/index.ts`](file:///home/runner/workspace/apps/api/src/modules/auth/index.ts#L45-L95): `PATCH /api/v1/auth/profile` parses only `displayName` and `avatarUrl`; any client-supplied `role` is stripped and ignored.
  - Route guard `app.requireAdmin` in [`apps/api/src/plugins/auth.ts`](file:///home/runner/workspace/apps/api/src/plugins/auth.ts#L65): verifies `request.user.role === 'admin'`.
  - Administrative routes: `PUT /api/v1/admin/guardian/policy` and `POST /api/v1/admin/kill-switch` return HTTP 403 `FORBIDDEN` for non-admin callers.
  - Automated tests:
    - `prohibits ordinary users from modifying spending policy`
    - `allows administrator to update spending policy`
    - `prohibits self-elevation of administrator role via profile updates`

---

### Criterion 10: Existing Purchasing, Simulation, Fulfillment, and Reconciliation Flows Work
* **Objective**: Phase 1 auth/data, Phase 2 purchasing chat/approval, and Phase 3 simulated payment engine/reconciliation must remain intact with zero regression.
* **Status**: ACCEPTED
* **Evidence**:
  - Full test suite execution: **97 passed out of 97 tests** across 28 suites (0 failed, 0 skipped).
  - All 21 Phase 3 tests and all 29 Phase 1/2 tests continue to pass without modification.
  - Full purchasing conversational workflow verified through end-to-end browser journeys.

---

### Criterion 11: Tests Verify Signing and Settlement Boundaries, Not Only UI Messages
* **Objective**: Automated tests must directly assert on database records, signer HMAC permit verification, ledger rows, and reservation states rather than inferring security from frontend strings alone.
* **Status**: ACCEPTED
* **Evidence**:
  - Implemented in [`apps/api/src/tests/phase4_guardian.test.ts`](file:///home/runner/workspace/apps/api/src/tests/phase4_guardian.test.ts):
    - Directly asserts on `guardianDecisions` database table for persisted reason codes and outcomes.
    - Directly asserts on `spendingReservations` table for `RESERVED`, `COMMITTED`, `RELEASED` states.
    - Directly asserts on `paymentExecutions.fencingToken` monotonically increasing values.
    - Directly invokes `ConstrainedSimulationSigner.signSimulationAuthorization()` to assert parameter and permit rejection.
    - Directly checks that no ledger rows are inserted when Guardian blocks.

---

### Criterion 12: Documentation Distinguishes Simulation Evidence from Real-Wallet Security
* **Objective**: Explicitly document that HMAC permits and database ledgers are demonstration simulation boundaries, not real-chain cryptographic proofs, smart contract locks, or real-wallet private key security.
* **Status**: ACCEPTED
* **Evidence**:
  - Clearly articulated in [`docs/PHASE_4_COMPLETION_REPORT.md`](file:///home/runner/workspace/docs/PHASE_4_COMPLETION_REPORT.md), [`docs/GUARDIAN_POLICY.md`](file:///home/runner/workspace/docs/GUARDIAN_POLICY.md), and UI banners:
    > "Simulation Mode: Server-controlled mock settlement; no real funds transferred. Zero-loss boundary enforced in demonstration environment."

---

### Criterion 13: No Real Keys, Live Payments, or Public Attack Interface
* **Objective**: No live private keys, mainnet RPC connections, external payment broadcasts, or unauthenticated public vulnerability endpoints are added.
* **Status**: ACCEPTED
* **Evidence**:
  - All keys are simulated HMAC strings.
  - All networks are restricted to Base Sepolia testnet identifier (`eip155:84532`).
  - Production mode strictly rejected by `ConstrainedSimulationSigner` and `SimulationSettlementEngine`.
  - Fault injection controls require `NODE_ENV === 'test'`.

---

### Criterion 14: Strict Local Retention — Nothing Pushed or Published
* **Objective**: All Phase 4 code, tests, documentation, and screenshots must remain local. No git pushes to GitHub, pull requests, or deployments.
* **Status**: ACCEPTED
* **Evidence**:
  - `git status` confirms no commits have been pushed to `origin/main`.
  - All work resides locally in `/home/runner/workspace`.
