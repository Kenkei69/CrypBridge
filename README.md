# CrypBridge — x402 Guardian

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-black.svg)](https://fastify.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.10-336791.svg)](https://www.postgresql.org/)
[![Tests](https://img.shields.io/badge/Tests-48%20Passing-emerald.svg)](./apps/api/src/tests)

x402 Guardian protects AI-assisted purchases by checking proposed payments against trusted user authorization before signing or onchain settlement.

---

## Architecture Overview

x402 Guardian is architected as a modular monorepo:

- **`packages/shared`**: Shared contracts, domain types, Zod schemas, stable error codes, and x402 wire types.
- **`packages/database`**: Drizzle schema, SQL migrations, seed scripts, connection pool, and Row-Level Security (RLS) policies.
- **`apps/api`**: Fastify backend API with AI assistant service (`DeterministicDemoAdapter`), catalog search, payment option switching, optimistic concurrency locks, and simulation guards.
- **`apps/web`**: Next.js 14 & Tailwind CSS dashboard featuring conversational purchasing chat, inline product recommendations, compact authoritative approval cards, option switching, and state rehydration.

For complete architectural details, see [docs/ARCHITECTURE.md](file:///home/runner/workspace/docs/ARCHITECTURE.md) and [docs/THREAT_MODEL.md](file:///home/runner/workspace/docs/THREAT_MODEL.md).

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
- `SIMULATION_MODE`: `true` (enforces simulation mode in Phase 1 & Phase 2)
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
Runs the 48 automated tests against the real PostgreSQL database:
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
| `/api/v1/purchases/intents/:id/preview` | `GET` | Yes (Bearer) | Compact authoritative approval preview with expiration metadata |
| `/api/v1/purchases/intents/:id/approve` | `POST` | Yes (Bearer) | Authoritative human approval with `FOR UPDATE` lock and immutable snapshot |
| `/api/v1/purchases/intents/:id/reject` | `POST` | Yes (Bearer) | Reject proposed purchase intent with explicit reason |
| `/api/v1/history` | `GET` | Yes (Bearer) | Owned security audit events, intents, and simulation metadata |

---

## Security Invariants

1. **Untrusted AI Output**: Language model outputs and tool calls have zero spending authority.
2. **Authoritative Catalog Pricing**: Creation and switching of purchase intents ignores client-provided amounts and recipients, sourcing values exclusively from verified database records.
3. **Pessimistic & Optimistic Concurrency**: Approvals acquire transactional `FOR UPDATE` locks and verify `expectedVersion` to prevent race conditions and double spending.
4. **Tenant Isolation**: User identity is derived strictly from cryptographic JWT claims (`sub`), never from client-supplied request bodies.
5. **Append-Only Auditing**: Security-relevant events are persisted to the `audit_events` table; `UPDATE` and `DELETE` permissions are revoked.
6. **No Production Simulation**: Simulation signers and settlement adapters throw `SIMULATION_FORBIDDEN_IN_PROD` if initialized in a production environment.
7. **Phase 2 Boundary**: Purchase approval marks an intent as authorized but explicitly halts before signing or transaction settlement: *"Purchase approved — payment has not been executed."*

---

## Documentation Index

- [Architecture Specification](file:///home/runner/workspace/docs/ARCHITECTURE.md)
- [Threat Model & Security Boundaries](file:///home/runner/workspace/docs/THREAT_MODEL.md)
- [Phase 1 Acceptance Criteria & Evidence](file:///home/runner/workspace/docs/PHASE_1_ACCEPTANCE.md)
- [Phase 1 Completion Report](file:///home/runner/workspace/COMPLETION_REPORT.md)
- [Phase 2 Acceptance Criteria & Evidence](file:///home/runner/workspace/docs/PHASE_2_ACCEPTANCE.md)
- [Phase 2 Completion Report](file:///home/runner/workspace/docs/PHASE_2_COMPLETION_REPORT.md)
