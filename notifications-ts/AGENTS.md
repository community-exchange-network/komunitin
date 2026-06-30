# Notifications Agent Instructions

## Scope

`notifications-ts/` is the TypeScript notifications service: Node.js 24, Express, Prisma/PostgreSQL, Redis, BullMQ queues, in-app notifications, Web Push, email delivery, i18next, and newsletter generation.

## Commands

```bash
pnpm install
pnpm prisma generate
cp .env.test .env
docker compose up -d
pnpm typecheck
pnpm test
pnpm test-one <test-file-or-pattern>
pnpm update-snapshots
pnpm run build
pnpm run dev
```

- The local compose file starts PostgreSQL on host port 5433 and Redis on 6379.
- Tests run with Node's built-in test runner, `--experimental-test-module-mocks`, `.env.test`, and `tsx`.
- `pnpm update-snapshots` updates newsletter template snapshots only.

## Runtime Shape

- `src/index.ts` starts Redis, the notifications worker, the newsletter worker, and the Express server. Changes to startup or shutdown behavior must consider all four.
- `src/server.ts` wires Express middleware, routes, `/health`, and the shared error handler.
- `src/events/server/` accepts incoming events and queues them.
- `src/notifications/` enriches events and dispatches app, push, and email channels.
- `src/newsletter/` owns newsletter selection, account advice, and template generation.
- `src/templates/` contains Handlebars email templates; flavor overrides live under `src/templates/overrides/`.

## Data, Auth, and i18n

- Environment variables are validated in `src/config.ts` with Zod. Add new runtime configuration there and in `.env.test`/`.env.local` as needed.
- Prisma code uses `src/utils/prisma.ts`; generated migrations live in `prisma/`.
- Queue creation and Redis behavior are centralized in utility modules and heavily mocked in tests. Prefer existing test helpers under `src/notifications/test/utils.ts`.
- OAuth/JWKS auth lives in `src/server/auth.ts`; event ingestion uses the configured notifications events credentials.
- i18next loads `src/i18n/<lang>.json` and applies `src/i18n/flavors/<flavor>/<lang>.json` overrides. 
- Keep notification copy aligned with the app terminology guidance in `../app/src/i18n/README.md` and `../app/src/i18n/flavors/<flavor>/README.md`.

## Tests

- Notification tests live in `src/notifications/test/` and use MSW, mocked Redis, mocked Prisma, mocked queues, and supertest.
- Newsletter tests live in `src/newsletter/tests/`; read `src/newsletter/README.md` before changing ranking, alert, or account-section algorithms.
- Read `src/notifications/README.md` before changing event flow, digest behavior, synthetic events, or delivery channels.
