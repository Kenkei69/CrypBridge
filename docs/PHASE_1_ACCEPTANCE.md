# x402 Guardian — Phase 1 Acceptance Criteria & Evidence

This document evaluates the completed Phase 1 implementation against each of the required acceptance criteria.

---

## 1. Acceptance Criteria Mapping

### Criterion 1: A fresh checkout can be configured and started using documented commands.
* **Status**: ACCEPTED
* **Evidence**:
  - Validated environment loading via [`loadConfig()`](file:///home/runner/workspace/apps/api/src/config/env.ts#L30) with safe [`.env.example`](file:///home/runner/workspace/.env.example).
  - Reproducible monorepo scripts configured in [`package.json`](file:///home/runner/workspace/package.json): `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm db:migrate`, `pnpm db:seed`.
  - Both `@x402/api` and `@x402/web` successfully compile into production artifacts.

### Criterion 2: Authentication works across frontend and backend.
* **Status**: ACCEPTED
* **Evidence**:
  - Backend JWT verification via `fastify.authenticate` hook in [`auth.ts`](file:///home/runner/workspace/apps/api/src/plugins/auth.ts#L22).
  - Subject identity (`sub`) and email extracted directly from cryptographic signature; client-supplied owner IDs are ignored.
  - Session restoration and profile synchronization implemented in `GET /api/v1/auth/me`.
  - Missing, expired, or tampered tokens return HTTP 401 with stable code `UNAUTHORIZED`.
  - Test evidence: [`apps/api/src/tests/auth_and_session.test.ts`](file:///home/runner/workspace/apps/api/src/tests/auth_and_session.test.ts) (5/5 tests passing).

### Criterion 3: User-scoped records persist and are isolated between users.
* **Status**: ACCEPTED
* **Evidence**:
  - Independent test suites verify User A and User B cross-tenant boundaries.
  - User B receives HTTP 404 when querying User A's conversation, messages, or purchase intent.
  - User B cannot post messages to User A's conversation.
  - User B reading security history sees only their own records.
  - Ownership cannot be spoofed in request bodies (e.g. `userId` in POST body is ignored).
  - Test evidence: [`apps/api/src/tests/isolation_and_ownership.test.ts`](file:///home/runner/workspace/apps/api/src/tests/isolation_and_ownership.test.ts) (3/3 tests passing).

### Criterion 4: Migrations and seeds are reproducible.
* **Status**: ACCEPTED
* **Evidence**:
  - Database schema executed via [`runMigrations()`](file:///home/runner/workspace/packages/database/src/migrate.ts#L10) creating 11 relational tables, unique constraints, and indexes.
  - Database seed executed via [`runSeed()`](file:///home/runner/workspace/packages/database/src/seed.ts#L12) seeding 3 trusted merchants and 5 active products with base-unit integer pricing in `NUMERIC(78, 0)`.
  - Data persists across server restarts and connection teardowns.
  - Test evidence: [`apps/api/src/tests/health_and_persistence.test.ts`](file:///home/runner/workspace/apps/api/src/tests/health_and_persistence.test.ts).

### Criterion 5: Shared contracts and trust boundaries are implemented and documented.
* **Status**: ACCEPTED
* **Evidence**:
  - Strict separation between internal domain models ([`purchases.ts`](file:///home/runner/workspace/packages/shared/src/types/purchases.ts)) and x402 wire types ([`x402.ts`](file:///home/runner/workspace/packages/shared/src/types/x402.ts)).
  - Integration interfaces documented for [`IMerchantPaymentRequirementService`](file:///home/runner/workspace/packages/shared/src/types/integration.ts#L17), [`IGuardianEvaluationEngine`](file:///home/runner/workspace/packages/shared/src/types/integration.ts#L21), [`IPaymentSigner`](file:///home/runner/workspace/packages/shared/src/types/integration.ts#L32), and [`ISettlementAdapter`](file:///home/runner/workspace/packages/shared/src/types/integration.ts#L37).
  - Draft purchase intent creation uses backend catalog pricing; client price arguments are disregarded.
  - Test evidence: [`apps/api/src/tests/catalog_and_purchases.test.ts`](file:///home/runner/workspace/apps/api/src/tests/catalog_and_purchases.test.ts).

### Criterion 6: Configuration, errors, logs, and health checks behave correctly.
* **Status**: ACCEPTED
* **Evidence**:
  - Invalid config throws immediately on startup.
  - Sensitive authorization headers and secrets are redacted by Pino.
  - Correlation ID `x-request-id` attached to every response.
  - Centralized error handler maps errors to stable error codes (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, etc.).
  - `/live` returns 200 OK; `/ready` returns 200 OK when DB is healthy and 503 degraded when DB connection fails.
  - Test evidence: [`apps/api/src/tests/config_and_security.test.ts`](file:///home/runner/workspace/apps/api/src/tests/config_and_security.test.ts) and [`health_and_persistence.test.ts`](file:///home/runner/workspace/apps/api/src/tests/health_and_persistence.test.ts).

### Criterion 7: Relevant checks pass or remaining blockers are explicitly identified.
* **Status**: ACCEPTED
* **Evidence**:
  - All 29 unit and integration tests executed against local PostgreSQL pass with 0 failures and 0 skipped.
  - TypeScript strict compilation passes across all packages and apps with 0 errors.

### Criterion 8: No simulated behavior is presented as real blockchain activity.
* **Status**: ACCEPTED
* **Evidence**:
  - UI displays persistent top banner: "Phase 1 Simulation Mode Active: No blockchain transactions or live signing keys are used."
  - Simulated signatures prefixed `SIMULATED_MOCK_SIGNATURE_...`; simulated settlements prefixed `sim_settle_...`.
  - Simulation adapters refuse initialization in production environments (`APP_ENV === 'production'`).
  - Security history never contains fabricated transactions.
