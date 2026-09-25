# Community migration bundle format

This document defines the input format for importing one community into Komunitin. The directory contains a tiny, self-balancing [example](example/) whose CSVs are also the header references. The offline parser lives in [social/src/features/migrations/bundle](../../social/src/features/migrations/bundle/); the [executor](../../social/src/features/migrations/README.md) currently supports only communities whose Accounting data is already migrated.

The offline parser accepts either a directory or a ZIP; the HTTP executor accepts only a ZIP whose root contains these case-sensitive filenames directly. Nested paths and unlisted files are invalid. A bundle has no manifest: all imported community and resource data belongs in the CSV files below.

All bundles use the same columns and validation rules. [IntegralCES social migration](#integralces-social-migration) shows how the exporter uses this format.

## Files

| File | Required | Contents |
| --- | --- | --- |
| `community.csv` | yes | Exactly one community and its currency. |
| `users.csv` | yes | Auth users and Social user projections. |
| `member-users.csv` | yes | Member–user relationships and per-membership preferences. |
| `members.csv` | yes | Members and their accounts. |
| `transfers.csv` | no | The complete committed local transfer history. |
| `categories.csv` | no | Marketplace categories. |
| `posts.csv` | no | Offers and needs. |

Required files must be present even when they have only a header. Optional files may be omitted when no row references them. Omitting `transfers.csv` is equivalent to an empty transfer history; the complete-history invariants still apply.

## Common rules

- CSV is UTF-8, comma-delimited and RFC 4180 quoted. A UTF-8 byte-order mark is accepted. Headers may contain any subset of the documented columns, in any order, without duplicates. Omitted columns are treated as blank in every row; required-value and conditional validation still apply. Unless a column is explicitly optional or allowed to be empty below, every cell is required. Blank optional cells mean “not provided”; the literal strings `null` and `undefined` have no special meaning.
- `code` is the stable key for groups, currencies, members, accounts, categories and posts. The single Social group and currency share the `community.csv` code, while each Social member and its account share the `members.csv` code. Relationships contain resource codes or user emails. Keys are opaque: a UUID-shaped value is not assumed to be a destination identifier.
- Email is the stable user key. Every user relationship must match a `users.csv` email after `trim().toLowerCase()` normalization, and emails must be unique after normalization. Plaintext passwords are never included; `users.csv.passwordHash` may contain a bcrypt or Drupal 7 password hash.
- Multi-value relationship cells contain keys separated by semicolons, with no whitespace around the separator. Email keys are normalized as above; resource codes retain their documented form. A blank cell means no relationships, while empty or duplicate list items are invalid.
- Every record has an optional `id` UUID. `community.csv` also has `currency.id`, and `members.csv` has `account.id`. Nonblank IDs must be valid UUIDs and unique within the corresponding resource table (case-insensitive); multiple blank IDs are allowed. Supplied UUIDs are preserved as destination identifiers, normalized to lowercase. Blank IDs are resolved from existing records or generated for new records during execution. Codes and emails remain the relationship keys.
- Timestamps are ISO 8601 date-time values with a UTC offset. They are normalized to UTC with millisecond precision. No update timestamp may precede its corresponding creation timestamp.
- Contacts use one predefined column per supported contact type. A resource may therefore have at most one contact of each type.
- `imageUrls` is an ordered semicolon-delimited list of image URLs. Semicolons are invalid inside URLs in that column. Order and repeated URLs are preserved.
- Image URLs are absolute `http` or `https` URLs of at most 2,048 characters with a hostname and no embedded credentials. Downloads are best-effort. Alt text, checksums and licence metadata are not part of the format.
- Images have no separate keys, supplied or derived. The normalized plan carries the source URL, owning resource and zero-based position so an executor can associate each download with its destination. Reordering URLs only changes display order.
- Enum and boolean values are case-sensitive. Booleans in ordinary CSV cells are `true` or `false`.
- The executor can import an existing community: create missing records, reuse matching records, preserve existing values, and reject conflicting UUIDs or relationships for manual resolution. Re-upload a corrected bundle to retry. The offline parser intentionally performs no service or database lookup.

## Reconciliation

The current executor requires Accounting to be migrated already. It looks up the currency by community code and accounts by member code within that currency, validates UUIDs and account owners, and links Social records to those existing resources. Missing required Accounting records fail the attempt. Accounting fields, balances, settings and transfers are not written or reconciled; supplied Accounting data is reported as ignored. The format also retains those fields for a future Accounting executor.

`currency.id` and `account.id` are optional. When supplied, they must agree with the record found by code, or the executor fails the attempt. The current executor never creates Accounting records. Blank or omitted fields do not request that existing values be cleared. Supplying a field does not force creation of a new record.

Active, disabled, suspended and deleted members require an account. Draft and pending members have no account and must leave all `account.*` fields blank.

The offline parser validates supplied values and relationships without querying the destination. The current executor checks existence and identity relationships, but does not compare balances or history. Existing transfers are never replayed and balances are never reset.

### Exact amounts

All monetary cells and monetary settings are decimal strings in currency units, such as `25`, `25.00` or `0.125`, except settings explicitly documented to also accept `false`. Decimal values must match `-?(0|[1-9][0-9]*)(\.[0-9]+)?`, have no exponent, grouping separator or leading `+`, and have at most `currency.scale` fractional digits. Monetary values require `currency.scale` for offline validation and are converted exactly to scaled integers; floating-point arithmetic is not used.

`account.balance` may be negative. Transfer `amount` must be greater than zero. Credit and maximum limits must be non-negative. A blank `account.maximumBalance` leaves the existing limit unchanged, or defaults to unlimited for a new account. Every scaled amount must fit a signed 64-bit integer. `currency.decimals` and `currency.scale` are integers with `0 <= currency.decimals <= currency.scale`, `currency.decimals <= 8` and `currency.scale <= 12`. `currency.rateNumerator` and `currency.rateDenominator` are positive base-10 integers no greater than 2,147,483,647.

## CSV headers and values

### `community.csv`

```text
id,code,name,status,description,access,adminUsers,currency.id,currency.adminUser,currency.name,currency.namePlural,currency.symbol,currency.decimals,currency.scale,currency.rateNumerator,currency.rateDenominator,createdAt,updatedAt,currency.createdAt,currency.updatedAt,imageUrl,address.streetAddress,address.locality,address.postalCode,address.region,address.country,location.type,location.longitude,location.latitude,contact.phone,contact.email,contact.telegram,contact.whatsapp,contact.website,contact.instagram,contact.facebook,contact.twitter,settings.requireAcceptTerms,settings.terms,settings.minOffers,settings.minNeeds,settings.allowAnonymousMemberList,settings.enableGroupEmail,settings.defaultGroupEmailFrequency,currency.settings.defaultInitialCreditLimit,currency.settings.externalTraderCreditLimit,currency.settings.defaultInitialMaximumBalance,currency.settings.defaultOnPaymentCreditLimit,currency.settings.externalTraderMaximumBalance,currency.settings.defaultAcceptPaymentsAfter,currency.settings.defaultAcceptPaymentsWhitelist,currency.settings.defaultAllowPayments,currency.settings.defaultAllowPaymentRequests,currency.settings.defaultAcceptPaymentsAutomatically,currency.settings.defaultAllowSimplePayments,currency.settings.defaultAllowSimplePaymentRequests,currency.settings.defaultAllowQrPayments,currency.settings.defaultAllowQrPaymentRequests,currency.settings.defaultAllowMultiplePayments,currency.settings.defaultAllowMultiplePaymentRequests,currency.settings.defaultAllowTagPayments,currency.settings.defaultAllowTagPaymentRequests,currency.settings.defaultAllowExternalPayments,currency.settings.defaultAllowExternalPaymentRequests,currency.settings.defaultAcceptExternalPaymentsAutomatically,currency.settings.enableExternalPayments,currency.settings.enableExternalPaymentRequests,currency.settings.enableCreditCommonsPayments,currency.settings.defaultHideBalance
```

- `code` is the stable key and destination code for both the Social group and currency: exactly four uppercase ASCII letters or digits. `name` is required and at most 255 characters. Currency names are at most 255 characters; `currency.symbol` is 1–3 characters when supplied.
- `description` may be empty. `access` is `public`, `group` or `private`. `createdAt` and `updatedAt` belong to the Social community; the corresponding `currency.*` timestamps belong to its currency. All `currency.*` fields and columns after `currency.updatedAt` are optional and use the denormalized shapes below.
- `adminUsers` is required and non-empty. Each listed email must exist in `users.csv` and grants that user the Social community administrator role; a member relationship is not required. When supplied, `currency.adminUser` must be one email from that list and owns the currency.
- `currency.settings.defaultAcceptPaymentsWhitelist` is a semicolon-delimited list of member/account codes. It maps to the currency default payment-acceptance whitelist; blank leaves an existing whitelist unchanged, or defaults to an empty list for a new record.
- `status` is required and must be `pending`, `active` or `disabled`. New communities retain the supplied status immediately. Partially imported data may be visible; downtime is acceptable and the migration is not atomic.

### `users.csv`

```text
id,email,name,status,passwordHash,language,createdAt,updatedAt
```

- `email` is required. `status` is `active` or `disabled`, matching Auth, or blank when unknown. `createdAt` and `updatedAt` may also be blank when unknown. Unknown values are retained as `null` in the plan. For new identities, execution defaults unknown status to `disabled` with a warning, missing creation time to update time or import time, and missing update time to creation time. `name` (at most 255 characters), `language` (at most 31 characters) and `passwordHash` are optional. These are global identities, so an email occurs once even when it belongs to several members. Name, language and timestamps populate the Social user projection; Auth owns credentials and has no `name` field.
- Existing Auth users are reused by normalized email. Their status, passwords and existing global Social profiles are not overwritten by a community import. New Auth and Social users must share the supplied user UUID, or the same Auth-generated UUID when blank. A supplied UUID that conflicts with an existing user’s UUID must be rejected rather than silently replaced; execution must also reject destination ID collisions.
- `passwordHash` accepts bcrypt (`$2a$` or `$2b$`, costs 04–31) and native Drupal 7 SHA-512 (`$S$`, 55 characters, encoded iteration counts 7–30). Copy the complete hash unchanged; do not hash the hash. Plaintext, malformed hashes and older Drupal formats (`$P$`, `$H$`, `U`-prefixed hashes) are rejected without echoing their contents in errors.
- A blank `passwordHash` means a new identity has no usable password and must set one through Auth's password-reset flow. Auth verifies bcrypt and Drupal 7 hashes, upgrading Drupal hashes to bcrypt on successful login. The current migration policy marks newly imported email addresses verified; existing verification and status values are preserved. The example Alice hash is for the demonstration password `komunitin-example`; Bob has no imported password.

### `member-users.csv`

```text
id,member,user,notifications.myAccount,notifications.group,emails.myAccount,emails.group
```

- Every row links a `members.csv` code in `member` to a `users.csv` email in `user`. The value of `user` is still an email, normalized with `trim().toLowerCase()`, not a destination UUID. The `(member, user)` pair must be unique; either key may recur in other pairs.
- These rows define membership and account ownership. Every non-deleted member must have at least one row. Deleted members may have none. There is no member role field in the current API; community administrators are declared separately in `community.csv.adminUsers`.
- Notification and email fields are optional and use the flat attributes of the Social `member-users` API, with no `settings.` prefix. Blank preferences inherit destination defaults. A user may have different preferences for each member.
- This replaces the old `users.csv` preferences layout. Move global name, language and timestamps to the new `users.csv`; expand the old member owner lists into one row per `(member, user)` in this file.

### `members.csv`

```text
id,code,name,type,status,access,description,account.id,account.balance,account.creditLimit,createdAt,updatedAt,account.createdAt,account.updatedAt,account.maximumBalance,imageUrl,address.streetAddress,address.locality,address.postalCode,address.region,address.country,location.type,location.longitude,location.latitude,contact.phone,contact.email,contact.telegram,contact.whatsapp,contact.website,contact.instagram,contact.facebook,contact.twitter,account.settings.onPaymentCreditLimit,account.settings.acceptPaymentsAfter,account.settings.acceptPaymentsWhitelist,account.settings.allowPayments,account.settings.allowPaymentRequests,account.settings.allowSimplePayments,account.settings.allowSimplePaymentRequests,account.settings.allowQrPayments,account.settings.allowQrPaymentRequests,account.settings.allowMultiplePayments,account.settings.allowMultiplePaymentRequests,account.settings.allowTagPayments,account.settings.allowTagPaymentRequests,account.settings.acceptPaymentsAutomatically,account.settings.allowExternalPayments,account.settings.allowExternalPaymentRequests,account.settings.acceptExternalPaymentsAutomatically,account.settings.hideBalance
```

- `code` is the stable key shared by the Social member and its account. It must be unique, at most 255 characters and start with the community code, for example `EXMP0001`, `EXMP10000` or `EXMPSpecial`.
- `type` is `personal`, `business`, `organization` or `public`; `status` is `draft`, `pending`, `active`, `disabled`, `suspended` or `deleted`; `access` is `public`, `group` or `private`.
- Linked users and account owners come from `member-users.csv`; there is no duplicate owner list in this file.
- Every `active`, `disabled`, `suspended` or `deleted` member has an account with the same `code` and status. Account fields are optional and retained for reconciliation. All account-only fields must be blank for `draft` and `pending` members, which do not have an account.
- `account.settings.acceptPaymentsWhitelist` is a semicolon-delimited list of member/account codes. It maps to the account payment-acceptance whitelist; blank leaves an existing whitelist unchanged, or defaults to an empty list for a new record.
- A declared balance cannot be below `-account.creditLimit` or above a non-blank `account.maximumBalance`. A supplied `account.balance` for a deleted member must be zero; their Social `deleted` timestamp is taken from the member's `updatedAt` value.
- `name` is required and at most 255 characters. `description` may be empty. All `account.*` fields and columns after `account.updatedAt` are optional. `createdAt` and `updatedAt` belong to the Social member; the corresponding `account.*` timestamps belong to its account.

### `transfers.csv`

```text
id,payer,payee,user,amount,description,createdAt,updatedAt
```

This format represents committed historical transfers with no Stellar hash. The current Social executor does not import transfers; it preserves existing Accounting history. Payer and payee must be distinct accounts in this bundle, and `user` identifies the initiator by email and must be present in `users.csv`. Current account or community administration is not used to re-authorize historical transfers. `description` may be empty. External accounts, opening-balance adjustments and partial histories are not supported.

### `categories.csv`

```text
id,code,name,description,access,createdAt,updatedAt,icon.type,icon.value
```

`code` is the stable category key. It and `name` are required and at most 255 characters; category codes are unique. `description` is optional and at most 1,000 characters. `access` uses the common access enum. `icon.type` and `icon.value` are optional, but must either both be blank or both be non-empty.

### `posts.csv`

```text
id,code,type,member,category,title,description,status,access,value,fulfilledAt,expiresAt,createdAt,updatedAt,location.type,location.longitude,location.latitude,imageUrls
```

- `code` is the stable post key; it is required, unique and at most 255 characters. `type` is `offer` or `need`. The owning `member` is required; `category` is optional.
- `status` is `draft`, `published` or `hidden`; `access` uses the common access enum. Post owners must exist in the bundle; their original member and post states are preserved, including published posts owned by inactive members.
- Both types require a non-empty `description` of at most 16,384 characters. Offers also require `title`; `title` and the optional `value` are at most 255 characters, `value` is descriptive text rather than a validated monetary amount, and `fulfilledAt` must be blank. Needs may omit `title`, must leave `value` blank and may set `fulfilledAt`.
- `fulfilledAt` and `expiresAt` cannot precede `createdAt`. `expiresAt` and all columns after `updatedAt` are optional. `imageUrls` preserves source order.

## Denormalized optional columns

Structured properties use predefined scalar columns with readable dotted names. Member-user preferences have no `settings.` prefix. Blank means not provided unless a field group states otherwise.

- Address fields are `address.streetAddress`, `address.locality`, `address.postalCode`, `address.region` and `address.country`. If an address is present, at least one must be non-empty.
- Location fields are `location.type`, `location.longitude` and `location.latitude`. If a location is present, type must be `Point`, both coordinates are required, longitude is from -180 to 180, and latitude is from -90 to 90.
- Contact fields are `contact.phone`, `contact.email`, `contact.telegram`, `contact.whatsapp`, `contact.website`, `contact.instagram`, `contact.facebook` and `contact.twitter`. Communities and members use the same union of contact columns. Instagram, Facebook and Twitter accept handles or URLs as optional strings. Each non-empty value represents one contact of the column type.
- Member-user preferences use boolean `notifications.myAccount` and `notifications.group`, boolean `emails.myAccount`, and `emails.group` set to `never`, `daily`, `weekly`, `monthly` or `quarterly`.
- Community settings use boolean `settings.requireAcceptTerms`, string `settings.terms`, non-negative integers `settings.minOffers` and `settings.minNeeds`, booleans `settings.allowAnonymousMemberList` and `settings.enableGroupEmail`, and `settings.defaultGroupEmailFrequency` set to `never`, `daily`, `weekly`, `monthly` or `quarterly`.
- Currency amount settings are `currency.settings.defaultInitialCreditLimit` and `currency.settings.externalTraderCreditLimit`. `currency.settings.defaultInitialMaximumBalance`, `currency.settings.defaultOnPaymentCreditLimit` and `currency.settings.externalTraderMaximumBalance` accept an amount or `false`. `currency.settings.defaultAcceptPaymentsAfter` accepts non-negative integer seconds or `false`. `currency.settings.defaultAcceptPaymentsWhitelist` is the semicolon-delimited account-code relationship.
- Currency boolean settings are all remaining `currency.settings.*` columns: `defaultAllowPayments`, `defaultAllowPaymentRequests`, `defaultAcceptPaymentsAutomatically`, `defaultAllowSimplePayments`, `defaultAllowSimplePaymentRequests`, `defaultAllowQrPayments`, `defaultAllowQrPaymentRequests`, `defaultAllowMultiplePayments`, `defaultAllowMultiplePaymentRequests`, `defaultAllowTagPayments`, `defaultAllowTagPaymentRequests`, `defaultAllowExternalPayments`, `defaultAllowExternalPaymentRequests`, `defaultAcceptExternalPaymentsAutomatically`, `enableExternalPayments`, `enableExternalPaymentRequests`, `enableCreditCommonsPayments` and `defaultHideBalance`.
- Member account settings use `account.settings.onPaymentCreditLimit`, which accepts a non-negative amount; `account.settings.acceptPaymentsAfter`, which accepts non-negative integer seconds; and the semicolon-delimited `account.settings.acceptPaymentsWhitelist` relationship. All remaining `account.settings.*` columns are booleans matching their names. NFC tag secrets are not imported.
- Category icon fields are `icon.type` and `icon.value`; both strings must be non-empty when an icon is present.
- Post `imageUrls` is the semicolon-delimited ordered URL list described in the common rules. Single community/member images use `imageUrl`.

## Complete-history invariants

When balances are supplied for every account, the parser starts at zero, adds each incoming transfer and subtracts each outgoing transfer. The result must equal each declared `account.balance`, and their total must be zero. A complete bundle that omits history or needs opening-balance adjustments is invalid.

When balances are omitted, the current Social executor leaves balances and history unchanged. A future Accounting executor must reconcile them before writing Accounting data. The offline parser cannot establish those remote facts.

In the example, Alice pays Bob `5.00`, producing balances of `-5.00` and `5.00`. The account totals are zero.

## IntegralCES social migration

The [ICES exporter](../cli/migration/ices/) exports Auth/Social data for a community whose currency and accounts already exist in Accounting. It produces an ordinary bundle using the reconciliation rules above:

- `community.csv` contains the social data, original `id` and `status`, and `currency.id` when available. The currency can also be found by code. Other `currency.*` fields are omitted.
- `members.csv` contains the social data and original member IDs. Active, disabled, suspended and deleted members retain `account.id` when available and can otherwise be matched by code. Draft and pending members leave it blank. Other `account.*` fields are omitted.
- `users.csv`, `categories.csv` and `posts.csv` retain original UUIDs. Member-user relationships use the usual member codes and user emails; their IDs are blank because the source exposes no relationship UUIDs.
- `transfers.csv` is omitted. The bundle supplies no changes to existing balances or history.
- User name, status, timestamps and password hashes are unknown through this API and are omitted. Execution needs an explicit identity and credential policy or supplemental source before creating Auth identities.
- Contact values and notification frequencies are retained, including Instagram/Facebook/Twitter and daily/quarterly frequencies. Execution must support or explicitly map values that the destination API does not yet accept. Administrators without memberships and published posts owned by inactive members retain their original relationships and states.

ICES UUIDs encode the resource type, internal numeric database ID and installation-specific salt bytes; CSV codes and emails cannot reconstruct them. Preserving UUIDs keeps existing resource URLs and Accounting user references. Supplied user IDs must agree with any existing Auth identity; execution must reject conflicts rather than silently assigning different IDs.

All ordinary bundle validation applies. The exporter’s API limitations are documented in its README.
