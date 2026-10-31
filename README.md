# CrypBridge — x402 Guardian

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-black.svg)](https://fastify.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.10-336791.svg)](https://www.postgresql.org/)
[![Tests](https://img.shields.io/badge/Tests-97%20Passing-emerald.svg)](./apps/api/src/tests)

x402 Guardian protects AI-assisted purchases by checking proposed payments against trusted user authorization before signing or onchain settlement.

---

## Architecture Overview

x402 Guardian is architected as a modular monorepo:

- **`packages/shared`**: Shared contracts, domain types, Zod schemas, stable error codes, x402 V2 wire contracts, Guardian policy types, Execution Permits, and Base64 transport utilities.
- **`packages/database`**: Drizzle schema, SQL migrations, seed scripts, connection pool, spending reservation records, Guardian decision logs, and Row-Level Security (RLS) policies.
- **`apps/api`**: Fastify backend API with AI assistant service (`DeterministicDemoAdapter`), catalog search, payment option switching, simulated x402 payment engine, Blue Team Guardian security engine, atomic spending reservations, HMAC-based cryptographic execution permits, pre-signing Authorization Gate, constrained simulation signer, simulation settlement adapter, mock merchant service, and emergency kill switch.
- **`apps/web`**: Next.js 14 & Tailwind CSS dashboard featuring conversational purchasing chat, inline product recommendations, compact authoritative approval cards with Guardian verification badges and accordion checks, budget allowance meter, option switching, in-flight processing animation, simulated settled cards, reconciliation recovery, paywalled demonstration resource modal inspector, security history panel with Guardian decision explorer, and state rehydration.

For complete architectural details, see [docs/ARCHITECTURE.md](file:///home/runner/workspace/docs/ARCHITECTURE.md), [docs/THREAT_MODEL.md](file:///home/runner/workspace/docs/THREAT_MODEL.md), [docs/GUARDIAN_POLICY.md](file:///home/runner/workspace/docs/GUARDIAN_POLICY.md), [docs/GUARDIAN_TEST_MATRIX.md](file:///home/runner/workspace/docs/GUARDIAN_TEST_MATRIX.md), and [docs/X402_COMPATIBILITY.md](file:///home/runner/workspace/docs/X402_COMPATIBILITY.md).

---

## Quickstart & Local Setup

### Prerequisites
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

### 1. Configure Environment Variables
Copy `.env.example` to `.env` and verify the values:

```bash
cp .env.example .env
```

Key variables:
- `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/x402_guardian`)
- `SUPABASE_JWT_SECRET`: Secret key for JWT verification (minimum 16 characters)
- `SIMULATION_MODE`: `true` (enforces simulation mode throughout engine execution)
- `ALLOWED_ORIGINS`: Comma-separated allowed origins (e.g. `http://localhost:3000`)

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Run Database Migrations & Seed
```bash
# Run schema migrations and Row-Level Security policies
pnpm db:migrate

# Seed trusted merchants, verified catalog products, and multi-option payment methods
pnpm db:seed
```

### 4. Run Test Suite
Runs the 97 automated tests against the real PostgreSQL database:
```bash
pnpm test
```

### 5. Typecheck & Build
```bash
pnpm typecheck
pnpm build
```

### 6. Start Development Servers
In two separate terminals:
```bash
# Fastify API (http://localhost:4000)
pnpm dev:api

# Next.js Web UI (http://localhost:3000)
pnpm dev:web
```

---

## API Capabilities

| Route | Method | Auth Required | Description |
| :--- | :--- | :--- | :--- |
| `/live` | `GET` | No | Basic process liveness probe |
| `/ready` | `GET` | No | Dependency readiness check (verifies PostgreSQL connection) |
| `/api/v1/auth/me` | `GET` | Yes (Bearer) | Verified current user profile and session restoration |
| `/api/v1/auth/test-token` | `POST` | Dev/Test only | Generates signed test JWT (strictly disabled in production) |
| `/api/v1/catalog/products` | `GET` | No | Active products with authoritative prices and payment options |
| `/api/v1/catalog/search` | `GET` | No | Search products by keyword, category, and budget limit |
| `/api/v1/catalog/products/:id/payment-options` | `GET` | No | Payment options for a specific catalog product |
| `/api/v1/catalog/merchants` | `GET` | No | Verified trusted merchants and recipient addresses |
| `/api/v1/conversations` | `POST`, `GET` | Yes (Bearer) | Create and list owned purchasing chat sessions |
| `/api/v1/conversations/:id/messages` | `POST`, `GET` | Yes (Bearer) | Post and list messages within an owned conversation |
| `/api/v1/conversations/:id/assistant-reply` | `POST` | Yes (Bearer) | Generate AI purchasing assistant response with catalog recommendations |
| `/api/v1/purchases/intents` | `POST`, `GET` | Yes (Bearer) | Create draft intent (authoritative catalog pricing) & list owned intents |
| `/api/v1/purchases/intents/:id/option` | `PATCH` | Yes (Bearer) | Switch payment option, increment version, and supersede earlier approvals |
| `/api/v1/purchases/intents/:id/preview` | `GET` | Yes (Bearer) | Compact authoritative approval preview with execution state |
| `/api/v1/purchases/intents/:id/approve` | `POST` | Yes (Bearer) | Atomically create snapshot, queue payment execution, and trigger worker |
| `/api/v1/purchases/intents/:id/reject` | `POST` | Yes (Bearer) | Reject proposed purchase intent with explicit reason |
| `/api/v1/purchases/executions` | `GET` | Yes (Bearer) | List owned payment executions |
| `/api/v1/purchases/executions/:id` | `GET` | Yes (Bearer) | Get status and details of an owned execution |
| `/api/v1/purchases/executions/:id/process` | `POST` | Yes (Bearer) | Resume or trigger processing on an execution |
| `/api/v1/purchases/executions/:id/retry` | `POST` | Yes (Bearer) | Reconcile ambiguous outcome or retry failed resource delivery |
| `/api/v1/purchases/executions/:id/resource` | `GET` | Yes (Bearer) | Inspect unlocked paywalled demonstration resource |
| `/api/v1/admin/kill-switch` | `GET`, `POST` | Yes (Bearer) | Inspect or toggle global emergency kill switch |
| `/api/v1/guardian/policies` | `GET`, `PUT` | Yes (Bearer) | Inspect and configure user spending policy limits and restrictions |
| `/api/v1/guardian/budget` | `GET` | Yes (Bearer) | Inspect user spending budget, active reservations, and remaining allowance |
| `/api/v1/guardian/decisions` | `GET` | Yes (Bearer) | Query explainable Guardian evaluation audit logs and block reasons |
| `/api/v1/guardian/decisions/:id` | `GET` | Yes (Bearer) | Inspect detailed evaluation checks and snapshot diffs for a decision |
| `/api/v1/mock-merchant/resources/:id` | `GET` | No | Mock merchant endpoint (returns 402 or 200 with resource) |
| `/api/v1/history` | `GET` | Yes (Bearer) | Owned security audit events, intents, and simulation metadata |

---

## Security Invariants

1. **Untrusted AI Output**: Language model outputs and tool calls have zero spending authority.
2. **Authoritative Catalog Pricing**: Creation and switching of purchase intents ignores client-provided amounts and recipients, sourcing values exclusively from verified database records.
3. **Pessimistic & Optimistic Concurrency**: Approvals acquire transactional `FOR UPDATE` locks and verify `expectedVersion` to prevent race conditions and double spending.
4. **Pre-Signing Authorization Gate & Guardian Engine**: The engine never produces payment signatures without passing through Blue Team Guardian policy evaluation (exact amount, recipient, network, token, and budget validation).
5. **Atomic Spending Reservations**: Reservations are committed atomically using PostgreSQL row-level locks (`SELECT ... FOR UPDATE`), preventing concurrent overspending of daily budgets. Survives crashes via two-phase state transitions (`RESERVED` -> `COMMITTED` or `RELEASED`).
6. **Worker Lease Monotonic Fencing**: A strictly increasing `fencing_token` is recorded on executions and checked on settlement, preventing stale, resurrected, or split-brain workers from generating duplicate settlements.
7. **Independent Cryptographic Permit Enforcement**: The `ConstrainedSimulationSigner` independently validates an HMAC-SHA256 `ExecutionPermit` signed by the Guardian key before generating headers. Altered terms or missing permits are refused with `UNAUTHORIZED_PAYMENT_REQUEST`.
8. **Constrained Simulation Signer**: The signer only emits HMAC-SHA256 integrity tokens and throws `SIGNER_REFUSED_PRODUCTION` if target network is a mainnet chain.
9. **Pinned Protocol Combination**: Enforces x402 V2 (`x402Version: 2`), `exact` scheme, Base Sepolia (`eip155:84532`), and USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`).
10. **Simulation Invariant**: Every result card, modal inspector, and API response explicitly states: *"Simulation Mode: No real funds were transferred. No blockchain transaction occurred."*
11. **Crash & Ambiguity Reconciliation**: Dropped or lost merchant settlement responses transition to `RECONCILIATION_REQUIRED` and resolve idempotently against the persistent settlement ledger without duplicate payments.

---

## Documentation Index

- [Architecture Specification](file:///home/runner/workspace/docs/ARCHITECTURE.md)
- [Threat Model & Security Boundaries](file:///home/runner/workspace/docs/THREAT_MODEL.md)
- [Guardian Policy Specification](file:///home/runner/workspace/docs/GUARDIAN_POLICY.md)
- [Guardian Adversarial Test Matrix](file:///home/runner/workspace/docs/GUARDIAN_TEST_MATRIX.md)
- [x402 V2 Protocol Compatibility](file:///home/runner/workspace/docs/X402_COMPATIBILITY.md)
- [Phase 1 Acceptance Criteria & Evidence](file:///home/runner/workspace/docs/PHASE_1_ACCEPTANCE.md)
- [Phase 1 Completion Report](file:///home/runner/workspace/COMPLETION_REPORT.md)
- [Phase 2 Acceptance Criteria & Evidence](file:///home/runner/workspace/docs/PHASE_2_ACCEPTANCE.md)
- [Phase 2 Completion Report](file:///home/runner/workspace/docs/PHASE_2_COMPLETION_REPORT.md)
- [Phase 3 Acceptance Criteria & Evidence](file:///home/runner/workspace/docs/PHASE_3_ACCEPTANCE.md)
- [Phase 3 Completion Report](file:///home/runner/workspace/docs/PHASE_3_COMPLETION_REPORT.md)
- [Phase 4 Acceptance Criteria & Evidence](file:///home/runner/workspace/docs/PHASE_4_ACCEPTANCE.md)
- [Phase 4 Completion Report](file:///home/runner/workspace/docs/PHASE_4_COMPLETION_REPORT.md)
