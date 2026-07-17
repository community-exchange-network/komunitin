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

- CSV is UTF-8 without a byte-order mark, comma-delimited and RFC 4180 quoted. Headers must match the documented headers and example files exactly. Unless a column is explicitly optional or allowed to be empty below, every cell is required. Blank optional cells mean “not provided”; the literal strings `null` and `undefined` have no special meaning.
- `code` is the stable key for groups, currencies, members, accounts, categories and posts. The single Social group and Accounting currency share the `community.csv` code, while each Social member and its Accounting account share the `members.csv` code. Relationships use the corresponding `*_code` field; generated destination UUIDs never appear in the bundle.
- Email is the stable user key. Every user relationship must match a `users.csv` email after `trim().toLowerCase()` normalization, and emails must be unique after normalization. Passwords are never included.
- Multi-value relationship cells contain keys separated by semicolons, with no whitespace around the separator. Email keys are normalized as above; resource codes retain their documented form. A blank cell means no relationships, while empty or duplicate list items are invalid.
- `transfer_key` is an opaque, bundle-local source key matching `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. It is stable across retries and unique within `transfers.csv`.
- Timestamps are UTC ISO 8601 values in the form `YYYY-MM-DDTHH:mm:ssZ` or `YYYY-MM-DDTHH:mm:ss.sssZ`. Offsets other than `Z` are invalid. No update timestamp may precede its corresponding creation timestamp.
- Contacts use one predefined column per supported contact type. A resource may therefore have at most one contact of each type.
- `image_urls` is an ordered semicolon-delimited list of unique image URLs. Semicolons are invalid inside URLs in that column.
- Image URLs are absolute `http` or `https` URLs of at most 2,048 characters with a hostname and no embedded credentials. Downloads are best-effort. Alt text, checksums and licence metadata are not part of the format.
- Enum and boolean values are case-sensitive. Booleans in ordinary CSV cells are `true` or `false`.
- The destination `community.csv` code must not already exist. It is checked again immediately before execution; imports never overwrite or merge communities.

### Exact amounts

All monetary cells and monetary settings are decimal strings in currency units, such as `25`, `25.00` or `0.125`, except settings explicitly documented to also accept `false`. Decimal values must match `-?(0|[1-9][0-9]*)(\.[0-9]+)?`, have no exponent, grouping separator or leading `+`, and have at most `currency_scale` fractional digits. Values are converted exactly to scaled integers; floating-point arithmetic is not used.

`account_balance` may be negative. Transfer `amount` must be greater than zero. Credit and maximum limits must be non-negative. A blank `account_maximum_balance` means unlimited. Every scaled amount must fit a signed 64-bit integer. `currency_decimals` and `currency_scale` are integers with `0 <= currency_decimals <= currency_scale`, `currency_decimals <= 8` and `currency_scale <= 12`. `currency_rate_numerator` and `currency_rate_denominator` are positive base-10 integers no greater than 2,147,483,647.

## CSV headers and values

### `community.csv`

```text
code,name,description,access,admin_users,currency_admin_user,currency_name,currency_name_plural,currency_symbol,currency_decimals,currency_scale,currency_rate_numerator,currency_rate_denominator,created_at,updated_at,currency_created_at,currency_updated_at,image_url,address_street_address,address_locality,address_postal_code,address_region,address_country,location_name,location_type,location_longitude,location_latitude,contact_phone,contact_email,contact_telegram,contact_whatsapp,contact_website,settings_require_accept_terms,settings_terms,settings_min_offers,settings_min_wants,settings_allow_anonymous_member_list,settings_enable_group_email,settings_default_group_email_frequency,currency_settings_default_initial_credit_limit,currency_settings_external_trader_credit_limit,currency_settings_default_initial_maximum_balance,currency_settings_default_on_payment_credit_limit,currency_settings_external_trader_maximum_balance,currency_settings_default_accept_payments_after,currency_settings_default_accept_payments_whitelist,currency_settings_default_allow_payments,currency_settings_default_allow_payment_requests,currency_settings_default_accept_payments_automatically,currency_settings_default_allow_simple_payments,currency_settings_default_allow_simple_payment_requests,currency_settings_default_allow_qr_payments,currency_settings_default_allow_qr_payment_requests,currency_settings_default_allow_multiple_payments,currency_settings_default_allow_multiple_payment_requests,currency_settings_default_allow_tag_payments,currency_settings_default_allow_tag_payment_requests,currency_settings_default_allow_external_payments,currency_settings_default_allow_external_payment_requests,currency_settings_default_accept_external_payments_automatically,currency_settings_enable_external_payments,currency_settings_enable_external_payment_requests,currency_settings_enable_credit_commons_payments,currency_settings_default_hide_balance
```

- `code` is the stable key and new destination code for both the Social group and Accounting currency: exactly four uppercase ASCII letters or digits. `name` and both currency names are required and at most 255 characters; `currency_symbol` is required and 1–3 characters.
- `description` may be empty. `access` is `public`, `group` or `private`. `created_at` and `updated_at` belong to the Social community; the corresponding `currency_*` timestamps belong to its Accounting currency. All columns after `currency_updated_at` are optional and use the denormalized shapes below.
- `admin_users` is required and non-empty. Each listed email grants that user the Social community administrator role. `currency_admin_user` is one email from that list and owns the Accounting currency.
- `currency_settings_default_accept_payments_whitelist` is a semicolon-delimited list of member/account codes. It maps to the Accounting currency default payment-acceptance whitelist; blank means an empty list.
- A successful execution creates the community as pending and invisible, then activates it only after every import phase succeeds; there is no source status field.

### `users.csv`

```text
email,name,created_at,updated_at,settings_language,settings_notifications_my_account,settings_notifications_group,settings_emails_my_account,settings_emails_group
```

`email`, `created_at` and `updated_at` are required; `name` and all settings columns are optional. `name` is at most 255 characters. Existing Auth users are reused by normalized email and are not overwritten. New users have no usable password until activation.

### `members.csv`

```text
code,name,type,status,access,description,admin_users,account_balance,account_credit_limit,created_at,updated_at,account_created_at,account_updated_at,account_maximum_balance,image_url,address_street_address,address_locality,address_postal_code,address_region,address_country,location_name,location_type,location_longitude,location_latitude,contact_phone,contact_email,contact_telegram,contact_whatsapp,contact_website,account_settings_on_payment_credit_limit,account_settings_accept_payments_after,account_settings_accept_payments_whitelist,account_settings_allow_payments,account_settings_allow_payment_requests,account_settings_allow_simple_payments,account_settings_allow_simple_payment_requests,account_settings_allow_qr_payments,account_settings_allow_qr_payment_requests,account_settings_allow_multiple_payments,account_settings_allow_multiple_payment_requests,account_settings_allow_tag_payments,account_settings_allow_tag_payment_requests,account_settings_accept_payments_automatically,account_settings_allow_external_payments,account_settings_allow_external_payment_requests,account_settings_accept_external_payments_automatically,account_settings_hide_balance
```

- `code` is the stable key shared by the Social member and its Accounting account. It must be unique and match the community code followed by four digits, for example `EXMP0001`.
- `type` is `personal`, `business` or `organization`; `status` is `draft`, `pending`, `active`, `disabled`, `suspended` or `deleted`; `access` is `public`, `group` or `private`.
- `admin_users` grants each listed user the Social member `admin` role and ownership of its Accounting account. It must be non-empty for every non-deleted member and may be blank for a deleted member.
- An Accounting account with the same `code` and status is created for every `active`, `disabled`, `suspended` or `deleted` member. `account_balance`, `account_credit_limit`, `account_created_at` and `account_updated_at` are required for those rows. `account_maximum_balance` and all `account_settings_*` columns are optional. All account-only fields must be blank for `draft` and `pending` members, which do not have an Accounting account.
- `account_settings_accept_payments_whitelist` is a semicolon-delimited list of member/account codes. It maps to the Accounting account payment-acceptance whitelist; blank means an empty list.
- A declared balance cannot be below `-account_credit_limit` or above a non-blank `account_maximum_balance`. Deleted members must have a zero `account_balance`.
- `name` is required and at most 255 characters. `description` may be empty. All columns after `account_updated_at` are optional. `created_at` and `updated_at` belong to the Social member; the corresponding `account_*` timestamps belong to its Accounting account.

### `transfers.csv`

```text
transfer_key,payer_account_code,payee_account_code,initiator_user,amount,description,created_at,updated_at
```

Every row is imported as a committed historical transfer with no Stellar hash. Payer and payee must be distinct accounts in this bundle. The initiator must own either account or be a community administrator. `description` may be empty. External accounts, opening-balance adjustments and partial histories are not supported.

### `categories.csv`

```text
code,name,description,access,created_at,updated_at,icon_type,icon_value
```

`code` is the stable category key. It and `name` are required and at most 255 characters; category codes are unique. `description` is optional and at most 1,000 characters. `access` uses the common access enum. `icon_type` and `icon_value` are optional, but must either both be blank or both be non-empty.

### `posts.csv`

```text
code,type,member_code,category_code,title,description,status,access,value,fulfilled_at,expires_at,created_at,updated_at,location_name,location_type,location_longitude,location_latitude,image_urls
```

- `code` is the stable post key; it is required, unique and at most 255 characters. `type` is `offer` or `want` (`want` maps to the Social `needs` resource). The owning `member_code` is required; `category_code` is optional.
- `status` is `draft`, `published` or `hidden`; `access` uses the common access enum. A published post must belong to an active member.
- Both types require a non-empty `description` of at most 16,384 characters. Offers also require `title`; `title` and the optional `value` are at most 255 characters, `value` is descriptive text rather than a validated monetary amount, and `fulfilled_at` must be blank. Wants may omit `title`, must leave `value` blank and may set `fulfilled_at`.
- `fulfilled_at` and `expires_at` cannot precede `created_at`. `expires_at` and all columns after `updated_at` are optional. `image_urls` preserves source order.

## Denormalized optional columns

Every former structured property has a predefined scalar column. Blank means not provided unless a field group states otherwise.

- Address fields are `address_street_address`, `address_locality`, `address_postal_code`, `address_region` and `address_country`. If an address is present, at least one must be non-empty.
- Location fields are `location_name`, `location_type`, `location_longitude` and `location_latitude`. If a location is present, type must be `Point`, longitude and latitude are required, longitude is from -180 to 180, and latitude is from -90 to 90.
- Contact fields are `contact_phone`, `contact_email`, `contact_telegram`, `contact_whatsapp` and `contact_website`. Each non-empty value represents one contact of the column type.
- Identity settings use `settings_language`, boolean `settings_notifications_my_account` and `settings_notifications_group`, boolean `settings_emails_my_account`, and `settings_emails_group` set to `never`, `weekly` or `monthly`.
- Community settings use boolean `settings_require_accept_terms`, string `settings_terms`, non-negative integers `settings_min_offers` and `settings_min_wants`, booleans `settings_allow_anonymous_member_list` and `settings_enable_group_email`, and `settings_default_group_email_frequency` set to `never`, `weekly` or `monthly`. `settings_min_wants` maps to Social's internal `minNeeds` setting.
- Currency amount settings are `currency_settings_default_initial_credit_limit` and `currency_settings_external_trader_credit_limit`. `currency_settings_default_initial_maximum_balance`, `currency_settings_default_on_payment_credit_limit` and `currency_settings_external_trader_maximum_balance` accept an amount or `false`. `currency_settings_default_accept_payments_after` accepts non-negative integer seconds or `false`. `currency_settings_default_accept_payments_whitelist` is the semicolon-delimited account-code relationship.
- Currency boolean settings are all remaining `currency_settings_*` columns: `default_allow_payments`, `default_allow_payment_requests`, `default_accept_payments_automatically`, `default_allow_simple_payments`, `default_allow_simple_payment_requests`, `default_allow_qr_payments`, `default_allow_qr_payment_requests`, `default_allow_multiple_payments`, `default_allow_multiple_payment_requests`, `default_allow_tag_payments`, `default_allow_tag_payment_requests`, `default_allow_external_payments`, `default_allow_external_payment_requests`, `default_accept_external_payments_automatically`, `enable_external_payments`, `enable_external_payment_requests`, `enable_credit_commons_payments` and `default_hide_balance`.
- Member account settings use `account_settings_on_payment_credit_limit`, which accepts an amount or `false`; `account_settings_accept_payments_after`, which accepts non-negative integer seconds or `false`; and the semicolon-delimited `account_settings_accept_payments_whitelist` relationship. All remaining `account_settings_*` columns are booleans matching their names. Omitted properties inherit currency defaults. NFC tag secrets are not imported.
- Category icon fields are `icon_type` and `icon_value`; both strings must be non-empty when an icon is present.
- Post `image_urls` is the semicolon-delimited ordered URL list described in the common rules.

## Complete-history invariants

For every member with an Accounting account, the importer starts at zero and adds each committed incoming amount and subtracts each committed outgoing amount. That exact result must equal the declared `account_balance`, and the sum of all declared account balances must be zero. A bundle that needs an opening balance, omits historical transfers, contains external transfers or otherwise fails these checks is invalid.

In the example, Alice pays Bob `5.00`, producing balances of `-5.00` and `5.00`. The account totals are zero.
