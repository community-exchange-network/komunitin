# ICES auth/social export

Exports one community from the Drupal-based Komunitin API into the CSV migration bundle format. Currencies and accounts are reconciled by code; IDs are retained when the source exposes them. The result is a CSV ZIP. The exporter does not run the bundle parser; import validation is a separate step, and tests check exported bundles against the parser. Import execution is separate and is not implemented yet.

From `shared/migration/ices/` (Node.js 24):

```sh
pnpm --dir ../../../social install
pnpm install
export ICES_CLIENT_ID=komunitin-notifications
read -rs ICES_CLIENT_SECRET
export ICES_CLIENT_SECRET
pnpm migrate:ices --url https://ices.example.org --code ABCD --output ABCD.zip
unset ICES_CLIENT_SECRET
```

Use an ICES OAuth service client allowed to request `komunitin_social_read_all`. Alternatively set `ICES_ACCESS_TOKEN` to an existing service token with that scope. Tokens and client secrets are read from the environment and are not written to the bundle. The site URL may include a Drupal installation subdirectory; do not pass `/oauth2` or `/ces/api/social` as part of it. `--page-size` defaults to 100.

The CLI creates the output with owner-only permissions and refuses to overwrite an existing file. It prints record counts and source limitations. It imports the CSV definitions and encoder from Social and requires Social dependencies to be installed. It does not need Social's database, application environment variables, or a running new backend.

For programmatic use:

```ts
import { createIcesMigrationBundle } from './index'

const { bytes, summary, warnings } = await createIcesMigrationBundle({
  url: 'https://ices.example.org',
  code: 'ABCD',
  auth: { clientId, clientSecret },
})
```

## Source contract

The exporter follows `ices/ces_komunitin/ces_komunitin.api.social.inc`, its `includes/*` serializers and `includes/JsonApiRequest.php`. The `master` stack configures ICES at `/oauth2` and `/ces/api/social`, with Accounting running separately.

| ICES source | Bundle destination |
| --- | --- |
| `/{code}?include=contacts,settings,admins,admins.settings` | Community, settings, administrator identities |
| `/{code}/members?include=contacts` | Member profiles, all six states, contact values, account UUID references |
| `/users?filter[members]={member UUID}&include=settings` | Global identities deduplicated by UUID; membership by the queried member; language and preferences |
| `/{code}/categories` | Categories and icons |
| `/{code}/offers`, `/{code}/needs` | Published/hidden and expired/unexpired posts, category and member relationships, image URLs |

Members use ICES offset cursors and are sorted by their unique code. Posts are sorted by modification time with no tie-breaker in ICES, and that endpoint ignores requested sorting. Offset pages can lose or repeat tied posts even on an idle database, so the exporter doubles the requested prefix size from offset zero until every post fits in one response (bounded by the bundle row limit). Users and categories ignore pagination in ICES and are deliberately fetched without a page loop. Public pagination URLs may differ from the configured internal URL: only their offset is used, and credentials always stay on the configured source. Redirects are rejected. Client-credentials tokens are renewed before expiry.

The exporter keeps original social UUIDs and the `currency.id`/`account.id` UUID references exposed by Social. ICES derives social UUIDs from internal numeric IDs and installation-specific salt bytes, which cannot be reconstructed from the CSV codes or emails. Preserving them also retains resource URLs and existing Accounting user references. `transfers.csv` is omitted. It does not fetch currency, account or transfer records from either accounting implementation, and makes no accounting changes. The exporter does not require currency or account UUIDs. Execution must find these records by code or obtain the information needed to create missing records.

Legacy fields map as follows: `created/updated` → `createdAt/updatedAt`, member/post `state` → `status`, offer `name/price` → `title/value`, post `content` → `description`, `expires` → `expiresAt`, and contact `name` → its scalar CSV column. The Unix epoch expiry sentinel becomes blank. Address keys and GeoJSON coordinates are flattened into the documented CSV columns. Images remain source URLs with original order and duplicates; binaries are not downloaded.

## Source limitations

- The API exposes identity email, UUID and preferences, but not identity name, status, timestamps or password hashes. Those columns are blank, never inferred from member state or profile timestamps. A future Auth import must resolve identity status and credential setup explicitly or use a supplemental export. Drupal password hashes are not compatible with the current Auth bcrypt verifier.
- The API maps each member to its first owner. Additional shared-account owners, identities without a member or administrator relationship, and virtual members are not enumerated. User `members` relationships can include other communities and are not used to infer ownership. A complete Drupal identity migration beyond this API projection needs an additional source.
- Legacy `daily` and `quarterly` email preferences are retained and reported in warnings. The new Social service currently accepts `never`, `weekly` and `monthly`; execution must explicitly support or map the additional values. The ICES `komunitin` usage flag and the hardcoded `requireAdminApproval=true` setting have no destination field and are omitted.
- Legacy Instagram, Facebook and Twitter contacts are retained in the common community/member contact columns and reported in warnings. The destination must explicitly support or map them.
- Unsupported or duplicate contact types, inaccessible owners, missing references and malformed responses fail the export. Field and semantic validation belongs to the importer. Errors do not produce a partial ZIP. The original destination contact types are phone, email, telegram, whatsapp and website.
- Administrators without a member and published posts belonging to inactive members are preserved under the common migration rules. They are valid legacy states, and migration must not silently drop them or change their status.
- ICES does not provide snapshot isolation. Pause source writes during the final export. Repeated resources or invalid pagination abort rather than looping, but concurrent changes cannot all be detected. The bundle row limit applies during export; byte limits are checked by import validation.

See [IntegralCES social migration](../FORMAT.md#integralces-social-migration) for the bundle layout and import-plan semantics.

## Verification

```sh
pnpm typecheck
pnpm test
```

The HTTP fixture tests legacy filtering, pagination, auth, field mapping, ZIP validation and failures without a database. For a live smoke test, run against an isolated ICES demo installed with `ices/install.sh --demo`, enable `komunitin_accounting` on the demo communities as in the `master` startup script, and export NET1 and NET2 using a small page size. Do not run the demo installer against an existing source database.

## Bundle format

- [FORMAT.md](../FORMAT.md) defines the exact files, headers, denormalized values, relationships and validation invariants.
- [example/](../example/) is a tiny complete bundle and the header reference for every CSV file, with two global users, member-user preferences, combined member/account records, marketplace content, image URLs and one committed transfer.

The example is self-balancing: Alice pays Bob `5.00`, so their declared balances are `-5.00` and `5.00`. Complete bundles must likewise contain complete committed history and total zero. Every bundle requires a new Social community; currencies and accounts are reconciled by code, reusing existing records and creating missing ones.

Images have no separate source keys. The plan records their owner and position, preserving URL order and duplicates.

The offline parser reads only the bundle. It does not check deployed communities; upload staging performs that read-only existence check, and execution repeats it immediately before import.

`users.csv` holds global identities, including optional `passwordHash` values in Auth's bcrypt format. `member-users.csv` links users by email to members and carries per-membership preferences without a `settings.` prefix. Membership rows also determine account ownership. Compatible hashes preserve passwords; unsupported legacy hashes require a password reset or separate Auth support. See [the credential rules](../FORMAT.md#userscsv).

The [Social parser](../../../social/src/features/migrations/bundle/) and its tests remain in Social. From `social/`, run `pnpm test-one 'test/migration/migration-bundle*.test.ts'` to verify import validation.
