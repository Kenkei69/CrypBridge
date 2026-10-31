# x402 Guardian — Phase 2 Acceptance Criteria & Evidence

This document evaluates the completed Phase 2 implementation against each required objective and acceptance criterion.

---

## 1. Acceptance Criteria Mapping

### Criterion 1: Natural AI Purchasing Chat & Catalog Discovery
* **Objective**: Authenticated user can describe what they want; the assistant discovers real catalog items from PostgreSQL, handles keyword/budget filtering, asks clarifying questions when ambiguous, and resolves contextual references (e.g. "the first one").
* **Status**: ACCEPTED
* **Evidence**:
  - Implementation in [`assistantService.ts`](file:///home/runner/workspace/apps/api/src/modules/purchasing-assistant/assistantService.ts): `DeterministicDemoAdapter` parses intents, extracts numeric and currency budget constraints, searches the catalog via `searchProducts()`, disambiguates queries, and matches ordinal selections against conversational history.
  - Integration endpoint in [`conversations/index.ts`](file:///home/runner/workspace/apps/api/src/modules/conversations/index.ts#L79): `POST /api/v1/conversations/:id/assistant-reply`.
  - Frontend chat rendering in [`ChatPurchasing.tsx`](file:///home/runner/workspace/apps/web/src/components/ChatPurchasing.tsx) displaying inline product candidate cards with authoritative price labels and a direct "Select" action.
  - Automated tests in [`apps/api/src/tests/phase2_approval_and_assistant.test.ts`](file:///home/runner/workspace/apps/api/src/tests/phase2_approval_and_assistant.test.ts):
    - `searches catalog products based on user natural query and budget`
    - `asks clarifying question when multiple products match ambiguous query`
    - `resolves conversational references like "the first one"`
    - `defends against prompt injection attempts to override price or bypass approval`
  - Browser verification screenshot: [`docs/screenshots/01_product_discovery.png`](file:///home/runner/workspace/docs/screenshots/01_product_discovery.png).

---

### Criterion 2: Multi-Option Payment Selection & Exact Base Units
* **Objective**: Products support multiple asset and network payment options. Switching options recalculates authoritative terms on the backend with zero floating-point math.
* **Status**: ACCEPTED
* **Evidence**:
  - Relational schema in [`packages/database/src/schema/index.ts`](file:///home/runner/workspace/packages/database/src/schema/index.ts#L44): `productPaymentOptions` table storing `network`, `asset`, `amount` (`NUMERIC(78, 0)`), `decimals`, `recipientAddress`, and `isDefault`.
  - Migration script [`0002_phase2_payment_options_and_approvals.sql`](file:///home/runner/workspace/packages/database/src/migrations/0002_phase2_payment_options_and_approvals.sql).
  - Seed script [`packages/database/src/seed.ts`](file:///home/runner/workspace/packages/database/src/seed.ts#L115) populating 10 payment options across 6 products (including Base Sepolia `eip155:84532`, Base Mainnet `eip155:8453`, and Solana Devnet `solana:devnet`).
  - Switching endpoint in [`apps/api/src/modules/purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L106): `PATCH /api/v1/purchases/intents/:id/option` validates option association, updates intent terms, and increments intent `version`.
  - Automated tests:
    - `switches payment option, increments version, and derives authoritative terms`
    - `rejects unassociated or invalid payment options`
  - Browser verification screenshot: [`docs/screenshots/02_payment_option_selection.png`](file:///home/runner/workspace/docs/screenshots/02_payment_option_selection.png).

---

### Criterion 3: Compact Authoritative Approval Card & Expiration
* **Objective**: Display a compact approval card showing product, merchant name with demo badge, terms grid, copyable full recipient address, expiration countdown, simulation badge, and version locking.
* **Status**: ACCEPTED
* **Evidence**:
  - Backend preview endpoint in [`apps/api/src/modules/purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L162): `GET /api/v1/purchases/intents/:id/preview` computing authoritative terms and expiration metadata (`expiresAt`, `isExpired`).
  - UI component in [`CompactApprovalCard.tsx`](file:///home/runner/workspace/apps/web/src/components/CompactApprovalCard.tsx):
    - Product title, merchant with `[Demo Merchant]` verified badge.
    - Terms grid: Amount, Asset, Network, and Scheme (`exact-payment-v1`).
    - Recipient row with full hex/base58 address and copy-to-clipboard button.
    - Expiration indicator and Version tag (`v1`, `v2`, etc.).
    - Simulation notice: "Simulation Mode: No actual funds or signatures are transferred."
  - Browser verification screenshot: [`docs/screenshots/03_approval_preview.png`](file:///home/runner/workspace/docs/screenshots/03_approval_preview.png).

---

### Criterion 4: Explicit Server-Side Approval & Immutable Snapshot
* **Objective**: Approval is an authenticated server-side action. Generates an immutable `ApprovalSnapshot` with exact base-unit binding, optimistic concurrency lock, and idempotency handling.
* **Status**: ACCEPTED
* **Evidence**:
  - Approval endpoint in [`apps/api/src/modules/purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L224): `POST /api/v1/purchases/intents/:id/approve`.
  - Transactional locking: uses `tx.select().from(purchaseIntents).where(...).for('update')` to prevent concurrent approval race conditions.
  - Optimistic locking: verifies `intent.version === body.expectedVersion`; returns HTTP 409 `VERSION_CONFLICT` if mismatched.
  - Idempotency: replaying approval with identical idempotency key or on an already approved intent returns the existing snapshot safely.
  - Snapshot supersession: changing payment options after approval marks prior snapshots as superseded and resets intent status to `'draft'` (`version` incremented).
  - Automated tests:
    - `creates immutable approval snapshot on explicit user approval`
    - `rejects approval when expectedVersion does not match (optimistic lock)`
    - `returns existing approval snapshot idempotently on repeated clicks`
    - `invalidates and supersedes earlier approval when payment option changes`
  - Browser verification screenshot: [`docs/screenshots/04_approved_state.png`](file:///home/runner/workspace/docs/screenshots/04_approved_state.png).

---

### Criterion 5: Exact Approved State Banner Text
* **Objective**: The final approved state must clearly and verbatim state: `"Purchase approved — payment has not been executed."`
* **Status**: ACCEPTED
* **Evidence**:
  - UI banner defined in [`CompactApprovalCard.tsx`](file:///home/runner/workspace/apps/web/src/components/CompactApprovalCard.tsx#L162):
    ```tsx
    <p className="text-sm font-semibold text-emerald-300">
      Purchase approved — payment has not been executed.
    </p>
    ```
  - Backend response message in [`apps/api/src/modules/purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L291):
    ```ts
    message: 'Purchase approved — payment has not been executed.'
    ```
  - Validated by unit test assertion and Playwright E2E assertion:
    ```ts
    expect(body.message).toBe('Purchase approved — payment has not been executed.');
    ```
  - Browser verification screenshot: [`docs/screenshots/04_approved_state.png`](file:///home/runner/workspace/docs/screenshots/04_approved_state.png).

---

### Criterion 6: Rejection Journey
* **Objective**: Users can reject proposed purchases; records rejection reason and marks intent as `'rejected'`.
* **Status**: ACCEPTED
* **Evidence**:
  - Rejection endpoint in [`apps/api/src/modules/purchases/index.ts`](file:///home/runner/workspace/apps/api/src/modules/purchases/index.ts#L309): `POST /api/v1/purchases/intents/:id/reject`.
  - Updates `purchaseIntents.status = 'rejected'` and persists `purchaseIntents.rejectionReason`.
  - Any prior approval snapshots are superseded.
  - UI shows amber rejection badge and reason (`CompactApprovalCard.tsx`).
  - Automated tests:
    - `rejects purchase intent with explicit reason`
    - `prohibits approving a rejected intent`
  - Browser verification screenshot: [`docs/screenshots/05_rejected_state.png`](file:///home/runner/workspace/docs/screenshots/05_rejected_state.png).

---

### Criterion 7: State Persistence & Reload Recovery
* **Objective**: Active conversation, messages, selected product, active draft intent, payment option, and approval snapshot survive browser refresh.
* **Status**: ACCEPTED
* **Evidence**:
  - Frontend persistence logic in [`apps/web/src/app/page.tsx`](file:///home/runner/workspace/apps/web/src/app/page.tsx#L61): on reload or session switch, conversations are fetched from `GET /api/v1/conversations`, latest messages from `GET /api/v1/conversations/:id/messages`, and active intent from `GET /api/v1/purchases/intents`.
  - Preview terms are automatically re-fetched via `GET /api/v1/purchases/intents/:id/preview`.
  - Tested in Playwright E2E Step 9: page reload verified that conversation history, approval status, and snapshot reference remained intact.

---

### Criterion 8: Tenant Isolation & Ownership Controls
* **Objective**: Cross-tenant tampering is prohibited. User B cannot read, post messages to, select options for, or approve User A's intents.
* **Status**: ACCEPTED
* **Evidence**:
  - Cryptographic token identity verification via `fastify.authenticate`.
  - Application-level ownership checks `WHERE user_id = request.user.id` on all endpoints.
  - Returns HTTP 404 for foreign conversation or intent access.
  - Automated test: `prohibits another user (Bob) from modifying Alice’s intent` passes.

---

### Criterion 9: Anti-Fabrication & Strict Simulation Boundary
* **Objective**: Phase 2 ends at purchase authorization. No payment execution, wallet signing, or settlement routes exist.
* **Status**: ACCEPTED
* **Evidence**:
  - Attempts to call `POST /api/v1/approval-snapshots`, `POST /api/v1/settlement-records`, `POST /api/v1/audit-events`, or `POST /api/v1/signer/sign` return HTTP 404.
  - Automated test: `prohibits arbitrary signing or settlement endpoints` passes.
  - No private keys or wallet credentials exist in the codebase.
