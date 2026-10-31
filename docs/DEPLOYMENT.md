# Hosted simulation deployment

This deployment demonstrates simulated payments only. No wallet, private key, real funds, or onchain settlement is supported. The assistant remains deterministic. Do not remove the Base Sepolia/USDC allowlists or simulated-payload checks.

## 1. Supabase

Create a project. Under Auth signing keys, use an asymmetric ES256 or RS256 key (legacy HS256 production sessions are deliberately rejected). Enable email authentication. Configure an SMTP provider suitable for your invited users. In the Magic Link email template include `{{ .Token }}` to deliver the OTP code. Create/invite test users in the dashboard; the app sends OTP with `create_user: false`, so it cannot register arbitrary visitors. Disable public signups for this private demo. Set your frontend URL as the site URL.

Obtain the project URL, public anon/publishable key, and PostgreSQL connection string. Never place a service-role key or database password in NEXT_PUBLIC variables.

## 2. API (Docker-capable Node host)

Use the root Dockerfile with the repository root as build context. Run one API instance initially. Use the API values in `.env.production.example`, replacing all placeholders. Set BOTH APP_ENV and NODE_ENV to production. Generate two independent secrets with `openssl rand -hex 32`. Only exact HTTPS frontend origins are accepted. Keep SIMULATION_MODE=true and ALLOW_HOSTED_SIMULATION=true.

Before starting a new release, run `node packages/database/dist/migrate.js` from the built image as a one-off release command, then on the first deployment run `node packages/database/dist/seed.js` to load demonstration merchants/products. Do not seed on every boot. Migrations are serialized and checksum tracked; take a backup before migrating an existing installation. Existing untracked migrations are replayed once, so stage and verify an upgrade against a copy of the database first.

Use the database owner only for migrations/seeding. A separate API runtime role needs table/sequence access to the application tables and BYPASSRLS because the API currently enforces ownership in its routes rather than setting a PostgreSQL identity per transaction. Do not expose that credential to the browser. Do not claim database RLS protects API-owner connections. Use a separate database/project for this demo and verify cross-user tests before release.

Route HTTPS to the API PORT. Configure `/ready` as the health check. Keep at least one instance active; executions are processed in-process with manual retry/reconciliation endpoints, not a managed queue. Database-backed kill-switch checks occur immediately before simulated signing and settlement; an operation already past a check can finish. The control fails closed if the database/control row is unavailable.

## 3. Vercel frontend

Import this repository and set Root Directory to `apps/web`. Enable including source files outside the root directory. Use Node 24. The checked-in `apps/web/vercel.json` installs/builds from the monorepo root and emits `.next`. Set all three NEXT_PUBLIC values from `.env.production.example` before building. Set the API ALLOWED_ORIGINS to the final frontend HTTPS URL. Preview URLs require their own explicit origins and environment settings. Redeploy after changing build-time public variables.

## 4. Release verification

Require the Verify deployment workflow to pass. It builds the API, typechecks, applies migrations twice, seeds an isolated PostgreSQL database, runs tests serially, and builds the frontend. Existing lint scripts are placeholders and are not treated as verification.

On the hosted environment verify: email OTP login, session refresh, catalog, conversation, approve/reject, completed simulation and history, two-user isolation, duplicate approval/retry, kill-switch activation followed by API restart, readiness failure, and recovery. Confirm `/api/v1/auth/test-token` cannot issue a token in production. Confirm setting SIMULATION_MODE=false or missing secrets prevents startup. There is no real-money release path.

Enable provider log retention, failure alerts and database backups. Avoid collecting real financial information. To roll back, redeploy the prior image/frontend; database changes require a separately reviewed restore or forward migration, not automatic down migrations.

## Remaining account setup

The repository does not create cloud accounts, purchase hosting, configure SMTP, or populate secrets. These must be done in provider dashboards before a live end-to-end release can be verified. A successful build alone does not certify a public launch.
