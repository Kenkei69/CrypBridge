> **Active milestone: advanced financial simulation.** See [implementation, acceptance evidence, invariants and limitations](docs/ADVANCED_SIMULATION_ENGINE.md). Default `CRYPBRIDGE_MODE=simulation` disables real signing/submission and the public-chain worker. Earlier real-testnet/UI reports below are historical and are retained for reference.

> Active MVP: real Base Sepolia USDC/x402 implementation. See [verified implementation, acceptance results and blockers](docs/REAL_TESTNET_IMPLEMENTATION.md). Earlier simulation descriptions below are historical. No successful CrypBridge on-chain purchase is claimed; the provisioned buyer is unfunded.

# x402 Red/Blue

A working, persistent x402 purchasing and attack simulation platform with a clearly labeled **Test Environment**. Blue Team owns user confirmation, payment policies, and the signing boundary. Red Team injects untrusted merchant inputs into the same simulation. All signing proofs, balances, transfers, and delivered resources are explicitly simulated; no real cryptocurrency, private keys, blockchain RPC, or paid AI service is used.

## Start

Node 20.19+ and PostgreSQL 16:

```sh
npm ci
cp .env.example .env
# Configure DATABASE_URL, then start PostgreSQL (or use an existing instance):
docker compose up -d
npm run db:setup
npm run dev
```

Frontend: http://localhost:5000 · API/mock merchant: http://localhost:3001

`db:setup` preserves existing records, seeds missing merchants/resources and the isolated buyer, and installs database immutability triggers. Fresh deployments can use `npx prisma migrate deploy && npx tsx server/seed.ts` instead. Databases previously initialized with `db push` need migration baselining before `migrate deploy`.

## Run the demonstration

1. Open `/red-team/attack-builder`, choose Overpayment, and click **Arm Attack**. The plan waits for the next matching authorized test payment.
2. Open `/blue-team/ai-agent` and ask **Buy me a research report about AI security.**
3. Select a catalog product, choose the supported USDC / Base Sepolia method, and review the compact payment request.
4. Click **Approve**. Payment processing, attack delivery, and Guardian evaluation run automatically.
5. Guardian blocks the altered amount before signing. The chat shows one blocked receipt with the exact rule and the actual authorized/attempted payment fields.
6. Use **Take Action** for evidence, local reporting, investigation storage, permission restriction, and address monitoring.
7. Repeat with no armed attack for a legitimate simulated settlement and resource delivery. Refresh to restore persisted conversations and receipts.

Full current workflow and verification commands: [automatic checkout](docs/AUTOMATIC_CHECKOUT.md). All funds and settlements remain simulated. Unsupported payment methods are unavailable.

## Implemented attacks

- **Overpayment:** altered V2 amount is checked against immutable user approval.
- **Wrong recipient:** altered payee is checked against the approved merchant.
- **Prompt injection:** content is recorded as untrusted data, never as authority. Only the original purchase can settle; no additional payment is created.
- **Duplicate payment:** repeated signed merchant HTTP retries or completed-purchase probes produce one ledger charge. Concurrent processing is serialized.
- **Malicious contract approval:** actual ERC-20 approve calldata is decoded; supported mock Permit/Permit2 envelopes are inspected. Unauthorized contract calls, unknown spenders and unlimited allowances are rejected before signing.

## Tests

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui:simulation
npm run test:ui
```

Unit/integration tests automatically create, seed, and drop a disposable PostgreSQL schema; the configured database user needs schema-create permissions. Browser tests use the running API and persist actual mock test records. They should run against a dedicated demo deployment when a pristine catalog or balance is required.

`UI_BASE_URL` selects an actual preview/deployment URL. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed Chromium binary. The default browser target is port 5000. Both new simulation and retained legacy browser tests are included.

## Origin and preview repair

The previous API allowed localhost:5173 while the running frontend used port 5000 and a Replit HTTPS hostname. Exact supported local origins and deployment-provided Replit domains (including the frontend’s explicit HTTPS :5000 preview origin) are now included, with optional exact `APP_ORIGIN` / comma-separated `APP_ORIGINS`. No wildcard origin or request-supplied Host/X-Forwarded-Host is trusted. Cross-site origins and suffix lookalikes remain rejected.

A second preview bug came from Vite reloading the page whenever `.local/state/workflow-logs` changed. Runtime logs, caches, backend files, and test artifacts are now excluded from frontend watching. Vite uses a strict port and exact preview hosts.

Requests distinguish `ORIGIN_REJECTED`, `AUTHENTICATION_REQUIRED`, `SESSION_REQUIRED`, `WORKSPACE_FORBIDDEN`, `VALIDATION_ERROR`, invalid simulation stages, merchant errors, and settlement failures.

## Authentication and environment

See [.env.example](.env.example). Demo mode uses a shared persisted demo operator with server-created, opaque, expiring, HttpOnly/SameSite workspace-session cookies. Switching teams is explicitly permitted to that demo operator; a Red-scoped session cannot call Blue mutation handlers. This is sandbox workspace separation, not a production multi-user identity system.

Outside demo mode, every API call requires `ADMIN_TOKEN`; mock routes additionally require `MOCK_SIMULATION_ENABLED=true`. The browser does not collect administrator tokens. Production operator access needs an authenticated proxy/client. Real wallet signing is not implemented or exposed.

## Retained features and external guards

The earlier wallet configuration, native guard assessment suite, policy lab, filters, JSON/PDF assessment reports and guided demos remain at `/legacy`. Their test policies are independent of the purchasing guardian policies.

`/red-team/guard-testing` supports the explicitly versioned `x402-guard/1` adapter. Target origins must be approved on the server; DNS is pinned to a checked public IPv4 address; redirects/private destinations are rejected; credentials are environment references; timeout, malformed response and transport failures fail tests. Reports include the actual test envelope, response, reason and timing.

**No organizer-specific external guard integration has been validated** because no organizer endpoint/contract/credentials were supplied. A different interface requires a separate versioned adapter implementation and validation. This is not presented as universal interoperability.

Local incident reporting, evidence storage, platform address watches, and the test response adapter are implemented. Real blockchain tracing and real exchange integrations are not configured.

## Protocol, deployment and architecture

Official SDK encoders/decoders and V2 schemas handle the x402 headers and messages. The mock signer issues an opaque test proof with EIP-3009-shaped fields; it is **not** an EIP-712 signature or on-chain verification. The mock settlement response has an empty blockchain transaction field and an explicit ledger reference.

For deployment, serve `dist/` with SPA fallback for all team routes, proxy `/api`, `/mock`, and `/ws` to the Node service, provide PostgreSQL and the exact application origin, and use HTTPS. Do not expose anonymous demo mode with real credentials or production wallets. No testnet payments or real settlements are enabled.

Detailed design, API/state transitions, trust boundaries, and limitations: [architecture](docs/ARCHITECTURE.md), [adapter contract](docs/ADAPTER.md).

## Persistent Guardian chat

The current chat uses catalog discovery, explicit product selection, supported payment-method selection, trusted approval receipts, and automatically evaluated payments. Conversations and receipts are stored in PostgreSQL and synchronized with backend events. The active workflow replaces the earlier manual attack-window chat; legacy simulation endpoints are retained for existing assessment tooling.

See [the current implementation notes](docs/AUTOMATIC_CHECKOUT.md) for lifecycle, isolation, incident-response behavior, and limitations.
