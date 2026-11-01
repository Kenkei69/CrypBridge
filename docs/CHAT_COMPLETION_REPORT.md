# Guardian persistent chat and live Red/Blue attacks — completion report

## Result

Blue Team now uses a persistent purchasing conversation at `/blue-team/ai-agent`. User requests, assistant replies, inline purchase approvals, merchant HTTP 402 status, Guardian checks, alerts, blocked/approved decisions, mock settlement and resource delivery appear in the same transcript. The former detached Current Purchase form is no longer the chat interface.

Red Team has an independent live pending-request dashboard at `/red-team` and a scenario-specific builder at `/red-team/attack-builder?simulation=…`. It submits only permitted untrusted inputs to the existing shared simulation engine. Both workspaces read the same backend records.

## Validation

- **45 unit/integration tests passed**, including persisted chat, follow-up clarification, message idempotency, event replay, cancellation, all five attacks, ledger integrity, workspace permissions and constrained model interpretation.
- **24 browser tests passed** on the actual HTTPS Replit preview **with its explicit :5000 port**.
- **TypeScript checking and production build passed** through `npm run build`.
- **Fresh PostgreSQL migrations passed** in an isolated schema, including the new conversation/message/turn models.
- Desktop/tablet/mobile chat screenshots were inspected. Browser tests cover widths 1440, 768 and 390 for the new chat and retained tools down to 320.
- The unchanged 180-request API limit is enforced. Automated browser tests consult the real remaining/reset headers and wait rather than bypassing that limit.

Browser coverage includes:

1. A real chat request for a $1 research report and user approval on its inline card.
2. A real HTTP merchant request and open, pre-signing attack window.
3. A separate Red Team tab finding the authorized pending simulation and opening its builder.
4. Overpayment and wrong-recipient attacks reaching Guardian and updating Blue chat without a refresh.
5. Actual amount/recipient mismatches, blocked signing, unchanged mock balance, failed attacker objective and persistent messages after reload.
6. Legitimate approval, exactly one 1-USDC mock transfer, inline resource delivery and accurate balance deduction.
7. Conversational budget clarification, textual approval, cancellation and balance questions without external AI keys.
8. Prompt-injection isolation, repeated-payment protection and dangerous contract-signing rejection in the transcript.
9. Completed targets disappearing from the pending dashboard and rejecting late attacks.
10. Bottom-anchored composer, preservation of older-message scroll position, and preservation of the next draft while a real request is in flight.
11. Existing wallet/policy/assessment functionality, modal failures, origin failures and responsive legacy routes.

## Backend and persistence

Added `Conversation`, `ChatMessage` and `ChatTurn` models and a migration. Simulations can reference their conversation and idempotent request turn; messages can reference the purchase simulation and source event.

Messages are generated **server-side** from persisted engine events. Event insertion and its chat projection happen in the same database transaction as the corresponding simulation/ledger operation. Message deduplication keys are unique per conversation; replay does not append duplicate alerts/cards. Client message keys are unique per conversation and cannot be reused for different text. A retry returns the original persisted result instead of creating another purchase.

The chat stores these categories: USER_MESSAGE, AI_MESSAGE, PURCHASE_CARD, PAYMENT_STATUS, GUARDIAN_ANALYSIS, SECURITY_ALERT, TRANSACTION_BLOCKED, TRANSACTION_APPROVED, PURCHASE_COMPLETE and SYSTEM_ERROR.

Financial checks and immutable authorization records remain independent of conversation text. Merchant content never becomes a user chat command or model user-history instruction. Optional model interpretation cannot authorize a payment. User approval still passes through trusted intent, independent Guardian validation, bound mock signing and atomic ledger settlement.

Lifecycle names now distinguish user permission from signing permission:

`CREATED → AWAITING_APPROVAL → AUTHORIZED → ATTACK_WINDOW_OPEN → EVALUATING → APPROVED → MOCK_SETTLED → COMPLETED`

Branches include BLOCKED, CANCELLED and FAILED. Cancellation is allowed only before evaluation/signing; no mock funds are reserved at that stage, so cancellation deducts nothing and invents no refund. No merchant settlement can occur in an open attack window. Completed simulations reject **all** attack submissions, including late duplicate probes; duplicate testing is performed during the controlled open window using repeated merchant retries.

## Endpoint changes

Added:

- `GET /api/conversations`: owned conversation history.
- `POST /api/conversations`: start a new persisted conversation.
- `GET /api/conversations/:id`: ordered messages and their current purchase records.
- `POST /api/conversations/:id/messages`: `{text, clientKey}`; conversational interpretation and idempotent processing.
- `POST /api/conversations/:id/purchases/:simulationId/approve`: explicit user authorization.
- Corresponding `/cancel` and `/continue` actions.
- `POST /api/blue/simulations/:id/cancel`: guarded cancellation for API clients.

Modified:

- `/api/simulations` includes lightweight conversation revisions so live readers avoid redundant transcript fetches.
- `/api/red/simulations/:id/attacks` rejects completed/late targets and retains independent policy validation.
- Existing simulation confirmation, signing and settlement use the clarified lifecycle and project chat messages.
- Rate-limit responses are structured JSON errors without changing the limit.

All chat mutations require a Blue-scoped session. Purchase IDs must belong to the conversation and session user. Existing exact-origin/preview-port checks, session security, signing boundaries, policy validation, SSRF protections and ledger uniqueness remain in place.

## Interface changes

Blue chat has right-aligned user messages, assistant/Guardian identities, timestamps, inline purchase and security cards, collapsible factual details, a ledger-sourced balance, conversation history and an anchored composer. The transcript follows new messages only while the reader is near the tail and offers an explicit latest-message action otherwise. In-flight edits are preserved.

Red Team has a pending authorized-request table, target-specific builder, editable attack parameters, original/modified previews, working launch/reset controls and actual execution evidence. Delivery, Guardian response, signature production, settlement and attacker objective are displayed separately.

## Main files changed

- `server/chat/messages.ts`: transactional event-to-message projection and message deduplication.
- `server/chat/service.ts`: owned conversations, turns, supported dialogue/follow-ups, explicit actions and persisted errors.
- `server/chat/routes.ts`: chat REST contracts and workspace checks.
- `server/chat/dialogue.ts`: optional constrained model intent adapter.
- `server/simulation/engine.ts`, `routes.ts`: lifecycle, cancellation, chat event bridge and late-attack rejection.
- `server/index.ts`, `outbound.ts`: router integration, structured throttling errors and reused constrained HTTPS transport.
- `prisma/schema.prisma`, `prisma/migrations/20261031020000_chat/migration.sql`: persisted conversation relations and old-stage normalization.
- `src/pages/PurchasingAgent.tsx`, `chat.css`, `src/chat-model.ts`: the conversational Blue Team interface.
- `src/pages/RedDashboard.tsx`, `RedAttack.tsx`, `src/components/Simulation.tsx`: live targets, reset/preview controls and execution evidence.
- `src/main.tsx`, `simulation-model.ts`: routes, lightweight refreshes and lifecycle presentation.
- `tests/chat.test.ts`, `dialogue.test.ts`, updated simulation/browser tests: new backend and real two-tab coverage.
- README, environment example and architecture documentation.

## Mock mode and known limitations

- Merchant resources, signatures/proofs, balances, funding and transfers remain **mock** records. No real funds or private keys are accessed. No blockchain transaction hash is fabricated.
- The default assistant is deterministic and domain-specific; it is conversational for the supported catalog and follow-ups, not an unrestricted general-purpose LLM.
- An optional compatible HTTPS model intent adapter is implemented and its constraints are unit-tested. No external paid provider was live-validated because no endpoint/credentials were supplied. It only proposes catalog/budget hints; final authorization and critical payment explanations remain deterministic.
- Server errors and simulation failures are persisted. Transport failures that prevent reaching the server are honestly displayed as local connection issues; they cannot be committed remotely while disconnected.
- Demo mode remains a shared persisted operator with scoped workspace sessions, not a production multi-tenant identity platform.
- Existing pre-chat simulations retain their real audit history; no historical conversation is fabricated for them.
- Conversation histories currently load the complete selected transcript. Large-scale pagination, multi-user collaboration, live blockchain settlement and crash-recovery job queues remain outside this mock milestone.
- Organizer-specific external guard integration remains unvalidated without an authorized target contract and credentials. The existing versioned adapter framework and reports remain available.
