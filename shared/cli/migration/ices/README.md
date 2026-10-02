# ICES auth/social export

Exports one or all communities from the Drupal-based Komunitin API into the CSV migration bundle format. Currencies and accounts are reconciled by code; IDs are retained except for explicitly merged duplicate identities. The full generator sanitizes the source records before writing CSVs and validates the resulting ZIP with the bundle parser. Import execution is provided by the [Social migration endpoint and CLI](../../../../social/src/features/migrations/README.md), for communities already migrated to Accounting.

Set the source credentials in the repository root `.env`:

```dotenv
ICES_ADMIN_EMAIL=admin@example.org
ICES_ADMIN_PASSWORD=source-admin-password
ICES_DATABASE_URL=mysql://read_only_user:password@host:3306/drupal_database
```

Run from the repository root (Docker only; dependencies are included in the CLI image):

```sh
./shared/cli/komunitin admin bundle ices --url https://ices.example.org --code ABCD --output ABCD.zip
```

The CLI reads source identities from the database, fetches the community through the API, sanitizes its records, and then builds and validates the CSV ZIP. The output path must be inside the invoking directory, which the wrapper mounts writable. With local Node.js 24 and pnpm, install dependencies in `social/` and `shared/cli/`, export the source credentials, and run from `shared/cli/`:

```sh
pnpm migrate:ices --url https://ices.example.org --code ABCD --output ABCD.zip
```

For source inspection without sanitization, the original API-only export and credential enrichment remain available separately. These commands do not resolve duplicate identities or validate the resulting bundle:

```sh
pnpm export:ices --url https://ices.example.org --code ABCD --output ABCD.zip
pnpm passwords:ices --bundle ABCD.zip
```

To generate all communities, replace `--code` with `--all` and use a directory for `--output`:

```sh
./shared/cli/komunitin admin bundle ices --url https://ices.example.org --all --output ./bundles
```

The API-only `pnpm export:ices` script supports `--all` as well.

`--all` pages through `/groups` including pending, active and disabled communities and creates `<CODE>.zip` for each, sharing the authenticated session and source identity snapshot. Each bundle is sanitized and validated before writing. Existing ZIPs are never overwritten. If generation fails, earlier completed bundles remain; no ZIP is written for the failing community. The command stops at the first failure.

HTTP requests have a fixed 120-second timeout, including reading the response body. Timed-out reads are retried twice after 1 and 2 seconds, retaining previously fetched data in memory. Authentication requests are not retried. Retry and final timeout messages identify the endpoint, query, timeout, and attempt. A final failure still stops the export; the current community has no checkpoint and must be restarted. Earlier completed ZIPs remain on disk.

Progress is written to stderr as requests and export steps run: community codes, resource paths, page offsets and limits, fetched counts, member/user totals, sanitization counts, CSV row counts, and ZIP creation. JSON results remain on stdout and count the final sanitized records. Progress does not include credentials, emails, or password hashes.

The full generator needs a MySQL/MariaDB connection in `ICES_DATABASE_URL` with read access to the Drupal `users` table. It reads all non-anonymous identities once, including users outside the selected community. The UID encoded in the ICES social UUID identifies each source record; normalized email is checked for consistency, never used to select a password. It copies `users.pass` unchanged and maps `users.status` (`1` → `active`, `0` → `disabled`). Identity status is independent of member state. Empty passwords remain blank. Source writes must stay paused throughout generation; the database and API must belong to the same installation.

The standalone `passwords:ices` command also matches by UID and checks the email, allowing the generated `deleted-<uid>@deleted.invalid` address. It changes only password hashes and identity statuses, atomically replacing the ZIP with owner-only permissions after all queries succeed. On failure, the input ZIP is retained. Keep completed bundles private: they contain password hashes. Drupal 7 `$S$` hashes are accepted by the parser and upgraded by Auth after a successful login.

## Sanitization rules

Sanitization is a dedicated in-memory stage before CSV serialization. Member ownership and community administrators use UUID references internally, so duplicate or blank source emails cannot confuse ownership. The final CSVs contain the resolved email references.

- Replace `deleted@deleted.org` (case-insensitive), blank emails, and conflicting non-active identities' emails with `deleted-<uid>@deleted.invalid`. Preserve identity status; unique, non-redacted emails of disabled users remain unchanged.
- For active identities sharing a normalized email, keep the source user with the lowest UID. Redirect the other users' member relationships and administrator references to that identity. Use its UUID, password and profile, never the discarded user's password. The survivor may come from another community; its identity is included even if this community's API did not return it. The rule uses the entire database so independent community exports choose the same survivor. It does not use plus-address aliases.
- Convert whitespace-only values to blank, leaving password hashes untouched. Trim website/image URLs and add `https://` to plausible hostnames without a scheme (including protocol-relative URLs). Clear website fields that cannot be repaired unambiguously, reporting the count. Unrepairable image URLs remain for validation to reject.
- If a post expires before creation, set expiry to creation plus one calendar month in UTC, clamping to the last day of the next month when needed.
- Omit posts whose description is empty or whitespace-only, including their image references.

Sanitization counts are reported without personal data. Source records are never modified. The full generator refuses to write a bundle that still fails field or semantic validation.

Set `ICES_ADMIN_EMAIL` and `ICES_ADMIN_PASSWORD` to Drupal site administrator credentials. The exporter obtains a password-grant token from Drupal using the built-in `komunitin-app` client and the `komunitin_social komunitin_social_read_all` scopes. It reuses the token throughout generation and renews it before expiry. Credentials and tokens are not written to the bundle. The site URL may include a Drupal installation subdirectory; do not pass `/oauth2` or `/ces/api/social` as part of it. The CLI uses a page size of 100.

The API CLI creates the output with owner-only permissions and refuses to overwrite an existing file. It prints record counts and source limitations. It imports the CSV definitions and encoder from Social and requires Social dependencies to be installed. It does not need Social's database, application environment variables, or a running new backend.

For programmatic use:

```ts
import { createIcesMigrationBundle } from './index'

const { bytes, summary, warnings } = await createIcesMigrationBundle({
  url: 'https://ices.example.org',
  code: 'ABCD',
  auth: { email, password },
})
```

## Source contract

The exporter follows `ices/ces_komunitin/ces_komunitin.api.social.inc`, its `includes/*` serializers and `includes/JsonApiRequest.php`. The `master` stack configures ICES at `/oauth2` and `/ces/api/social`, with Accounting running separately.

| ICES source | Bundle destination |
| --- | --- |
| `/groups?filter[status]=pending,active,disabled` | Community discovery for `--all` |
| `/{code}?include=contacts,settings,admins,admins.settings` | Community, settings, administrator identities |
| `/{code}/members?include=contacts` | Member profiles, all six states, contact values, account UUID references |
| `/users?filter[members]={member UUID}&include=settings` | Global identities deduplicated by UUID; membership by the queried member; language and preferences |
| `/{code}/categories` | Categories and icons |
| `/{code}/offers`, `/{code}/needs` | Published/hidden and expired/unexpired posts, category and member relationships, image URLs |

Members use ICES offset cursors and are sorted by their unique code. Posts are sorted by modification time with no tie-breaker in ICES, and that endpoint ignores requested sorting. Offset pages can lose or repeat tied posts even on an idle database, so the exporter doubles the requested prefix size from offset zero until every post fits in one response (bounded by the bundle row limit). Users and categories ignore pagination in ICES and are deliberately fetched without a page loop. Public pagination URLs may differ from the configured internal URL: only their offset is used, and credentials always stay on the configured source. Redirects are rejected. Password-grant tokens are renewed before expiry.

The exporter keeps original social UUIDs and the `currency.id`/`account.id` UUID references exposed by Social, except that sanitized duplicate active identities use the survivor's user UUID. ICES derives social UUIDs from internal numeric IDs and installation-specific salt bytes, which cannot be reconstructed from the CSV codes or emails. Preserving them also retains resource URLs and existing Accounting user references. `transfers.csv` is omitted. It does not fetch currency, account or transfer records from either accounting implementation, and makes no accounting changes. The exporter does not require currency or account UUIDs. Execution must find these records by code or obtain the information needed to create missing records.

Legacy fields map as follows: `created/updated` → `createdAt/updatedAt`, member/post `state` → `status`, offer `name/price` → `title/value`, post `content` → `description`, `expires` → `expiresAt`, and contact `name` → its scalar CSV column. The Unix epoch expiry sentinel becomes blank. Address keys and GeoJSON coordinates are flattened into the documented CSV columns. Images remain source URLs with original order and duplicates; binaries are not downloaded.

## Source limitations

- The API exposes identity email, UUID and preferences, but not identity name, status, timestamps or password hashes. The API export leaves those columns blank, never inferred from member state or profile timestamps. The database enrichment supplies identity status and password hashes. API-only imports default new identities to `active` and require a password reset. Auth verifies native Drupal 7 `$S$` hashes and upgrades them to bcrypt after successful login.
- The API maps each member to its first owner. Additional shared-account owners, identities without a member or administrator relationship, and virtual members are not enumerated. User `members` relationships can include other communities and are not used to infer ownership. A complete Drupal identity migration beyond this API projection needs an additional source.
- Legacy `daily` and `quarterly` email preferences are retained and reported in warnings. The new Social service currently accepts `never`, `weekly` and `monthly`; execution must explicitly support or map the additional values. The ICES `komunitin` usage flag and the hardcoded `requireAdminApproval=true` setting have no destination field and are omitted.
- Legacy Instagram, Facebook and Twitter contacts are retained in the common community/member contact columns and reported in warnings. The destination must explicitly support or map them.
- When a community or member has multiple contacts of the same type, only the first is exported. Posts referencing members absent from the export are skipped; posts referencing absent categories are exported without a category. Both cases produce warnings immediately on stderr and in the final JSON. Unsupported contact types, inaccessible owners, other missing references and malformed responses fail the export. Field and semantic validation belongs to the importer. Errors do not produce a partial ZIP. The original destination contact types are phone, email, telegram, whatsapp and website.
- Administrators without a member and published posts belonging to inactive members are preserved under the common migration rules. They are valid legacy states, and migration must not silently drop them or change their status.
- ICES does not provide snapshot isolation. Pause source writes during the final export. Repeated resources or invalid pagination abort rather than looping, but concurrent changes cannot all be detected. The bundle row limit applies during export; byte limits are checked by import validation.

See [IntegralCES social migration](../../../migration/FORMAT.md#integralces-social-migration) for the bundle layout and import-plan semantics.

## Verification

From `shared/cli/`:

```sh
pnpm typecheck
pnpm test
```

The HTTP fixture tests legacy filtering, pagination, auth, field mapping, ZIP validation and failures without a database. For a live smoke test, run against an isolated ICES demo installed with `ices/install.sh --demo`, enable `komunitin_accounting` on the demo communities as in the `master` startup script, and export NET1 and NET2 using a small page size. Do not run the demo installer against an existing source database.

## Bundle format

- [FORMAT.md](../../../migration/FORMAT.md) defines the exact files, headers, denormalized values, relationships and validation invariants.
- [example/](../../../migration/example/) is a tiny complete bundle and the header reference for every CSV file, with two global users, member-user preferences, combined member/account records, marketplace content, image URLs and one committed transfer.

The example is self-balancing: Alice pays Bob `5.00`, so their declared balances are `-5.00` and `5.00`. Complete bundles must likewise contain complete committed history and total zero. The executor supports new or existing Social communities, creating missing records and preserving existing values. Currency and required accounts must already exist in Accounting; they are checked by code and never modified.

Images have no separate source keys. The plan records their owner and position, preserving URL order and duplicates.

The offline parser reads only the bundle. It does not check deployed communities. The executor checks destination identities and relationships, logs conflicts, and supports re-uploading after manual resolution.

`users.csv` holds global identities, including optional `passwordHash` values in bcrypt or Drupal 7 `$S$` format. `member-users.csv` links users by email to members and carries per-membership preferences without a `settings.` prefix. Membership rows also determine account ownership. Compatible hashes preserve passwords; unsupported legacy hashes require a password reset or separate Auth support. See [the credential rules](../../../migration/FORMAT.md#userscsv).

The [Social parser](../../../../social/src/features/migrations/bundle/) and its tests remain in Social. From `social/`, run `pnpm test-one 'test/migration/migration-bundle*.test.ts'` to verify import validation.
