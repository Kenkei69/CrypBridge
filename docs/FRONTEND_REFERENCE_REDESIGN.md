# CrypBridge reference-based frontend redesign

## Reference and implementation

Inspected `frontend/CrypBridge AI Crypto Assistant Dashboard.png` before editing code. The implemented desktop layout follows its approximately 23% sidebar, blue outlined shield wordmark, restrained network/Guardian header, centered welcome heading, three action cards and bottom composer. Colors are white, black, #0866FF and neutral grays. Inter is retained. No generated image, gradient, fake balance or fabricated payment result was introduced.

The running application was opened in Chromium and its rendered desktop, tablet and mobile screenshots were visually inspected against the reference. Final screenshots:

- [Desktop, 1536 × 1024](../artifacts/redesign/desktop.png)
- [Tablet, 768 × 1024](../artifacts/redesign/tablet.png)
- [Mobile, 390 × 844 viewport](../artifacts/redesign/mobile.png)
- [Payments](../artifacts/redesign/payments.png) · [Red Team](../artifacts/redesign/red-team.png) · [Mobile drawer](../artifacts/redesign/mobile-drawer.png)

## Files changed

| File | Change |
| --- | --- |
| `src/main.tsx` | Mount the redesigned application and Inter weights without loading the old global design styles. |
| `src/ArchivedWorkspace.tsx` | Preserve the previous shell and its component connections, outside the active bundle. Existing legacy page modules remain untouched. |
| `src/redesign/App.tsx` | Responsive shell, seven navigation items, independent Red Team entry, wallet balances/copy, real Guardian status, notification inbox and SSE replay handling. |
| `src/redesign/Chat.tsx` | Reference welcome/actions, persistent conversations, natural-language request submission, compact live receipt, approve/cancel, audit feedback, report delivery and accessible composer. |
| `src/redesign/Pages.tsx` | Purchases, Payments/verification, Tracking, Reports, Account, Settings/Guardian policies and independent Red Team screens. |
| `src/redesign/api.ts` | Existing workspace/session API integration, shared live API client/types, exact BigInt formatting and route/status helpers. |
| `src/redesign/styles.css` | Scoped design system, responsive layouts, focus states, drawer, tables, loading skeletons, reduced-motion support and safe-area spacing. |
| `index.html`, `public/brand-shield.svg` | CrypBridge title, description, language, viewport/safe-area configuration and outlined shield favicon. |
| `server/testnet/routes.ts` | Small frontend integration additions: real Guardian self-check status, owned-intent cancellation, signing/submission audit, real transaction/address verification, indexed-transfer reads and persisted notifications. |
| `tests/e2e/testnet.spec.ts` | Three actual-app browser scenarios covering redesign and preserved functionality. |
| `tests/testnet.test.ts` | Cancellation ownership/state and no-signing/replay checks. |
| `artifacts/redesign/*.png`, this document | Visual verification artifacts and handoff. |

No database models, migrations, authentication rules, signer, settlement service, Guardian rules, attack generator or indexing worker were replaced or disabled.

## Functional behavior

- Existing Blue Team URLs and independent `/red-team` routes remain usable. Purchases, Account and Settings have dedicated presentation routes. Browser back/forward is preserved without adding a routing dependency.
- Wallet panel reads `/api/live/balance`; unavailable/disconnected states display no numeric fallback. Account explicitly describes the existing server signer rather than offering an unsupported browser-wallet connection.
- Guardian ON requires successful backend state from a deterministic normal/mutated authorization self-check and valid RPC status. Connection interruptions show Unavailable, never an unconditional healthy badge.
- Buy a Product focuses a real supported purchase request in the composer. Verify Payment opens real transaction/address verification. Trace Funds opens genuine indexed USDC transfers.
- Enter sends; Shift+Enter inserts a newline. Requests and receipt mutations disable controls while pending. Failed requests expose errors with a retry using the same client key.
- A single receipt updates through approval, processing and final state. Merchant details and payment fields come from the actual intent/requirements. Successful payment links use the recorded real hash; blocked signing/submission claims use the backend audit.
- Cancellation is a real server state transition. It acquires the same advisory lock as approval, so a cancellation cannot race a payment reservation. It does not bypass a security check or reset a consumed authorization.
- Chat text and thread selection persist in this browser; payment intents and decisions remain durable server records. Saved conversations can be reopened from Settings. The existing database Conversation/ChatMessage history has not been deleted or modified. This does not add cross-device synchronization of the new browser chat text.
- Notification inbox and refreshes use persisted server events; replayed notifications are deduplicated, history refreshes are coalesced, and relevant payment/watch events trigger real balance reads. No frontend timer invents a payment result or transaction.
- Red Team scenarios call the existing Guardian attack endpoint for overpayment, wrong recipient, prompt injection, duplicate payment and unsupported contract signing. No normal purchase UI contains attack controls.
- Reports use the existing protected investigation routes and expose their actual access restriction in shared demo mode.

## Verification

- `npm test`: **18 tests passed** (real PostgreSQL disposable-schema suite, Guardian/signer/indexer tests and cancellation regression).
- `npx playwright test tests/e2e/testnet.spec.ts`: **3 tests passed** against the running application.
- `npm run build`: TypeScript check and Vite production build passed.
- Actual browser coverage: seven sidebar destinations; three quick actions; live balances compared to the backend; actual clipboard copy; desktop collapse/expand; mobile drawer Escape/focus return; desktop/tablet/mobile overflow checks; Enter/Shift+Enter; saved-chat reload and reopening; real HTTP 402; cancellation; honest insufficient-USDC block and no-signing audit; all five Red Team scenarios; simulated frontend network disconnection correctly showing unavailable balances/Guardian.

The network-disconnection test aborts browser requests only to test error presentation. Backend security and blockchain test results are not fabricated.

## Remaining limitations

The configured buyer remains unfunded, so the real purchase correctly blocks for insufficient testnet USDC. No new successful on-chain purchase is claimed. Only the currently supported AI Security Research Report is purchasable; arbitrary product discovery was not added to the backend. Funded signing and sensitive investigations still require authenticated operator deployment rather than shared demo mode. Attachments are explicitly disabled and the microphone is omitted because the current backend does not support them. These existing capability/security restrictions were preserved.
