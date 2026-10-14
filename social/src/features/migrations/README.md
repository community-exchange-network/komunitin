# Social community migration

Social imports one community from a [CSV ZIP bundle](../../../../shared/migration/FORMAT.md), coordinating Auth identities, Accounting accounts and transfer history, Social marketplace data, and images. It can create a community or fill missing records in an existing one. Plan downtime: imports are not atomic and partially imported data can be visible.

Use the app's superadmin **Migrations** page or the [administration CLI](../../../../shared/cli/README.md):

```sh
./shared/cli/komunitin admin migrate ./community.zip --email info@komunitin.org --password '<password>'
```

## Endpoints

All Social migration endpoints require an app-user bearer token with `superadmin`; service tokens are rejected.

| Endpoint | Purpose |
| --- | --- |
| `POST /migrations` | Upload a raw `application/zip` body, create an attempt and stream progress. |
| `GET /migrations` | List the latest 100 attempts as JSON. |
| `GET /migrations/:id` | Read status, community code, input summary and timestamps as JSON. |
| `GET /migrations/:id/events` | Replay saved progress, then stream until completion. Resume with `Last-Event-ID` or `?after=<event-id>`. |

Streams use server-sent events (SSE): `migration` identifies the attempt, `progress` carries logs, and `end` reports `completed` or `failed`. Responses include `X-Migration-Id` and `Location`. Authentication and upload errors use HTTP errors; validation or execution failures after streaming starts have HTTP 200 and a failed terminal event.

## Import flow

[service.ts](service.ts) runs these stages independently of the upload connection:

1. **Validate the bundle.** Check CSV structure, Social records and references, with limits of 20 MiB compressed, 100 MiB expanded CSV and 100,000 rows. Social prepares its import plan and keeps Accounting CSVs unchanged for Accounting to validate. Validation failures report file, row and error code.

2. **Import Auth identities.** Reuse known user UUIDs from Social and unambiguous Accounting ownership, then send normalized `users.csv` to Auth's `POST /migrations/users` using Social's service credentials. Auth resolves users by email and returns canonical UUIDs for both services. Existing identities are preserved. New identities are email verified and retain supported bcrypt or Drupal 7 password hashes; a blank hash requires a password reset. No migration emails are sent. See [identities.ts](identities.ts).

3. **Import Accounting.** Send `currency.csv`, `accounts.csv` and optional `transfers.csv`, plus resolved users and member ownership, to Accounting's `POST /migrations`. Accounting validates financial data, creates a new currency and its complete history, or checks supplied facts against existing records. Reference-only currency/account rows can reuse an earlier Accounting migration. Supplied balances must agree with transfer history. Optional Stellar secrets let Accounting reuse ledger accounts, store keys encrypted and reconcile ledger balances and limits. Social saves streamed Accounting progress, waits for completion, then resolves the currency/account links. See [accounting.ts](accounting.ts).

4. **Persist Social records.** Create missing user projections, community, administrators, members, memberships, categories, offers and wants, linked to Accounting. Direct inserts retain source timestamps and legacy statuses without normal lifecycle notifications. Unsupported email frequencies map to the nearest supported cadence. See [persistence.ts](persistence.ts).

5. **Copy images.** Download community, member and post images to the configured public upload storage using ordinary size and MIME restrictions. Download failures or invalid images produce warnings and omit that image; storage or database failures fail the attempt. Deterministic object keys reuse successful uploads on retry. Existing resources' images and later manual edits are preserved; migration-created resources can receive missing images on re-upload. See [images.ts](images.ts).

## Retries & persistence

Re-upload to retry after fixing a failure; there are no automatic retries or automatic resumption after restart. Every upload creates a new Social attempt. Earlier successful stages are not rolled back.

- **Record matching:** communities, members, categories and posts match by their community/code keys; users by normalized email; memberships by member and user. Supplied UUIDs must agree. Missing records and relationships are added while existing values are preserved. Conflicting UUIDs, ownership or relationships fail for manual resolution.
- **Accounting checkpoints:** Accounting persists its input, encrypted keys and execution state. The same input resumes unfinished work; an identical completed import is a no-op. Changing Accounting input while its migration is unfinished requires restoring the original input or manual resolution.
- **Connections:** disconnecting the browser or CLI does not stop Social; reconnect through the events endpoint. Losing the Social-to-Accounting stream fails the Social attempt while Accounting continues. Wait for Accounting to finish before re-uploading. That stream has no automatic reconnection or replay, so progress emitted while disconnected is lost.
- **Attempts and progress:** Social stores `Migration` status (`running`, `completed`, `failed`) and append-only `MigrationEvent` logs, including received Accounting progress. Creation and image events also track provenance for retries and are saved transactionally with their Social changes. Social does not store raw CSVs or credentials in these records. Temporary bundles are removed when execution finishes; a crash can leave `komunitin-migration-*` directories for cleanup.
- **Concurrency and interruption:** a PostgreSQL advisory lock permits one worker per community. After a crash, the next valid upload that acquires the lock marks previous running attempts for that community failed and starts again using existing records and checkpoints.
