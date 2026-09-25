# Social community migration

This executor imports a [CSV ZIP bundle](../../../../shared/migration/FORMAT.md) into Social and Auth **after Accounting has been migrated**. All import logic lives in the two services' `features/migrations` folders.

**WARNING**: This code has been created by AI and has NOT been thoroughly verified by human developers, as it is solely intended for one-shot migrations. Code here do not set design patterns for future developments.

## Run

Use the administration CLI:

```sh
./shared/cli/komunitin admin migrate ./community.zip --email info@komunitin.org --password '<password>'
```

Credentials default to `ADMIN_EMAIL` and `ADMIN_PASSWORD`; the bundle path can instead come from `MIGRATION_BUNDLE`. The wrapper reads the root `.env` and uses `KOMUNITIN_AUTH_URL` and `KOMUNITIN_SOCIAL_URL`. It mounts the invoking working directory read-only, so bundle paths must be inside that directory. For native Node execution:

The CLI prints the attempt UUID, progress and warnings, and exits unsuccessfully on a failed attempt or disconnected stream. Disconnecting the CLI does not stop an accepted migration. There are no automatic job retries. Correct any conflicts and re-upload the same or corrected bundle to resume through idempotent inserts.

## Social HTTP API

Every endpoint requires an app-user bearer token with `superadmin`. Service tokens and ordinary users are rejected before the upload is read.

| Endpoint | Behavior |
| --- | --- |
| `POST /migrations` | Raw `application/zip` request body. Creates an attempt and streams SSE progress. |
| `GET /migrations` | Most recent 100 attempts as JSON. |
| `GET /migrations/:id` | Attempt status, community code, input summary and timestamps as JSON. |
| `GET /migrations/:id/events` | Replays durable events, then streams until completion. Optional `Last-Event-ID` or `?after=<event-id>`. |

The upload limit is 20 MiB compressed; the static parser additionally limits expanded CSV to 100 MiB and 100,000 total rows. The bundle is saved with mode `0600` in a private temporary directory, parsed in a detached worker, and removed when the attempt finishes. A process crash can leave a temporary directory; it is never used for automatic resumption. Remove abandoned `komunitin-migration-*` directories during maintenance.

POST responds with `X-Migration-Id` and `Location`, and `text/event-stream`:

```text
event: migration
data: {"id":"<attempt-uuid>"}

id: 123
event: progress
data: {"id":123,"migrationId":"<attempt-uuid>","created":"...","level":"info","step":"members","message":"Members ready","data":{"total":50}}

event: end
data: {"id":"<attempt-uuid>","status":"completed"}
```

A streamed failure has `status: "failed"` in its terminal event; the initial HTTP status is already 200. Authentication and upload errors use normal HTTP errors. Invalid bundles also produce failed attempts with persistent validation codes and row locations. Credential values and raw CSV are never put into migration records or progress events.

## Persistence and retries

Each upload has a `Migration` row with `running`, `completed` or `failed` status and append-only `MigrationEvent` rows. A PostgreSQL session advisory lock allows one worker per community across service instances. Loss of the process releases that lock. The next valid upload marks any previous running attempt for that community failed and starts a new attempt. Old attempts without a resolved community code may remain `running` after a process crash; they have not imported domain data.

The stream polls persisted events and is independent of the worker. A disconnected observer neither cancels the worker nor owns its lock. A service shutdown does interrupt work; restart does not automatically resume it.

There is no transaction covering the entire migration. Individual inserts and their provenance events are transactional. Downtime is expected: partially imported data can be visible during a run.

- Match communities by code, members/categories/posts by community plus code, identities by normalized email, and member-user links by `(member, user)`.
- Preserve supplied UUIDs. For missing UUIDs, reuse the matching destination record or generate one. Auth establishes the canonical user UUID used in both services.
- Reject UUID collisions, conflicting identity mappings, account/currency references, post types or relationships. Report the offending resource for manual resolution. Existing scalar values, settings, statuses, deleted state, passwords and timestamps are preserved.
- Create missing relationships and records. Existing communities can receive missing records. Existing soft-deleted communities are rejected.
- Resolve existing currency and accounts by code, checking supplied accounting UUIDs. Active, disabled, suspended and deleted members require existing accounts even when all accounting data columns are blank. Draft and pending members have no account.
- Validate account owners against canonical user UUIDs. A single source owner and a single Accounting owner allow an unambiguous UUID inference; ambiguous missing UUIDs require fixing the bundle. Additional Accounting owners are preserved and reported. A supplied currency administrator must match Accounting.
- Supplied accounting settings, amounts and transfer history are ignored with a warning in this execution mode. The static bundle validation rules still apply. Balances/history are not compared or reset. Member/account status differences are reported and both existing Accounting and source Social states are preserved.
- New Social records retain source timestamps and legacy statuses, including published posts owned by inactive members and deleted members. Category descriptions go into `meta.description`; addresses use Social's address field names. Daily email frequencies become weekly; quarterly become monthly. Blank preferences use destination defaults.

## Auth identity import

Social sends a normalized `users.csv`, with resolved UUIDs where known, to `POST /migrations/users` as `text/csv`. Auth accepts only the `komunitin-social` client-credentials identity, using the existing service credential. Its response contains `{ users: [{ id, email, created }], warnings: [...] }`, never password hashes.

Auth validates the entire CSV before inserting. Conflicts encountered during inserts may leave earlier identities imported; retries reuse them. Existing identities retain all their fields. New identities copy bcrypt or native Drupal 7 `$S$` hashes unchanged and are **email verified**, as the migration policy. Auth upgrades Drupal hashes after successful password login.

For a new identity, a blank hash means no usable password and a password reset is required. Unknown status becomes `disabled`, with a warning. A missing creation timestamp uses the update timestamp or import time; a missing update timestamp uses the resolved creation timestamp. No verification or notification emails are sent by migration.

## Images

Images are copied to the configured upload bucket with deterministic keys derived from community, owning resource UUID and source URL. A HEAD request checks for an existing object before download/upload; an object left by an interrupted run is reused even if its `File` row was not yet written. File rows are reused by key within the community. Source order and repeated post URLs are retained.

Downloads have a 30-second timeout and use the ordinary upload size and MIME allowlist. Download, size and MIME failures omit the image and append a warning. Re-uploading retries those failures, even after a completed attempt. Destination storage or database failures fail the attempt. The uploader is the first linked member user, falling back to the first community administrator; group images use that administrator.

Existing resources' images are preserved. Images on migration-created resources can be completed on retry: provenance and the last imported image value are recorded atomically with the corresponding database mutations, so subsequent manual image edits (including removal) are preserved. Image completion does not change the owning resource's historical update timestamp.
