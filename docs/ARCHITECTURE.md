# Architecture and security boundaries

## Shared simulation workflow

React team routes → Express session/role/origin guards → purchasing orchestrator → local HTTP merchant → independent guardian → isolated mock signer → merchant mock verifier/settlement → PostgreSQL ledger and resource delivery.

The purchasing workflow lives in `server/simulation/engine.ts` and `routes.ts`. Existing native assessment logic remains in `server/engine.ts` and `attacks.ts`; it has separate test policies and does not settle purchases.

States: `AWAITING_CONFIRMATION → MERCHANT_REQUESTING → ATTACK_WINDOW → EVALUATING → AUTHORIZED → COMPLETED`. Hard violations transition to `BLOCKED`; transport failures to `ERROR`. New attempts create new simulations linked by `retryOf`, preserving audit evidence. Confirmation is idempotent at the open window; continuation of a completed purchase returns the same result. Concurrent pending transitions are serialized and return a stage conflict if already in progress.

A crash while merchant requesting can be retried by confirming again. A crash during evaluation or authorization fails closed: there is no automatic recovery signer. The existing evidence remains readable and the user can start a new linked purchase. A merchant transaction that commits records the ledger transfer, proof consumption, delivery and terminal stage together.

## Trusted versus untrusted data

- Seeded merchants/resources determine actual catalog conditions.
- Deterministic parsing identifies one resource and an explicit sufficient budget. It cannot sign.
- The user confirms an exact proposed amount, recipient, asset, network, scheme and resource URL.
- `PurchaseAuthorization` is immutable through PostgreSQL UPDATE/DELETE triggers; proposal/identity/original merchant fields are protected separately.
- Only `Simulation.modified` and `SimulationAttack` store permitted attacker-controlled requirements, merchant content, repeat counts and contract test envelopes.
- Strict discriminated attack schemas reject added authorization, policy or signer fields.
- Blue authorization/policy/wallet mutations reject Red-scoped sessions. No signing or ledger-mutation route is exposed to Red Team.
- Merchant content is never parsed as a purchasing instruction. Prompt injection cannot create a new authorization, even if it is logged or displayed.

The guard validates V2 schema/options, exact integer amounts, recipient, network, token, resource, scheme, validity, wallet/policy permissions, balance, transaction/daily/session budgets, duplicate status and contract authority. Financial comparisons use BigInt or PostgreSQL Decimal(78,0); frontend rendering also formats base units exactly.

## Signer and ledger

The mock signer re-reads the current simulation, requires a current approving decision, matches the whole input fingerprint and policy version, and re-runs guard checks. It creates a random test proof; only its digest and authorization fields are stored. This proof is not a blockchain signature.

The merchant verifies the proof digest, complete signed parameters, trusted authorization, current policy version, expiration, current stage, and non-consumption. One transaction debits the buyer, credits the merchant, inserts a unique-per-simulation transfer, increments spending, consumes the proof and records delivery. A transaction advisory lock serializes this sandbox across Node processes; balance and positive-transfer constraints add defense in depth. Initial funds are explicitly recorded as mock faucet funding.

Contract support is deliberately constrained: ERC-20 approve calldata is decoded with viem; Permit/Permit2 test envelopes contain a normalized domain and authority message. The agent has no contract-signing capability, so these are rejected. This is not generic live calldata analysis or a production Permit2/EIP-712 verifier.

## Persistence and observability

Users, workspace sessions, merchants, resources, simulations, trusted authorizations, guard decisions, signing attempts, account balances, transfers, attacks and monotonically sequenced events are relational records. Events identify simulation, source, type, timestamp and relevant data. WebSockets carry only refresh notifications; clients reload persistent records. State survives navigation, reload and server restart. Refresh notifications are not a durable event queue.

## Routes

- Blue: `/blue-team`, `/blue-team/ai-agent`, `/blue-team/payment-monitor`, `/blue-team/security-policies`, `/blue-team/anti-drainer`, `/blue-team/security-logs`.
- Red: `/red-team`, `/red-team/attack-lab`, `/red-team/attack-builder`, `/red-team/guard-testing`, `/red-team/results`.
- Planned intelligence: `/platform/*`; retained assessment UI: `/legacy`.

API:

- `POST /api/session {workspace: blue|red}` creates a scoped demo/operator session after authentication/origin checks.
- `GET /api/simulations` includes owned simulation history, catalog, policy and simulated accounts.
- `GET /api/simulations/:id`, `/events`, `/export` retrieve persistent evidence.
- `POST /api/blue/purchases {prompt}` proposes a purchase or returns a clarification.
- `POST /api/blue/simulations/:id/confirm`, `/continue`, `/rerun` drive trusted state transitions.
- `POST /api/blue/guardian-policies` creates an audited policy version.
- `POST /api/red/simulations/:id/preview`, `/attacks` accept strict untrusted test payloads only.
- `GET /mock/merchant/:resourceId` returns actual HTTP 402 plus `PAYMENT-REQUIRED`; a valid test-only `PAYMENT-SIGNATURE` permits one mock settlement and delivery.

## Scope and limits

Demo mode is a shared single-operator sandbox with an initial simulated balance of 1,000 USDC and a conservative 100 USDC wallet-session spending policy. Team switching is permitted to that operator. This is not multi-user authentication, private tenant isolation, production wallet custody, an LLM service, on-chain settlement, or live incident/exchange integration. Purchasing and existing assessment policy engines are independent and labeled accordingly. Query responses currently bound simulation lists to 100 and legacy payments to 500; production-scale pagination and job queues remain future work.

## Conversational layer (supersedes earlier form workflow)

`server/chat/service.ts` coordinates owned conversations and idempotent message turns; `messages.ts` projects simulation events into stored message records; `routes.ts` enforces session/workspace access. The engine's `event()` writes the event and projects its chat messages inside the same transaction as the corresponding simulation/ledger operation. Unique `(conversationId,dedupKey)` and `(conversationId,clientKey)` constraints bind event replay and request retries to the existing transcript/turn.

Simulation trust fields and the signer/ledger checks remain independent of chat. The assistant can propose purchases, answer questions and dispatch explicit user-approved actions. External merchant content never enters the user-message command parser or optional model user-history input. A model hint cannot issue an approval. Conversation message data includes event, purchase, simulation, authorization and ledger references without exposing test proof tokens or private signing material.

Lifecycle: `CREATED → AWAITING_APPROVAL → AUTHORIZED → ATTACK_WINDOW_OPEN → EVALUATING → APPROVED → MOCK_SETTLED → COMPLETED`, with `BLOCKED`, `CANCELLED` and `FAILED` branches. `AUTHORIZED` means confirmed user intent; `APPROVED` means guard-approved mock signing. No settlement is allowed in an open attack window. Cancellation is accepted only before evaluation/signing; no funds have been reserved at that point, so no synthetic refunds are fabricated. Completed simulations reject all further attack submissions, including late duplicate probes.

WebSocket notifications prompt clients to load authoritative records. Lightweight conversation revision heads avoid unnecessary transcript reads and the chat never appends fictional frontend security decisions. The transcript uses persistent message IDs, sequence ordering and reader-position-aware scrolling. The HTTP rate limit remains unchanged; browser tests respect its published reset window.

Model interpretation is optional through a constrained HTTPS JSON adapter. Deterministic fallback covers the supported mock catalog and follow-ups. This is not an unrestricted agent wallet or a general-purpose LLM conversation service. Transport errors that prevent reaching the server are displayed honestly as local connection issues; server-generated errors and simulation failures are stored in the conversation. Existing pre-chat simulations remain in their original audit history rather than acquiring invented historical chat messages.
