# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview
CES2 is the next-generation platform for the Community Exchange System (CES), 
built by the Community Exchange Network (CEN). It is a Vue.js/Quasar/TypeScript 
frontend (this repo) paired with IntegralCES (Drupal 7) as the social API backend 
and a TypeScript accounting service.

Two build flavors exist:
- `ces` — Community Exchange System branding, Matomo analytics, no GTM
- `komunitin` — Komunitin branding, GTM analytics, no Matomo



## Key commands
- `cd app && npm install` — install dependencies
- `npm run dev` — start dev server
- `npm run build` — production build (uses flavor env)
- `npm test` — run tests

## Architecture
- `app/src/boot/` — Quasar boot files (matomo, gtm, auth, i18n, etc.)
- `app/src/utils/config.ts` — runtime/build-time config helper
- `app/public/config.template.js` — Docker runtime env injection
- `app/.env.flavor.ces` — CES flavor feature flags
- `notifications-ts/` — email/push notification service
- `accounting/` — Stellar-based accounting service

## CES philosophy (important for terminology)
This system *records* social activity — it does not transfer money.
- Use "trade" not "transaction"
- Use "community standing" not "balance"  
- Credits flow *inverse* to service flow

## Production
- URL: https://app.ces.community
- Server: Hostinger VPS, openSUSE, Docker/Traefik
- Deploy: GitHub Actions at community-exchange-network/ces2-deployment
- Never edit compose.yml on server — all config in .env only

## Overview

Komunitin is a monorepo containing a community currency wallet and marketplace. It has three main services:

- **`app/`** — Vue 3 PWA frontend (Quasar framework, TypeScript)
- **`accounting/`** — Accounting backend (Express, Prisma/PostgreSQL, Stellar blockchain)
- **`notifications-ts/`** — Notifications backend (Express, Prisma/PostgreSQL, Redis/BullMQ)

The system also depends on **IntegralCES** (a legacy Drupal backend for social APIs), cloned separately as a peer directory.

## Development Setup

### Full stack with Docker
```bash
cp .env.dev.template .env
./start.sh --up --ices --dev --demo
# Then access: https://localhost:2030 (user: noether@komunitin.org / komunitin)
```

Subsequent starts (without reinstalling):
```bash
docker compose -f compose.yml -f compose.dev.yml up -d
```

### App standalone (mocked APIs)
```bash
cd app
cp .env.test .env
pnpm install
pnpm dev       # https://localhost:2030 — requires mkcert for local certs
```

### Accounting service standalone
```bash
cd accounting
cp .env.test .env
docker compose up -d   # starts local DB and Stellar
pnpm dev               # http://localhost:2025
```

### Notifications service standalone
```bash
cd notifications-ts
pnpm dev
```

## Common Commands

All services use `pnpm`. Run these from within each service directory.

### App (`app/`)
| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Production PWA build |
| `pnpm test` | Run all tests (vitest) |
| `pnpm lint` | ESLint (0 warnings allowed) |
| `pnpm lint-fix` | Auto-fix lint issues |
| `pnpm testAll` | TypeScript check + tests + lint |

### Accounting (`accounting/`)
| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with auto-reload |
| `pnpm build` | Production build |
| `pnpm test` | All tests (unit + ledger + server) |
| `pnpm test-unit` | Unit tests only |
| `pnpm test-ledger` | Stellar integration tests |
| `pnpm test-server` | Full server integration tests |
| `pnpm test-one <file>` | Run a single test file |
| `pnpm reset-db` | Reset database (dev only) |

### Notifications (`notifications-ts/`)
| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server with auto-reload |
| `pnpm build` | Production build |
| `pnpm test` | Run all tests |
| `pnpm test-one <file>` | Run a single test file |

## App Architecture (`app/src/`)

### Folder structure
- **`layouts/`** — Quasar layout components (contain `<q-layout>`)
- **`pages/`** — Route-level components; responsible for fetching data from APIs
- **`components/`** — Reusable components; receive data via props only
- **`store/`** — Vuex store with one module per API resource type
- **`boot/`** — Vue app initialization: `auth.ts`, `errors.ts`, `i18n.ts`, `mirage.ts`, etc.
- **`i18n/`** — Translation files per language; `flavors/` for per-flavor overrides
- **`server/`** — Mirage.js mock server for dev/testing (enabled via `MOCK_ENABLE=true`)
- **`features/`** — Self-contained feature modules (e.g., `topup/`)

### State management (Vuex)
All API resources follow the `Resources<T>` pattern defined in `store/resources.ts`. Each resource type (groups, members, accounts, transfers, etc.) has its own Vuex module registered in `store/index.ts`. Modules expose actions to load from the API and getters to retrieve cached values. Relationships between resources are bound automatically via JavaScript getters.

The store connects to three backends via environment variables:
- **Social API** (`SOCIAL_URL`) — groups, members, offers, needs, users
- **Accounting API** (`ACCOUNTING_URL`) — currencies, accounts, transfers, trustlines
- **Notifications API** (`NOTIFICATIONS_URL`) — notifications

### Error handling
Use `KError` with a `KErrorCode` from `src/KError.ts`. Throw it to propagate, or call the injected `$handleError` (from `boot/errors.ts`) to log and continue.

### Code conventions
- All components use `<script setup>` syntax
- Use `async/await`, not `.then()` chains
- Minimize custom CSS — prefer Quasar utility classes (`q-pa-md`, `row`, `col`, etc.)
- Custom app-wide styles go in `src/css/app.sass`; component-specific styles are scoped SCSS
- Color variables are defined in `src/css/quasar.variables.sass` (`$primary`, `$surface`, `$onsurface-m`, etc.)

### Testing
Tests use Vitest + jsdom. Test locations:
- Functional tests (full component environment): `test/vitest/__tests__/`
- Unit tests (isolated): `src/**/__tests__/` next to the file under test

Use `mountComponent` from `test/vitest/utils/` for functional tests. For unit tests on Vue components, use `@vue/test-utils` directly (faster, no full environment setup).

## Accounting Service Architecture (`accounting/src/`)

- **`model/`** — TypeScript types for all domain objects (Currency, Account, Transfer, etc.)
- **`ledger/`** — Stellar blockchain abstraction layer; private keys are never stored as properties, only passed as method arguments
- **`controller/`** — Business logic layer implementing interfaces defined in `controller/api.ts`; `CurrencyPublicService` and `BasePublicService` are the main interfaces
- **`server/`** — Express HTTP layer (routes, handlers, serialization, validation)
- **`creditcommons/`** — Credit Commons protocol integration (inter-currency payments)
- **`topup/`** — Fiat top-up integration (Mollie)
- **`migration/`** — IntegralCES migration utilities

The accounting service is multi-tenant: each currency has its own Stellar accounts (issuer, credit, admin, and optionally external issuer/trader for inter-community payments). PostgreSQL with Prisma ORM and Row Level Security for tenant isolation.

## Notifications Service Architecture (`notifications-ts/src/`)

Event-driven architecture:
1. External services POST events to `/events` → queued via **BullMQ** (Redis)
2. Worker routes events to handlers in `notifications/handlers/` by type
3. Handlers enrich events with API data → emit to `EventBus`
4. Channel listeners (`app`, `push`, `email`) process enriched events for delivery

Background synthetic notifications (digest emails for new posts/members, expiry reminders) run from `notifications/synthetic/` via cron + BullMQ.

Translations for email/notification content are in `src/i18n/[lang].json` and `src/i18n/flavors/`.

## Flavors (Customization)

Komunitin supports multiple "flavors" for white-labeling. Set `FLAVOR` (app) or `KOMUNITIN_FLAVOR` (root `.env`). Flavor overrides live in:
- `app/src/i18n/flavors/[flavor]/` — language string overrides
- `app/src/css/flavors/[flavor]/override.variables.sass` — Quasar variable overrides
- `app/assets/flavors/[flavor]/` — bundled assets
- `notifications-ts/src/i18n/flavors/[flavor]/` — email/notification string overrides

## Translations

When adding a new language, update: `app/src/i18n/index.ts`, `notifications-ts/src/utils/i18n.ts`, `app/src/i18n/README.md`, and `.github/CODEOWNERS`.
