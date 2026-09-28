# Shared Agent Instructions

## Scope

- `shared/docker` currently contains the shared PostgreSQL Docker image used by accounting, notifications and future social and auth services.
- `shared/cli` is the TypeScript administration CLI for Komunitin. It provides superadmin bootstrap, migration, and cross-service accounting commands, including the ICES bundle exporter. Keep shared environment, HTTP, OAuth, and error handling in `shared/cli/utils.ts` rather than duplicating it in commands.
- Run `pnpm typecheck` from `shared/cli` after CLI changes. Run `pnpm test` there after ICES exporter changes. Do not add tests for CLI scripts.
- This folder may be used in future for further cross-service utilities.
