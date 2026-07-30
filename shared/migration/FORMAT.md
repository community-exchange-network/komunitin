# Community migration bundle format

This document defines the input format for importing one community into Komunitin. The directory contains a tiny, self-balancing [example](example/) whose CSVs are also the header references. There is no importer here yet.

The importer accepts either a directory or a ZIP whose root contains these case-sensitive filenames directly. Nested paths and unlisted files are invalid. A bundle has no manifest: all imported community and resource data belongs in the CSV files below.

## Files

| File | Required | Contents |
| --- | --- | --- |
| `community.csv` | yes | Exactly one community and its currency. |
| `users.csv` | yes | Auth users and Social user projections. |
| `members.csv` | yes | Member profiles and their local Accounting account data. |
| `transfers.csv` | yes | The complete committed local transfer history. |
| `categories.csv` | no | Marketplace categories. |
| `posts.csv` | no | Offers and wants. |

Required files must be present even when they have only a header. Optional files may be omitted when no row references them.

## Common rules

- CSV is UTF-8, comma-delimited and RFC 4180 quoted. A UTF-8 byte-order mark is accepted. Headers must contain exactly the documented columns, in any order. Unless a column is explicitly optional or allowed to be empty below, every cell is required. Blank optional cells mean “not provided”; the literal strings `null` and `undefined` have no special meaning.
- `code` is the stable key for groups, currencies, members, accounts, categories and posts. The single Social group and Accounting currency share the `community.csv` code, while each Social member and its Accounting account share the `members.csv` code. Relationships use the corresponding `*Code` field. Keys are opaque: a UUID-shaped value is not assumed to be a destination identifier.
- Email is the stable user key. Every user relationship must match a `users.csv` email after `trim().toLowerCase()` normalization, and emails must be unique after normalization. Passwords are never included.
- Multi-value relationship cells contain keys separated by semicolons, with no whitespace around the separator. Email keys are normalized as above; resource codes retain their documented form. A blank cell means no relationships, while empty or duplicate list items are invalid.
- `sourceKey` is an opaque, non-blank bundle-local source key of at most 128 characters. It is stable across retries and unique within `transfers.csv`.
- Timestamps are ISO 8601 date-time values with a UTC offset. They are normalized to UTC with millisecond precision. No update timestamp may precede its corresponding creation timestamp.
- Contacts use one predefined column per supported contact type. A resource may therefore have at most one contact of each type.
- `imageUrls` is an ordered semicolon-delimited list of image URLs. Semicolons are invalid inside URLs in that column. List position is part of each post image's stable source identity, so repeated URLs are allowed.
- Image URLs are absolute `http` or `https` URLs of at most 2,048 characters with a hostname and no embedded credentials. Downloads are best-effort. Alt text, checksums and licence metadata are not part of the format.
- Images do not carry user-supplied keys. The importer derives each image source key as `<owner-type>:<owner-key>:image:<position>`, where `position` is zero-based. The owner type is `community` for `community.csv.imageUrl`, `member` for `members.csv.imageUrl`, and the post's `offer` or `want` type for `posts.csv.imageUrls`. Community and member images always use position `0`; post images use their position in `imageUrls`. For example, the first image of offer `fresh-bread` is `offer:fresh-bread:image:0`. Reordering a post's URLs therefore changes which derived identity belongs to each URL.
- Enum and boolean values are case-sensitive. Booleans in ordinary CSV cells are `true` or `false`.
- The destination `community.csv` code must not already exist; imports never overwrite or merge communities. The offline parser intentionally performs no service or database lookup. Upload staging checks existence read-only, and execution checks it again immediately before importing.

### Exact amounts

All monetary cells and monetary settings are decimal strings in currency units, such as `25`, `25.00` or `0.125`, except settings explicitly documented to also accept `false`. Decimal values must match `-?(0|[1-9][0-9]*)(\.[0-9]+)?`, have no exponent, grouping separator or leading `+`, and have at most `currency.scale` fractional digits. Values are converted exactly to scaled integers; floating-point arithmetic is not used.

`account.balance` may be negative. Transfer `amount` must be greater than zero. Credit and maximum limits must be non-negative. A blank `account.maximumBalance` means unlimited. Every scaled amount must fit a signed 64-bit integer. `currency.decimals` and `currency.scale` are integers with `0 <= currency.decimals <= currency.scale`, `currency.decimals <= 8` and `currency.scale <= 12`. `currency.rateNumerator` and `currency.rateDenominator` are positive base-10 integers no greater than 2,147,483,647.

## CSV headers and values

### `community.csv`

```text
code,name,description,access,adminUsers,currency.adminUser,currency.name,currency.namePlural,currency.symbol,currency.decimals,currency.scale,currency.rateNumerator,currency.rateDenominator,createdAt,updatedAt,currency.createdAt,currency.updatedAt,imageUrl,address.streetAddress,address.locality,address.postalCode,address.region,address.country,location.name,location.type,location.longitude,location.latitude,contact.phone,contact.email,contact.telegram,contact.whatsapp,contact.website,settings.requireAcceptTerms,settings.terms,settings.minOffers,settings.minWants,settings.allowAnonymousMemberList,settings.enableGroupEmail,settings.defaultGroupEmailFrequency,currency.settings.defaultInitialCreditLimit,currency.settings.externalTraderCreditLimit,currency.settings.defaultInitialMaximumBalance,currency.settings.defaultOnPaymentCreditLimit,currency.settings.externalTraderMaximumBalance,currency.settings.defaultAcceptPaymentsAfter,currency.settings.defaultAcceptPaymentsWhitelist,currency.settings.defaultAllowPayments,currency.settings.defaultAllowPaymentRequests,currency.settings.defaultAcceptPaymentsAutomatically,currency.settings.defaultAllowSimplePayments,currency.settings.defaultAllowSimplePaymentRequests,currency.settings.defaultAllowQrPayments,currency.settings.defaultAllowQrPaymentRequests,currency.settings.defaultAllowMultiplePayments,currency.settings.defaultAllowMultiplePaymentRequests,currency.settings.defaultAllowTagPayments,currency.settings.defaultAllowTagPaymentRequests,currency.settings.defaultAllowExternalPayments,currency.settings.defaultAllowExternalPaymentRequests,currency.settings.defaultAcceptExternalPaymentsAutomatically,currency.settings.enableExternalPayments,currency.settings.enableExternalPaymentRequests,currency.settings.enableCreditCommonsPayments,currency.settings.defaultHideBalance
```

- `code` is the stable key and new destination code for both the Social group and Accounting currency: exactly four uppercase ASCII letters or digits. `name` and both currency names are required and at most 255 characters; `currency.symbol` is required and 1–3 characters.
- `description` may be empty. `access` is `public`, `group` or `private`. `createdAt` and `updatedAt` belong to the Social community; the corresponding `currency.*` timestamps belong to its Accounting currency. All columns after `currency.updatedAt` are optional and use the denormalized shapes below.
- `adminUsers` is required and non-empty. Each listed email grants that user the Social community administrator role and must also administer a non-deleted member in `members.csv`. `currency.adminUser` must be one email from that list and owns the Accounting currency.
- `currency.settings.defaultAcceptPaymentsWhitelist` is a semicolon-delimited list of member/account codes. It maps to the Accounting currency default payment-acceptance whitelist; blank means an empty list.
- A successful execution creates the community as pending and invisible, then activates it only after every import phase succeeds; there is no source status field.

### `users.csv`

```text
email,name,createdAt,updatedAt,settings.language,settings.notifications.myAccount,settings.notifications.group,settings.emails.myAccount,settings.emails.group
```

`email`, `createdAt` and `updatedAt` are required; `name` and all settings columns are optional. `name` is at most 255 characters. Existing Auth users are reused by normalized email and are not overwritten. New users have no usable password until activation.

### `members.csv`

```text
code,name,type,status,access,description,adminUsers,account.balance,account.creditLimit,createdAt,updatedAt,account.createdAt,account.updatedAt,account.maximumBalance,imageUrl,address.streetAddress,address.locality,address.postalCode,address.region,address.country,location.name,location.type,location.longitude,location.latitude,contact.phone,contact.email,contact.telegram,contact.whatsapp,contact.website,account.settings.onPaymentCreditLimit,account.settings.acceptPaymentsAfter,account.settings.acceptPaymentsWhitelist,account.settings.allowPayments,account.settings.allowPaymentRequests,account.settings.allowSimplePayments,account.settings.allowSimplePaymentRequests,account.settings.allowQrPayments,account.settings.allowQrPaymentRequests,account.settings.allowMultiplePayments,account.settings.allowMultiplePaymentRequests,account.settings.allowTagPayments,account.settings.allowTagPaymentRequests,account.settings.acceptPaymentsAutomatically,account.settings.allowExternalPayments,account.settings.allowExternalPaymentRequests,account.settings.acceptExternalPaymentsAutomatically,account.settings.hideBalance
```

- `code` is the stable key shared by the Social member and its Accounting account. It must be unique and match the community code followed by four digits, for example `EXMP0001`.
- `type` is `personal`, `business` or `organization`; `status` is `draft`, `pending`, `active`, `disabled`, `suspended` or `deleted`; `access` is `public`, `group` or `private`.
- `adminUsers` grants each listed user the Social member `admin` role and ownership of its Accounting account. It must be non-empty for every non-deleted member and may be blank for a deleted member.
- An Accounting account with the same `code` and status is created for every `active`, `disabled`, `suspended` or `deleted` member. `account.balance`, `account.creditLimit`, `account.createdAt` and `account.updatedAt` are required for those rows. `account.maximumBalance` and all `account.settings.*` columns are optional. All account-only fields must be blank for `draft` and `pending` members, which do not have an Accounting account.
- `account.settings.acceptPaymentsWhitelist` is a semicolon-delimited list of member/account codes. It maps to the Accounting account payment-acceptance whitelist; blank means an empty list.
- A declared balance cannot be below `-account.creditLimit` or above a non-blank `account.maximumBalance`. Deleted members must have a zero `account.balance`.
- `name` is required and at most 255 characters. `description` may be empty. All columns after `account.updatedAt` are optional. `createdAt` and `updatedAt` belong to the Social member; the corresponding `account.*` timestamps belong to its Accounting account.

### `transfers.csv`

```text
sourceKey,payerAccountCode,payeeAccountCode,initiatorUser,amount,description,createdAt,updatedAt
```

Every row is imported as a committed historical transfer with no Stellar hash. Payer and payee must be distinct accounts in this bundle, and the initiator must be present in `users.csv`. Current account or community administration is not used to re-authorize historical transfers. `description` may be empty. External accounts, opening-balance adjustments and partial histories are not supported.

### `categories.csv`

```text
code,name,description,access,createdAt,updatedAt,icon.type,icon.value
```

`code` is the stable category key. It and `name` are required and at most 255 characters; category codes are unique. `description` is optional and at most 1,000 characters. `access` uses the common access enum. `icon.type` and `icon.value` are optional, but must either both be blank or both be non-empty.

### `posts.csv`

```text
code,type,memberCode,categoryCode,title,description,status,access,value,fulfilledAt,expiresAt,createdAt,updatedAt,location.name,location.type,location.longitude,location.latitude,imageUrls
```

- `code` is the stable post key; it is required, unique and at most 255 characters. `type` is `offer` or `want` (`want` maps to the Social `needs` resource). The owning `memberCode` is required; `categoryCode` is optional. Together with the post type and zero-based list position, this code determines each derived post-image source key.
- `status` is `draft`, `published` or `hidden`; `access` uses the common access enum. A published post must belong to an active member.
- Both types require a non-empty `description` of at most 16,384 characters. Offers also require `title`; `title` and the optional `value` are at most 255 characters, `value` is descriptive text rather than a validated monetary amount, and `fulfilledAt` must be blank. Wants may omit `title`, must leave `value` blank and may set `fulfilledAt`.
- `fulfilledAt` and `expiresAt` cannot precede `createdAt`. `expiresAt` and all columns after `updatedAt` are optional. `imageUrls` preserves source order.

## Denormalized optional columns

Every structured property has a predefined scalar column using its camelCase JSON path. Blank means not provided unless a field group states otherwise.

- Address fields are `address.streetAddress`, `address.locality`, `address.postalCode`, `address.region` and `address.country`. If an address is present, at least one must be non-empty.
- Location fields are `location.name`, `location.type`, `location.longitude` and `location.latitude`. If a location is present, type must be `Point`, longitude and latitude are required, longitude is from -180 to 180, and latitude is from -90 to 90.
- Contact fields are `contact.phone`, `contact.email`, `contact.telegram`, `contact.whatsapp` and `contact.website`. Each non-empty value represents one contact of the column type.
- Identity settings use `settings.language`, boolean `settings.notifications.myAccount` and `settings.notifications.group`, boolean `settings.emails.myAccount`, and `settings.emails.group` set to `never`, `weekly` or `monthly`.
- Community settings use boolean `settings.requireAcceptTerms`, string `settings.terms`, non-negative integers `settings.minOffers` and `settings.minWants`, booleans `settings.allowAnonymousMemberList` and `settings.enableGroupEmail`, and `settings.defaultGroupEmailFrequency` set to `never`, `weekly` or `monthly`. `settings.minWants` maps to Social's internal `minNeeds` setting.
- Currency amount settings are `currency.settings.defaultInitialCreditLimit` and `currency.settings.externalTraderCreditLimit`. `currency.settings.defaultInitialMaximumBalance`, `currency.settings.defaultOnPaymentCreditLimit` and `currency.settings.externalTraderMaximumBalance` accept an amount or `false`. `currency.settings.defaultAcceptPaymentsAfter` accepts non-negative integer seconds or `false`. `currency.settings.defaultAcceptPaymentsWhitelist` is the semicolon-delimited account-code relationship.
- Currency boolean settings are all remaining `currency.settings.*` columns: `defaultAllowPayments`, `defaultAllowPaymentRequests`, `defaultAcceptPaymentsAutomatically`, `defaultAllowSimplePayments`, `defaultAllowSimplePaymentRequests`, `defaultAllowQrPayments`, `defaultAllowQrPaymentRequests`, `defaultAllowMultiplePayments`, `defaultAllowMultiplePaymentRequests`, `defaultAllowTagPayments`, `defaultAllowTagPaymentRequests`, `defaultAllowExternalPayments`, `defaultAllowExternalPaymentRequests`, `defaultAcceptExternalPaymentsAutomatically`, `enableExternalPayments`, `enableExternalPaymentRequests`, `enableCreditCommonsPayments` and `defaultHideBalance`.
- Member account settings use `account.settings.onPaymentCreditLimit`, which accepts an amount or `false`; `account.settings.acceptPaymentsAfter`, which accepts non-negative integer seconds or `false`; and the semicolon-delimited `account.settings.acceptPaymentsWhitelist` relationship. All remaining `account.settings.*` columns are booleans matching their names. Omitted properties inherit currency defaults. NFC tag secrets are not imported.
- Category icon fields are `icon.type` and `icon.value`; both strings must be non-empty when an icon is present.
- Post `imageUrls` is the semicolon-delimited ordered URL list described in the common rules. Retaining order is required for stable derived image keys and retries.

## Complete-history invariants

For every member with an Accounting account, the importer starts at zero and adds each committed incoming amount and subtracts each committed outgoing amount. That exact result must equal the declared `account.balance`, and the sum of all declared account balances must be zero. A bundle that needs an opening balance, omits historical transfers, contains external transfers or otherwise fails these checks is invalid.

In the example, Alice pays Bob `5.00`, producing balances of `-5.00` and `5.00`. The account totals are zero.
