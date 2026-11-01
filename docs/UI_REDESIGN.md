# Frontend redesign

## Structure

- `src/main.tsx`: existing page-state navigation, API refresh/WebSocket integration, responsive shell, permission confirmations, registration and mock validation dialogs.
- `src/api.ts`: existing REST contracts with explicit HTTP, validation, and connection error messages. No credentials or origin checks are changed.
- `src/model.ts`: frontend record types, navigation groups, available attack descriptions, exact base-unit formatting, and scenario filtering.
- `src/components/`: reusable payment tables/mobile lists, accessible dialogs, decision pills, collapsible JSON, assessment activity, and report details.
- `src/pages/`: overview, Lab/simulator/guard workflow, policies, wallet controls, reports, integrations, settings, and explicit intelligence placeholders.
- `src/style.css`: light palette, locally served Inter, responsive navigation and lists, focus states, restrained motion, reduced-motion support.

## Preserved integrations

GET `/api/state`; POST `/api/wallets`, `/api/guards`, `/api/security/policies`, `/api/attacks/run-batch`, `/api/demo/:scenario`; PATCH `/api/wallets/:id`; `/ws` refresh notifications; JSON and PDF report exports. The custom payment form uses the already existing POST `/api/security/validate` with the unchanged mock envelope contract. No server, schema, authentication, or guard logic changes are required.

## Honest capability states

The app has a demo operator, not an authenticated user identity. Incident lifecycle tracking, contract allowance monitoring, specialized drainer detection, prompt injection, on-chain tracing, scam evidence storage/submission, and exchange responses have no backend. The interface labels these limits explicitly. Duplicate payment selects the existing replay category. Search only filters implemented scenarios; it is not AI chat.

The overview uses stored payment decisions (latest 500) and enabled wallet/policy state. Active incidents displays an unavailable state because there is no incident lifecycle model. Test activity distinguishes guard decisions from expected test outcomes.

## Verification

`npm run build` typechecks all included TypeScript then builds the production frontend. `npm test` covers existing API/engine tests plus frontend formatting/filtering. `npm run test:ui` covers real API-backed assessments and policy saves, custom mock validation, failure visibility, permission confirmations, navigation, responsive layouts at 1440/1024/768/390/320 pixels, and initial connection errors. Screenshots and failed-test traces are written to ignored `test-results/`.

## Current primary application

The subsequent functional simulation milestone moved this earlier combined interface to `/legacy`. The main application now uses independent `/blue-team/*` and `/red-team/*` routes with the shared backend state machine described in ARCHITECTURE.md and COMPLETION_REPORT.md. The earlier "no server changes" note applies only to that historical visual redesign, not to the current functional milestone.
