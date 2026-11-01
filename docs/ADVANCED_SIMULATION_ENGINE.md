# CrypBridge advanced Red/Blue simulation engine

The active milestone is **financial simulation**, not a public Base Sepolia payment service. Engine `crypbridge-sim/3.1.0`, Guardian `guardian/3.1.0`. All money, transactions, blocks, confirmations and exchange responses in this mode are virtual and labeled accordingly. The existing React/Vite design and PostgreSQL/Prisma stack remain.

## Verified deliverables

- Blue Team searches persisted catalog records, selects a product and USDC, reviews one receipt, explicitly approves/rejects, and receives one backend-backed final receipt. Conversations and receipts survive browser reloads.
- Red Team has an attack library, scoped configurable builder, drafts/arming/cancellation, automatic injection, execution console, original/modified payloads, results, replay, evidence export and forensics.
- All ten required attacks execute against the actual simulator and Guardian. An ineffective prompt injection allows the legitimate purchase; selecting an attack does not force a blocked result.
- Normal approvals, independent signer validation, genuine test-only EIP-712 verification, virtual facilitation and settlement are stateful backend operations. Pending signatures reserve budget and cannot produce another signature.
- The virtual chain creates deterministic operation references, blocks, receipts, ERC-20 Transfer logs and confirmations. The indexer persists a cursor and fund-flow edges from those logs, including recovery and reorganization handling.
- A deliberately vulnerable baseline runs in a separate immutable BASELINE environment. It can settle an unauthorized transfer inside that environment, followed by controlled split/hop movements and a simulated custodial review. It cannot replace the normal Guardian workspace or use a real wallet.
- Snapshots preserve full simulator state; reset creates a new environment and retains previous evidence. Replay compares the semantic results of the recorded engine/rule version, seed, initial state and attack configuration.

## Verification results and artifacts

`npm test`: **66 tests passed** across the advanced simulator suite and retained offline testnet boundary/indexer suites. This includes 904 seeded property samples covering malformed JSON, uint256 amounts, addresses, authorization lifetimes, EIP-3009 nonces and concurrent requests. Property samples run inside test cases; they are not counted as additional test cases.

`npm run test:ui`: three Chromium scenarios cover the complete Red/Blue acceptance flow, mobile persistence/navigation, and private-file serving restrictions. The credential-serving test uses a harmless temporary canary, not a real key file.

`npm run build`: TypeScript and Vite production build pass. Actual browser previews were inspected, with the white/black/blue design retained.

`npm run sim:verify`: the running application's HTTP APIs completed the normal control and ten required attacks, the armed 100-USDC overpayment demonstration, a subsequent legitimate purchase, a reproducible replay, an isolated vulnerable baseline and a simulated exchange response. It writes fresh machine-readable evidence rather than printing synthetic outcomes.

`npm run sim:verify:restart`: a separate backend process completed a virtual purchase, stopped, restarted, and recovered the same purchase, signature, transaction reference, wallet balance, audit hash and indexer checkpoint. Reapproving after restart did not add another settlement.

Evidence:

- [Acceptance summary](../artifacts/simulation/acceptance-verification.json)
- [Blocked payment and full trace](../artifacts/simulation/blocked-payment-evidence.json)
- [Successful virtual payment](../artifacts/simulation/legitimate-payment-evidence.json)
- [Exported regression evidence](../artifacts/simulation/suite-overpayment-evidence.json)
- [Isolated vulnerable baseline and fund movements](../artifacts/simulation/baseline-evidence.json)
- [Actual backend-process restart proof](../artifacts/simulation/restart-verification.json)
- [Browser-exported test report](../artifacts/simulation/exported-attack-evidence.json)
- [Private-file and browser-trace access verification](../artifacts/simulation/file-boundary-verification.json)

The acceptance summary contains actual persisted simulation IDs and references. None is an on-chain transaction hash. In the recorded Blue Team sequence the virtual buyer goes from `50000000` to `49000000` atomic USDC only after the legitimate purchase. The 100-USDC attack leaves the original `1000000` atomic approval unchanged and creates no signature or settlement transaction. The vulnerable-baseline demonstration produces four actual virtual transfers: buyer → attacker, attacker → relay, attacker → custodian, relay → custodian.

Screenshots: [blocked Blue Team](../artifacts/simulation/blue-blocked.png), [successful Blue Team](../artifacts/simulation/blue-success.png), [isolated baseline](../artifacts/simulation/red-baseline.png), [fund tracing](../artifacts/simulation/fund-tracing.png), [mobile wallets](../artifacts/simulation/mobile-wallets.png).

## Architecture and service boundaries

| Required service | Implementation |
| --- | --- |
| AI purchase orchestrator | `server/lab/chat.ts`: deterministic catalog discovery, product/method selection, server-persisted conversation messages |
| Merchant catalog | `LabProduct` records; engine seeds three supported products in PostgreSQL |
| x402 merchant server | `quote()` and `/api/lab/merchant/:productId`: real HTTP 402, official V2 codecs/schema, signature processing and settlement-gated resource delivery |
| Payment intent service | `server/lab/engine.ts`: task, purchase and explicit immutable authorization records |
| Attack injection engine | `server/lab/scenarios.ts` plus atomic claims in `processPurchase()` |
| Guardian policy engine | `server/lab/guardian.ts`: independent deterministic checks with expected/evaluated values and evidence references |
| Signing authorization service | `server/lab/signer.ts`: independent revalidation, exact binding, unique authorization consumption and test-only ECDSA |
| Virtual wallet engine | `server/lab/core.ts`: canonical EVM addresses, journal-derived USDC/ETH balances and transactional projections |
| Facilitator simulator | Verification, pending/rejected/settled/reverted outcomes and reconciliation in `engine.ts`; HTTP adapters in `routes.ts` |
| Blockchain simulator | `server/lab/chain.ts`: operation construction, fee accounting, blocks, transaction references, receipts and ABI-encoded Transfer events |
| Transaction indexer | `index()` reads persisted canonical virtual logs, deduplicates graph edges and updates `LabCheckpoint` |
| Incident/evidence service | Persisted incidents, normalized fund-flow evidence, scoped exports and simulated exchange reviews |
| Audit event service | `emit()`: correlated ordered events with a virtual timestamp, previous hash and integrity digest |
| Red Team runner | `server/lab/runner.ts`: isolated fixtures, real concurrent requests, metrics, baseline, replay and exports |

The application uses in-process services with PostgreSQL transactions and advisory locks. It does not pretend they are independently deployed microservices. Settlement is atomic with its ledger, logs and execution records. An unexpected execution failure rolls back those records and records a FAILED attempt/attack trace in a fresh transaction when the database remains available. It never fabricates a successful result after a failure.

## Protocol fidelity and network identity

The supported model uses chain ID `84532`, network `eip155:84532`, Circle testnet USDC address `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals, x402 V2 `exact`, and EIP-3009. These identify the network/token being modeled, not a connection to public Base Sepolia.

Installed packages checked: `@x402/core` 2.29.0, `@x402/evm` 2.29.0 and viem 2.57.13. V2 schemas and PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE encoders/decoders come from the official SDK. The EIP-3009 payload follows the [official exact EVM specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md). Other transfer methods such as Permit2 are rejected rather than interpreted as EIP-3009.

The simulator uses the standard USDC `TransferWithAuthorization` EIP-712 structure, genuine test-only signatures and offline cryptographic verification. Test keys are derived from a **public deterministic seed** for reproducibility. They are not secure custody keys and must never be funded on any real chain. No private key bytes are stored in chat, database reports, frontend state or exports. Controlled forensic wallet movements use an explicitly labeled virtual signing receipt instead of pretending to have an ECDSA signature.

Transaction references begin `simtx:`; block references begin `simblock:`. They are deterministic simulation identifiers, not signed raw EVM transaction hashes. The merchant's logical resource URI uses `merchant.simulation.invalid`; the actual HTTP demonstration endpoint is the authenticated local API. Financial authorization uses exact integer strings/BigInt, never JavaScript floating-point arithmetic.

Each virtual transaction records its outer facilitator sender/nonce/contract target separately from token sender/recipient. The modeled facilitator pays a fixed 65,000 gas at 1 gwei. A reverted execution consumes virtual facilitator gas, creates a failed receipt, and produces no USDC transfer or merchant credit. Confirmations progress only when the backend produces canonical virtual blocks. Reorganizations compensate journal entries and recalculate canonical confirmation counts, instead of editing financial history or inventing transfers.

## Guardian, signer and database invariants

Each rule result has a rule ID/version, PASS/FAIL/NOT_APPLICABLE, evaluated and expected values, explanation and evidence reference. Hard authorization failures produce BLOCK. A facilitator timeout produces a persisted REVIEW decision for incomplete settlement evidence; it does not override prior hard checks or permit another signature.

Rules cover merchant, recipient, exact approved amount, token, network, scheme, resource, expiry, authorization single use, nonce replay, purchase idempotency, task/daily budgets, contract permission and final payload binding. Untrusted merchant prose grants no authority. TOCTOU checks re-evaluate the final payload inside the signer boundary.

| Invariant | Verified enforcement |
| --- | --- |
| No settlement without authority | Owned explicit approval, durable signing record, actual signature verification and execution authorization |
| No unauthorized signing | Guardian plus independent final signer evaluation; changed post-check input is denied |
| No unauthorized recipient in protected runs | Exact address comparison; checksum/case variants resolve to one canonical wallet |
| No cumulative overspending | Per-environment PostgreSQL advisory lock, exact cumulative accounting and pending reservations; concurrent distinct approvals tested |
| No duplicate settlement | Unique purchase client key, unique signing authorization, nonce consumption, unique signing/settlement/execution constraints and idempotent retry |
| No negative balance | Journal availability checks plus nonnegative projection constraint; projections verified against the journal |
| No successful transaction without execution evidence | Persisted signing or virtual-movement authorization, transaction, execution receipt and settlement records in one transaction |
| No false confirmations | Confirmation counts derive from canonical virtual height and stored inclusion block |
| No altered trusted approval | Database triggers protect approved fields and task/policy/isolation configuration |
| No edited financial/audit history | Append-only journal, signing, task and event triggers; reorganization uses compensation |
| No Red Team production credentials/submission | Simulation-only signer module, disabled real APIs/signing/worker, scoped sessions and private-file serving restrictions |

A failed attack retry cannot release a pending signature's reservation or re-enable its approval. A blocked payment has no signing, settlement transaction or token debit. A duplicate attack after a legitimate settlement is recorded as a rejected additional attempt, while retaining the legitimate original purchase.

The deliberately vulnerable baseline is the explicit negative control: application/signer binding checks are bypassed only inside a newly created BASELINE environment. Its failed Guardian rules and bypass event remain visible. Protocol signature, supported asset/network, nonce and available-balance checks still apply. Guardian performance metrics exclude those deliberately vulnerable targets; baseline outcomes remain separately labeled.

## Scenarios and test controls

Required scenarios: overpayment, wrong recipient, prompt injection, duplicate payment, micro-payment draining, wrong network, fake token, TOCTOU, malicious token approval, concurrent race.

Separate optional fixtures: expired authorization, invalid signature, insufficient USDC, insufficient facilitator gas, facilitator rejection, settlement revert, facilitator timeout, unsupported scheme, resource substitution, virtual indexer outage and virtual chain reorganization. Optional clock/genesis/infrastructure faults run in a fresh fixture; they cannot rewrite another user's approval or the normal workspace's initial balances.

Micro-drain regression uses individually approved 0.1-USDC fixture installments sharing a 1-USDC task budget. Ten settle and later requests fail cumulative checks. A separate concurrent test uses distinct approved purchases sharing a 0.3-USDC budget; only three 0.1-USDC settlements succeed. The race fixture also sends concurrent requests against one single-use purchase.

Attack scope can target the next eligible payment, purchase, merchant, resource or supported signing operation. A server-side atomic claim consumes the attack once. Draft, armed, triggered, evaluating, completed, failed, expired and canceled states are retained through records/events. The builder exposes only whitelisted scenario fields; attempts to add approval, policy, user or credential fields fail validation.

Replay records engine/rule version, seed, genesis balances, catalog/merchant snapshot, approved state, scenario configuration and execution sequence. Random database IDs may differ; the semantic digest compares meaningful input/rule outcomes, balances, transactions and metrics. Full exports retain both executions' individual integrity chains. A summary integrity hash is an evaluation checkpoint; the complete export contains the final audit-chain head. Historical unsupported engine versions remain inspectable but are not silently executed by a different evaluator.

## Forensics, notifications and exchange simulation

The graph is built from canonical `LabLog` Transfer events through `LabFlowEdge`. It supports actual virtual hops, splits and a modeled custodial destination. Addresses are interactive filters. Every edge references its execution/log/block evidence. Confirmation of a transfer relationship is explicitly distinguished from attribution of mixed funds.

Exchange requests contain the incident, destination, transaction evidence, flow history, risk indicators and documentation. Deterministic transitions include RECEIVED, UNDER_REVIEW, ADDITIONAL_EVIDENCE_REQUIRED, HOLD_APPROVED and HOLD_DECLINED. An approved hold applies only to modeled custodial movements in that simulation. No real exchange is contacted and no real funds are frozen.

SSE replays persisted event sequences with an environment-aware Last-Event-ID. The client deduplicates notifications and coalesces event-triggered reads. No frontend timer creates a security outcome, decrements a wallet or invents confirmations. API rate limits remain enabled; the browser assessment respects their reset window.

External guard comparisons require a registered guard, an operator-configured exact HTTPS origin in `GUARD_ALLOWED_ORIGINS`, a Red Team session, same-sandbox evidence and explicit organizer authorization. The existing outbound adapter pins public DNS, rejects private destinations/redirects, limits response size and times out. Responses are stored as comparisons and cannot override local signing checks. **No organizer-approved external service was provided, so no external adversarial request was executed or claimed successful.**

## Persistence, migrations and changed files

Added 31 `Lab*` models without replacing existing production/testnet or historical simulation tables. They cover workspace/environment, wallets/balances/journal/allowances, products/tasks/purchases, trusted approvals, attacks/attempts, decisions/rules/signatures/nonces, settlements/executions, blocks/transactions/logs/checkpoints, incidents/flows/exchange cases, events, runs, snapshots and conversations/messages.

Migration: `prisma/migrations/20261031050000_advanced_simulator/migration.sql`. Additional idempotent checks/triggers: `prisma/lab-invariants.sql`. The new SQL was applied to this workspace's existing PostgreSQL database and tested in disposable schemas. Existing migration history was not fabricated or marked resolved. Development `db:setup` installs invariant SQL after `db push`; new deployments should apply committed migrations.

Main changed/new paths:

- `server/runtime.ts`, `server/lab/{core,scenarios,guardian,signer,chain,engine,runner,snapshots,chat,routes}.ts`.
- `server/index.ts`, `server/config.ts`, `server/security.ts`, `server/testnet/signer.ts` for mode and credential/submission boundaries.
- `src/simulation/{SimulationChat,SimulationPages,Inspector}.tsx`, `shared.ts`, `lab.css`; `src/redesign/{App,Chat,Pages,api}` and `src/main.tsx` for integration while retaining the design.
- `prisma/schema.prisma`, the migration and invariant SQL above.
- `tests/lab.test.ts`, `tests/e2e/lab.spec.ts`, `tests/global-setup.ts`, `tests/testnet.test.ts`, `vitest.config.ts`.
- `scripts/verify-simulation.ts`, `scripts/verify-simulation-restart.ts`, `package.json`, `package-lock.json`, `.env.example`.
- `dev-file-policy.ts`, `vite.config.ts` and Vitest configuration for explicit private-file deny rules.
- This report, README and `artifacts/simulation/*` for reproducible evidence.

## Running

```sh
# Default even if omitted; real signing and public RPC workers stay disabled.
CRYPBRIDGE_MODE=simulation
npm run db:setup
npm run dev
npm test
npm run test:ui
npm run sim:verify
npm run sim:verify:restart
npm run build
```

`DATABASE_URL` is required. Funding, faucets, live RPC credentials and production wallet keys are not required. Testnet code is retained behind explicit `CRYPBRIDGE_MODE=testnet`; changing runtime mode requires restarting the backend and reloading the frontend. There is no browser control that enables real submission.

## Approximations and remaining security work

- This is an in-process virtual EVM-operation model, not Anvil or public Base Sepolia. Gas, fees, blocks and transaction references are modeled. General bytecode execution, real consensus, swaps, bridges, arbitrary contracts and cross-chain tracing are not implemented.
- Catalog orchestration is deterministic over stored records, not live Internet product discovery or an LLM authority service. The catalog currently contains a report, handbook and brief.
- Test-only ECDSA verifies actual typed-data signatures, but public seed-derived keys provide no real custody security. Controlled forensic movements use labeled virtual receipts. Allowance state and malicious approval checks exist; authorized Permit/Permit2 execution is not implemented.
- This is an authenticated-operator/test-session environment, not a production multi-tenant IAM system. Hash-chained audits are not externally anchored or WORM storage; the database administrator remains trusted. Long-running assessment queues, distributed failover and arbitrary host/DB outage replay need further production infrastructure.
- **Concrete credential issue fixed:** Vite had served the local dedicated test-wallet credential file, despite filesystem permissions and git exclusion. Explicit Vite/Vitest deny rules now block private environment files and both ordinary/raw-import/`/@fs` access, plus browser test reports, traces and cache directories. The recorded six-path verification returned HTTP 403 throughout. No key values were printed in the check. Treat those historical test-wallet credentials as exposed and rotate them before future funding or testnet use. Simulation mode does not load or use them.
- Dependency audit still reports the existing Prisma 6 toolchain's `deepmerge-ts <8` recursion advisory. The [upstream advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) concerns recursive JavaScript object graphs, not plain JSON alone. A compatible Prisma/tooling update needs separate migration testing; no force-major upgrade was applied to this existing project.
