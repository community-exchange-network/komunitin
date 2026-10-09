# Bramblewick demo

Bramblewick (`BRAM`) is a fictional rural village with 30 members, 30 offers,
30 wants, 9 categories and 90 historical transfers. Its community currency is
the Bramble; one hour is usually 20 Brambles.

The demo content is AI-generated. Members, stories and addresses are fictional.
Stock photographs illustrate the community and its activities; the names and
stories do not identify the people photographed.

See the [main README](../../README.md#demo-1) for instructions to start the demo
with `./start.sh --up --dev --demo`.

## Demo keys

The checked-in CSVs contain no Stellar keys. `admin bundle demo` generates them from `DEMO_RANDOM_SEED` in `.env`, falling back to `KOMUNITIN_DOMAIN`
when the seed is unset or empty. The same seed reproduces the same currency and
account keys, including after reordering CSV rows or columns.

Use a distinct `DEMO_RANDOM_SEED` for installations sharing a domain, such as
multiple local environments using `localhost`. Keep it unchanged to reuse the
same Stellar accounts across demo resets. These predictable keys are only for
demo balances on testnet.

## Users

All demo users have password `komunitin`:

| Role | Email |
| --- | --- |
| Community administrator | `mabel@bramblewick.example` |
| Regular member (baker) | `tom@bramblewick.example` |
| Regular member (mechanic) | `aisha@bramblewick.example` |
| Village hall volunteer | `bramblewick@bramblewick.example` |

All addresses use the reserved `.example` domain. Other logins are listed in
[users.csv](bundle/users.csv). The superadmin is configured separately by
`ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Photo credits

See [photo credits](PHOTOS.md) for every photographer and original image.
