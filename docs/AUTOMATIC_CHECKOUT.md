# Guardian automatic checkout

The active application is a PostgreSQL-backed test environment. It does not sign real wallet transactions or settle on-chain.

## Blue Team

At `/blue-team/ai-agent`, ask for a research report. Select one of the three seeded catalog reports, select USDC on Base Sepolia, and review the trusted payment request. USDT on BNB Smart Chain and USDC on Ethereum are explicitly unavailable. Balances and settlement are simulated.

Approve queues one durable payment job. The server retrieves merchant requirements, applies an eligible armed attack at the untrusted input boundary, evaluates Guardian policies, and signs/settles only if permitted. Reject never queues a payment or consumes an attack.

One approval message changes its action buttons to Approved or Rejected. One payment message changes from processing into a successful, blocked, or failed receipt. Audit events remain persisted separately and technical details are expandable. Successful receipts expose the purchased catalog content and a simulation ledger reference, never a blockchain confirmation.

Conversations, selections, authorizations, receipts, attack outcomes, and incident actions are persisted. Desktop conversation history appears beside the chat; the history control is available on smaller displays. Refresh restores the active conversation and does not replay settlement.

## Red Team

At `/red-team/attack-builder`, select a scenario and target: next eligible payment, a specific eligible simulation, resource, or merchant. Save Draft or Arm Attack. Arming does not require a purchase to exist. Plans move through DRAFT, ARMED, TRIGGERED, EVALUATING, and COMPLETED, with CANCELED, EXPIRED, and FAILED paths. Rearm explicitly creates a new plan.

Matching is performed server-side in creation order with an ID tie breaker. A transaction-wide PostgreSQL advisory lock makes claiming the plan and delivering the payload atomic. Matching includes the owner, test sandbox, automatic-payment eligibility, target, and expiry. Original authorization remains immutable. Delivery, Guardian decision, signing/settlement, and attacker objective are separate results.

The legacy manual simulation APIs remain available for existing assessment tooling. The active shopping workflow has no Continue action.

## Incident response

Take Action on a blocked receipt opens evidence, local reporting, investigation storage, payment-permission restrictions, and address monitoring. Blocked payments explicitly say no funds were transferred. Reporting uses local persistence; it does not contact a partner. Monitoring records future platform payment requests involving the watched address; it is not a blockchain-wide monitoring service.

`/platform/scam-reports` is the investigation center. `/platform/exchange-response` offers an explicit simulated-loss drill using dedicated test accounts and a persisted transfer, leaving the purchasing wallet unchanged. Compliance escalation requires that transfer evidence. The local test response adapter returns TEST_ACKNOWLEDGED, with no external notification or freeze claim. No real exchange or chain tracing integration is configured.

## Validation

- `npm run build`: TypeScript and production bundle.
- `npm test`: backend, API, dialogue, engine, and frontend-model tests in disposable PostgreSQL schemas.
- `npx playwright test tests/e2e/automatic-checkout.spec.ts`: running-app browser coverage of purchases, automatic attacks, receipt persistence, incident saving, repeated approvals, rejection, and the response drill.

Older browser specifications describe the superseded manual checkout and are retained as historical tests; they have not been adapted to the new product/method-selection contract.

Verified in this workspace on 2026-10-31: production build passed; all 40 automated tests passed; all seven current Chromium scenarios passed. A separate 390px browser check verified catalog selection, payment-method selection, a 325px approval receipt, no horizontal page overflow, and a visible bottom composer. Browser execution used the installed Chromium with repaired local runtime library paths. No hosted deployment was performed.
