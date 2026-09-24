# Shared Agent Instructions

## Scope

- `shared/docker` currently contains the shared PostgreSQL Docker image used by accounting, notifications and future social and auth services.
- `shared/cli` is the dependency-free TypeScript administration CLI for Komunitin. It provides superadmin bootstrap and cross-service accounting commands. Keep shared environment, HTTP, OAuth, and error handling in `shared/cli/utils.ts` rather than duplicating it in commands.
- Run `pnpm typecheck` from `shared/cli` after CLI changes. Do not add tests for cli scipts.
- This folder may be used in future for further cross-service utilities.
