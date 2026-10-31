# x402 Guardian — Threat Model & Security Boundaries

## 1. Threat Landscape Overview

x402 Guardian sits between autonomous AI purchasing agents, untrusted merchants, and signing infrastructure. The objective is to prevent unauthorized wallet draining, credential interception, and unintended financial expenditure caused by prompt injection, rogue merchants, or corrupted models.

---

## 2. Threat Actors & Scenarios

### Actor A: Prompt-Injected LLM Assistant
* **Vector**: Malicious instructions embedded in product reviews, user inputs, or external web browsing (indirect prompt injection) manipulate the assistant into approving an unintended payment or increasing the purchase amount.
* **Mitigation**:
  1. The AI model has zero spending authority.
  2. The Fastify API accepts only `productId` from the client; payment amount, currency, asset identifier, network identifier, and trusted recipient address are derived strictly from the backend catalog database.
  3. Client-supplied price modifications or recipient overrides are completely ignored or rejected with validation errors.
  4. Messages and untrusted text are rendered safely without interpreting raw HTML or script tags.

### Actor B: Malicious Merchant (Drainer Attack)
* **Vector**: A compromised merchant payment endpoint returns an x402 payment requirement specifying an exorbitant fee, a destination address differing from their verified identity, or an unsupported payment scheme intended to drain funds.
* **Mitigation**:
  1. Merchants must exist in the trusted merchants registry (`merchants.is_trusted = true`).
  2. `ApprovalSnapshot` binds the verified merchant recipient address (`trusted_recipient_address`) independently of merchant-supplied wire claims.
  3. `GuardianEvaluationEngine` checks the compatibility matrix and verifies that the recipient address in any signing payload matches the immutable approval snapshot.
  4. Outbound server-side requests to external merchants must pass [`DefaultDestinationPolicy`](file:///home/runner/workspace/apps/api/src/modules/integrations/destinationPolicy.ts#L15), which blocks SSRF attacks directed at private network IPs (`127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`).

### Actor C: Cross-Tenant Attacker (User B targeting User A)
* **Vector**: An authenticated malicious user crafts API requests targeting conversations, messages, or purchase intents belonging to another user.
* **Mitigation**:
  1. User identity is derived strictly from verified cryptographic JWT signatures (`request.user.id = payload.sub`).
  2. Client-supplied `userId` fields in request bodies or query parameters are rejected or ignored.
  3. Every user-scoped database query enforces an ownership check (`WHERE user_id = request.user.id`).
  4. When an unowned resource is requested, the API returns `404 Not Found` rather than `403 Forbidden` to prevent resource existence enumeration.
  5. PostgreSQL Row-Level Security (RLS) policies provide database engine-level defense-in-depth.

### Actor D: Fabrication of Approvals, Settlements, or Audit Events
* **Vector**: An attacker sends direct `POST` requests attempting to simulate successful payments, fabricate approvals, or tamper with security logs.
* **Mitigation**:
  1. Generic CRUD write endpoints for `approval_snapshots`, `guardian_decisions`, `settlement_records`, and `audit_events` **do not exist**.
  2. The `audit_events` table explicitly revokes `UPDATE` and `DELETE` privileges.
  3. Security history returns only authentic recorded records; no fabricated settlements are ever populated.

### Actor E: Simulation Leakage into Production
* **Vector**: A mock signer or simulation adapter runs in production, producing invalid or unverified transactions that are mistaken for settled onchain payments.
* **Mitigation**:
  1. `SimulationPaymentSigner` and `SimulationSettlementAdapter` check `APP_ENV === 'production'` and throw `SIMULATION_FORBIDDEN_IN_PROD` if invoked in production.
  2. Test token generation (`/api/v1/auth/test-token`) throws `FORBIDDEN` in production.
  3. All simulated signatures and settlement IDs are explicitly prefixed (`SIMULATED_MOCK_SIGNATURE_...`, `sim_settle_...`).

---

## 3. Threat Mitigation Summary Matrix

| Threat Vector | Severity | Architectural Defense | Test Evidence |
| :--- | :--- | :--- | :--- |
| **Catalog Price Manipulation** | Critical | Server-derived catalog pricing in `POST /api/v1/purchases/intents` | `catalog_and_purchases.test.ts` |
| **Cross-Tenant Data Snooping** | High | Auth token `sub` derivation + query-level ownership checks | `isolation_and_ownership.test.ts` |
| **SSRF to Cloud Metadata / LAN** | High | `DefaultDestinationPolicy` private IP and host allowlist validation | `config_and_security.test.ts` |
| **Arbitrary Payload Signing** | Critical | No arbitrary signing endpoint; signers bind only to immutable snapshots | `write_semantics_and_fabrication.test.ts` |
| **Simulation in Production** | High | Fail-fast runtime guard on production initialization | `config_and_security.test.ts` |
| **Audit Log Tampering** | Medium | Append-only RLS policy and non-existent CRUD update routes | `write_semantics_and_fabrication.test.ts` |
| **Floating Point Precision Loss** | Medium | Integer base-unit strings and `NUMERIC(78, 0)` database representation | `catalog_and_purchases.test.ts` |

---

## 4. Known Boundaries & Limitations (Phase 1)

1. **Database Administrator Privilege**:
   As PostgreSQL role `postgres` possesses `BYPASS RLS`, superuser connections technically bypass table-level RLS. Application-level ownership checks guarantee isolation during application runtime, but DBA auditing tools must be maintained separately.
2. **Phase 1 Payment Execution**:
   Real wallet signing and blockchain broadcast are intentionally disabled in Phase 1. `ApprovalSnapshot` creation from user approval and x402 testnet execution will be activated in Phase 2.
