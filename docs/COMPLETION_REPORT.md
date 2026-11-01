# Red/Blue mock simulation milestone — completion report

Historical milestone report. The newer conversational interface, lifecycle names, completed-attack rejection rule, and current validation are documented in CHAT_COMPLETION_REPORT.md.

## Verified outcome

The core purchasing and adversarial workflow works end to end against the running Express/PostgreSQL backend. The final browser suite passed on the actual Replit HTTPS preview **including its explicit :5000 port**, not only localhost.

- Production build and TypeScript check: passed.
- Unit/integration suite: **30 passed**, using automatically isolated PostgreSQL schemas.
- Browser suite: **22 passed** on the exact preview origin ending in `:5000`.
- Earlier browser validation on the canonical HTTPS preview origin: 22 passed.
- Fresh migration deployment and seeding: passed in an independent empty schema; four resources, three mock accounts, and a guardian policy were created.

## Origin incident and preview fixes

Two separate origin mismatches were diagnosed with browser requests and backend logs:

1. The API originally admitted localhost:5173, but the frontend ran on port 5000 and an HTTPS Replit domain.
2. The user's preview also used the exact HTTPS hostname with **:5000**, which is a different browser origin from the hostname without a port.

The API now admits the configured exact application origins, explicit local development origins, and deployment-provided Replit preview origins with the known frontend port. No arbitrary Host, forwarded host, wildcard domain or arbitrary port is trusted. The exact rejected `https://…replit.dev:5000` origin now creates a session with HTTP 200. The same hostname on :5002 and unrelated hosts still receive HTTP 403. Chromium loaded both canonical and :5000 preview workspaces without an origin error.

A separate UI failure came from Vite watching `.local/state/workflow-logs` and forcing page reloads on logging activity. Runtime logs/caches/test artifacts/backend files are excluded from frontend watching. The preview uses a strict frontend port and exact allowed hosts. Reconnecting live notifications now reload persisted state.

## Working behavior

1. A deterministic purchasing agent matches supported requests to the PostgreSQL merchant catalog. Ambiguous requests or insufficient budgets produce clarification rather than invented merchant data.
2. The user confirms an exact resource, price and recipient. A separate immutable authorization record is inserted; database triggers prohibit subsequent edits/deletes and protect proposal/original requirement fields.
3. The orchestrator makes an actual local HTTP merchant request. The merchant returns HTTP 402 and an official-SDK-encoded V2 PAYMENT-REQUIRED header.
4. The simulation pauses before validation/signing. Red Team submits only strict, permitted untrusted input fields.
5. Blue Team independently checks the actual V2 requirements against confirmed authorization, policy, wallet status, token/network/resource, validity, balance, budgets, duplicates and contract authority.
6. Blocked requests create no signing proof and no transfer. Approved requests receive a bound test-only mock signing proof and retry the merchant over HTTP.
7. The merchant mock verifier checks exact proof parameters/current policy and consumes the proof in the same transaction as buyer debit, merchant credit, unique ledger transfer, spending update and resource delivery.
8. Both teams read the same persistent simulation, decisions and sequenced events. WebSocket refresh notifications update another open workspace without a page reload.
9. Attacker objectives are calculated from actual persisted transfer/signing evidence. They are distinct from attack delivery and guard decisions. Engine errors are not reported as successful defenses.
10. A rerun creates a new linked purchase and retains previous evidence. Expired injection windows are rejected and are not shown as available in the UI.

## Required cases

| Case | Verified result |
|---|---|
| A — Legitimate research report | Exactly 1 USDC mock-settled; report delivered; no blockchain hash claimed |
| B — $1 to $100 overpayment | AMOUNT_EXCEEDS_AUTHORIZATION; no signing or deduction |
| C — Wrong recipient | RECIPIENT_MISMATCH; confirmed authorization unchanged |
| D — Prompt injection asking for $20 extra | Untrusted content isolated; only the original $1 purchase authorized/settled |
| E — Duplicate payment | Repeated HTTP retries and concurrent completed-purchase probes create one charge |
| F — Unlimited contract approval | ERC-20 calldata decoded; unknown spender/unlimited allowance rejected before signing; supported Permit/Permit2 test envelopes rejected |
| G — Valid purchase after blocked attack | New legitimate purchase succeeds |
| H — Persistence | Both team routes retain the same decisions, ledger evidence and timeline after reload |
| I — Origin regression | Actual canonical and explicit-port preview origins work; unauthorized hosts/ports remain rejected |
| J — Workspace integrity | Red-scoped sessions cannot edit Blue policy/wallet/authorization; attacker schema rejects trusted-field injection |

Additional checks cover expired windows, database immutability, mock signer approval refusal, ambiguous purchase parsing, fresh migrations, retained legacy controls, visible API failures, and responsive layouts down to 320 pixels.

## What is intentionally simulated

- Merchant catalog resources, including the report/article/weather/image content.
- Buyer funding, balances, transfers, and settlement in a PostgreSQL mock ledger.
- Signing via an opaque registered test proof with EIP-3009-shaped fields. This is not an EIP-712 signature, a production Permit2 verifier, or on-chain proof.
- Demo identity is one shared persisted operator with scoped, opaque, expiring HttpOnly workspace-session cookies. Demo team switching is intentional; this is not a production multi-user identity deployment.

No real cryptocurrency, private keys, blockchain RPCs, paid AI services, exchange holds, or fabricated blockchain transaction hashes are involved.

## External integration and remaining limits

The versioned x402-guard/1 framework supports configured HTTPS targets, strict schemas, operator allowlists, public-IP DNS pinning, server-only secret references, bounded response sizes and timeouts. Stored reports contain actual submitted test envelopes, responses/errors, timing and scored results. Native and deliberately vulnerable fixtures are explicitly labeled.

**Organizer-specific external guard testing is not validated:** no organizer endpoint, request/response contract, or credentials were supplied. A different interface requires its own adapter implementation and authorized end-to-end verification. The UI makes this limitation explicit.

Production wallet custody/signing, live settlement, multi-tenant identity, generic calldata analysis, production Permit/Permit2 verification, blockchain tracing, scam evidence submission, and exchange coordination remain outside this mock milestone. The intelligence pages remain clearly labeled planned capabilities.

The sandbox serializes financial work with PostgreSQL advisory locks. It does not include a distributed job recovery queue: interrupted evaluation/authorization remains fail-closed with persisted evidence and a new-purchase rerun path. List responses are currently bounded rather than implementing production-scale pagination.

## Main changed areas

- `server/security.ts`, `errors.ts`, `index.ts`: exact-origin handling, sessions/roles, structured failures, observable refreshes.
- `server/simulation/engine.ts`, `routes.ts`, `simulation-seed.ts`: catalog agent, real HTTP mock merchant, shared state machine, guard, signer, ledger and evidence.
- `prisma/schema.prisma`, new simulation migration, `db-invariants.sql`: relational records and immutable trust boundaries.
- `src/main.tsx`, `simulation-model.ts`, `workspace-api.ts`, new simulation pages/components/CSS: independent routed workspaces, purchase confirmation, attack builder, evidence and live state.
- `src/LegacyApp.tsx`: preserved earlier tools under `/legacy`, loaded separately.
- `server/attacks.ts`, `outbound.ts`: explicit adapter version, environment credential references and request/response evidence.
- `vite.config.ts`: preview host/port and watcher repair.
- `tests/simulations.test.ts`, browser simulation tests and test setup: real workflow coverage with disposable backend test schemas.

Setup, environment variables and reproduction steps are in README.md. State transitions and API boundaries are in ARCHITECTURE.md.
