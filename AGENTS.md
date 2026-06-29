# Komunitin Agent Instructions

## Product

Komunitin is an open-source system featuring a community currency wallet and a marketplace. It is designed for Local Exchange Trade Systems (LETS), Time Banks and local complementary currencies.

## Repository Map

| Path | Purpose |
| --- | --- |
| `app/` | Vue 3 + Quasar PWA frontend served on port 2030. |
| `accounting/` | Node.js Express/Prisma/Stellar accounting service on port 2025. |
| `notifications-ts/` | Node.js Express/Prisma/BullMQ notifications service on port 2023. |
| `docs/` | GitBook product and technology documentation. |
| `shared/` | Shared utilities and docker images. |
| `.github/` | CI workflows |
| `social/` | Future marketplace and social features |
| `auth/` | Future authentication service |

An external dependency **IntegralCES** (Drupal, cloned separately on `../ices`) currently provides the social/auth API at port 2029.

## Shared Tooling

- All TypeScript/Node.js projects in this repo use `pnpm`.
- Service commands are scoped to each service directory; use the folder `AGENTS.md` for exact scripts.

## Docker Compose Orchestration

- Full local stack, including IntegralCES (may take a few minutes to build and start):

  ```bash
  cp .env.dev.template .env
  ./start.sh --up --ices --dev --demo
  ```

- `compose.yml` is the base stack: app, accounting, notifications-ts, IntegralCES, PostgreSQL databases, and Redis.
- `compose.dev.yml` adds hot-reload commands, debugger ports, local utility services, and bind mounts for active development.
- `compose.public.yml` and `compose.proxy.yml` are for production.
- Service-local compose files `accounting/compose.yml`, `notifications-ts/compose.yml`, are dependency-only stacks for developing locally and testing the service in isolation. Develop this way when you don't need to test service interdependence.

Use v2 `docker compose` syntax.

Published local ports in the dev stack:

| Service | URL |
| --- | --- |
| App | `https://localhost:2030` |
| Accounting | `http://localhost:2025` |
| Notifications | `http://localhost:2023` |
| IntegralCES | `http://localhost:2029` |
| Credit Commons test node | `http://localhost:2024` |
| phpMyAdmin | `http://localhost:2026` |
| Redis Commander | `http://localhost:2027` |

Default demo credentials are password `komunitin`; common users include `noether@komunitin.org`, `euclides@komunitin.org`, and `riemann@komunitin.org`.

## CI and Deployment Shape

- `.github/workflows/build.yml` runs three parallel PR/master jobs: app Docker build plus lint/test, notifications typecheck/test plus Docker image, and accounting typecheck/reset-db/test plus Docker images.
- The same workflow deploys demo, staging, preview, and CES demo servers after successful builds. Host-specific configuration belongs in environment files and deployment secrets, not hardcoded into compose files.
- `.github/workflows/backup-test.yml` validates WAL-G restore behavior for the shared database image.

## Product Language

- For user-facing app text and translations, read the guidelines at `app/src/i18n/README.md` and also read the app flavors overrides (currently only at `app/src/i18n/flavors/ces/README.md`) before making text changes.
- For non-user-facing text, use the default terminology guidelines (no flavor) and keep existing API contracts unless specifically changing them.
  