# GitHub Agent Instructions

## Scope

This folder contains repository automation: CI workflows, CODEOWNERS, Copilot bridge instructions, and prompt files.

## Workflows

- `workflows/build.yml` is the main PR/master pipeline. Keep its service commands aligned with `app/AGENTS.md`, `accounting/AGENTS.md`, and `notifications-ts/AGENTS.md`.
- `workflows/backup-test.yml` restores accounting, notifications, auth and social backups with the published `komunitin/komunitin-db` image. Social uses the `social` tag for PostGIS and pgvector. Keep it in sync with `shared/AGENTS.md`.
