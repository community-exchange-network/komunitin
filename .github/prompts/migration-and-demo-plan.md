# Incremental CSV Migration and Demo Delivery Plan

## Delivery Rules

- Each numbered item is one independently reviewable PR with its own tests.
- Every PR leaves the repository deployable; execution remains behind `COMMUNITY_IMPORT_ENABLED=false` until the complete flow is ready.
- The migration API and UI are superadmin-only. This is an occasional operator tool, not a public upload service, so implementation should favor a small, clear workflow over infrastructure intended for untrusted high-volume ingestion.
- Production imports create new communities only. Existing community codes are rejected again immediately before execution.
- Imports must contain complete committed transfer history: declared balances must equal that history and all imported account balances must total zero.
- CSV passwords, overwrite/merge, partial histories, opening-balance adjustments, external transfers, notification history and cross-community accounting links remain out of scope.
- Images are referenced by HTTP(S) URLs and downloaded to S3 on a best-effort basis. There are no user-supplied file or image checksums.
- The importer targets only the current documented input bundle format. Preserve compatibility with older bundle shapes only when doing so remains simple.

## Platform Prerequisite

The new Auth and Social stack must work end to end before execution is enabled: the Social runtime is deployed, databases are migrated, service credentials work, and Auth issuer/audience/scope names are aligned across Social, Accounting and Notifications. General IntegralCES-to-Social frontend and deployment cutover work stays in the Social rewrite plan rather than being duplicated here.

## Milestone 1 — Format and Validation

### 1. Format and example bundle (DONE)

- Add the format documentation, empty templates and a tiny internally consistent example under `shared/migration/`.
- Keep community and resource data in the documented CSV files; do not add metadata that is not needed by the importer.
- Define exact files, headers, stable source keys, relationships, enum values, denormalized optional fields, integer/decimal amount rules, UTC timestamps, required files and optional files.
- Represent each image with an HTTP(S) source URL. Do not require checksums or licence metadata in the import format.
- State explicitly that the format accepts only complete, self-balancing histories and new destination community codes.
- No runtime or service changes.

Review focus: Is the smallest useful format sufficient for users, members, accounts, marketplace content, transfers, contacts, images and community/account settings?

### 2. Parser and semantic validator

- Parse a ZIP or fixture directory into typed normalized rows.
- Apply straightforward bundle limits and reject unsafe ZIP paths, but do not add malware scanning or a public-upload threat model.
- Resolve cross-file keys and validate uniqueness, administrators, statuses, relationships, account limits, post ownership, image keys and image URL syntax.
- Recompute every account balance from committed transfers, reject differences from declared balances and require the imported balances to total zero.
- Reject unsupported external transfers, partial histories and destination identifiers in source-key fields.
- Return a normalized import plan, count summary and structured errors containing file, row, column, code and message, without mutating services or databases.

Review focus: Parser correctness, domain rules, exact balance arithmetic and useful operator errors.

## Milestone 2 — Staging and Service Importers

### 3. Migration records, upload and staging API

- Add platform-level Social `Migration` and `MigrationLog` models with a small explicit status/phase state machine, initiator, summary and persisted checkpoint.
- Add superadmin-only list, detail, paginated log, upload and report endpoints.
- Store the raw bundle and normalized plan under a private S3 migration prefix.
- Validate on upload and transition the migration to `ready` or `invalid`; execution remains disabled.
- Add a configurable bundle-size limit and 30-day retention for inactive staging data.
- Keep logs concise and avoid copying sensitive row contents into them.

Review focus: State transitions, access control, useful audit data and simple private staging.

### 4. Auth provisioning and imported-account activation

- Add service-authenticated bulk operations that resolve users by the existing normalized-email rule.
- Reuse existing users and idempotently create new unverified users without a usable password.
- Persist and return the canonical Auth UUID mapping so Social and Accounting use the same user ID.
- Define conflicts for duplicate bundle emails, disabled users and an email already linked incompatibly in the destination.
- Extend the existing Auth action-token mechanism with an imported-account activation purpose that verifies the email and sets the initial password in one single-use flow.
- Add the Notifications event/template and send activation invitations only for users that need them.
- Key provisioning and invitation operations by migration and user. Do not connect them to the worker yet.

Review focus: Canonical user mapping, conflict behavior, idempotency and reuse of existing Auth security mechanisms.

### 5. Accounting snapshot import and reconciliation

- Extract the database-import and balance-setting portions of the IntegralCES migration into one generic snapshot importer rather than creating a parallel implementation.
- Add private, batched, idempotent operations for currency metadata, users, accounts and historical transfers, keyed by migration and stable source key.
- Store historical committed transfers with their original timestamps and metadata and with no Stellar hash.
- Reject any declared balance that differs from committed history.
- Reconcile the ledger with one net Stellar adjustment per non-zero account through a temporary migration account.
- Verify database and ledger balances and require the temporary account to end at zero before deleting it.
- Add fake-ledger tests covering retry after every external-effect boundary.
- Allow cleanup only before the first Stellar adjustment. After that point, failures must resume forward rather than attempt destructive rollback.

Review focus: Exact `BigInt` arithmetic, persisted idempotency, ledger safety and the point-of-no-return rule.

### 6. Social community and marketplace import

- Import a pending, invisible community, Social user projections, administrators, members, member-user relationships and Accounting references.
- Import categories, offers, wants, contacts, requested statuses and preserved timestamps in bounded batches.
- Derive deterministic destination IDs from the migration and stable source keys, with database uniqueness enforcing idempotency.
- Bypass normal community, member and post notification side effects during import.
- Keep the community pending and all imported content unavailable through normal public paths until final activation.

Review focus: Tenant isolation, canonical user relationships, status fidelity and idempotent retries.

### 7. Downloaded image sync

- Derive a deterministic tenant-scoped S3 object key from each stable source image key.
- Reuse an existing Social `File` mapping first. If the database was reset, check S3 and recreate the `File` mapping from the existing object without downloading it again.
- When the object is missing, download its HTTP(S) source URL with a timeout, response-size limit, small redirect limit and detected MIME validation, then store it using the existing Social S3 behavior.
- Treat download failures as warnings and continue the migration. On any rerun or resume, retry only images whose `File` mapping and S3 object are still missing.
- Link available `File` records to their Social resources using the existing file-linking behavior.
- Do not add user-supplied checksums, global content-addressed storage or cross-tenant deduplication.
- Keep public-domain/CC0 source notes for the curated demo images in documentation, not as required migration fields.

Review focus: S3-first synchronization, correct image-to-resource links and best-effort retry behavior.

## Milestone 3 — Execution and Operator Experience

### 8. Persistent worker, orchestration and recovery

- Add a separate worker command in the Social image that claims one ready migration at a time from PostgreSQL and resumes from persisted checkpoints after termination.
- HTTP actions only enqueue work; they never run detached imports.
- Connect the reviewed primitives in this order:
  1. Resolve or provision Auth users.
  2. Import pending Social resources and synchronize downloaded images.
  3. Import and reconcile Accounting.
  4. Link Accounting IDs and apply requested Social statuses.
  5. Activate the community.
  6. Queue required activation invitations.
  7. Complete the audit summary.
- Use Social service credentials and stable per-phase idempotency keys rather than persisted superadmin tokens.
- Record actionable phase failures and allow resume from the last completed checkpoint.
- Allow abort and cleanup only before Accounting reconciliation starts. After reconciliation starts, expose resume rather than abort; never delete reused Auth users.
- Add the Social worker to Compose/deployment wiring and add a cross-service integration test with fake S3, Notifications and Stellar.

Review focus: Phase ordering, restart behavior, final activation boundary and safe recovery without distributed rollback.

### 9. Adapt the existing superadmin migration UI

- Adapt the existing migration list, details and form routes to the Social migration API behind the feature flag instead of building a second UI.
- Keep route pages thin: the list and details pages compose focused upload/confirmation, status/log and action components; a typed Composition API composable owns API calls, state and authenticated polling.
- Use typed props for migration/status data and emitted events for upload, run, resume and abort actions.
- Show status, phase, counts, validation errors, warnings and paginated logs.
- Add the upload, validation and explicit confirmation flow plus the available run/resume/abort action.
- Replace the public Accounting migration log stream with authenticated polling.
- Remove editable IntegralCES source URL/token/step fields and its creation entry while keeping existing Accounting migration records available through a clearly separate read-only legacy view.
- Keep superadmin copy untranslated, following the existing app convention.

Review focus: Reuse of existing screens, clear component boundaries, authenticated polling and safe operator actions.

## Milestone 4 — Demo as a Migration Consumer

### 10. Guarded demo installer, fixtures and acceptance

- Add a one-shot installer that reads migration directories from `shared/demo/`.
- Require `DEMO_SITE=true` and `--force`, and verify that configured databases and storage are explicitly marked as demo targets before resetting them.
- Reset all service databases and notification queues while preserving the demo image objects in S3, deploy schemas, run the same import worker flow and verify invariants.
- Add Auth demo provisioning using `DEMO_PASSWORD`; reject it outside demo mode.
- Prove the installer first with the tiny example fixture.
- Add the complete `MATH` fixture as data-only content:
  - Riemann, Euclid, Gauss, Noether and Fermat.
  - Rate `1/1`, five categories, ten offers, five wants and approximately 24 historical transfers.
  - Most activity on Riemann and Euclid, supporting members with net-zero histories and exactly two non-zero accounts.
- Add the realistic, privacy-safe Barcelona-area `DEMO` fixture and image URL catalogue as data-only content:
  - Rate `1/10`, eight users, ten active profiles, one pending applicant, five categories, fifteen offers and eight wants.
  - Most activity on Alex and Sam, with supporting accounts net zero.
  - Public-domain/CC0 image sources documented without checksums.
- After each CSV import, create one ordinary committed transfer through the normal authenticated Accounting workflow.
- Add curated in-app notifications without email or push delivery and document demo credentials and highlights.
- Add a full Compose acceptance test proving:
  - Both communities and expected content exist.
  - Every database balance matches committed history and Stellar.
  - Historical transfers have no Stellar hashes.
  - Reconciliation creates at most two balance adjustments per community.
  - Each community has exactly one normal post-import Stellar transfer.
  - Reinstalling produces the same database counts and synchronizes `File` rows from existing S3 objects without requiring successful image downloads.
- Enable the feature on demo deployments while leaving production opt-in.

Review focus: Destructive-operation guardrails, useful demo content, exact balance arithmetic and deterministic end-to-end behavior.
