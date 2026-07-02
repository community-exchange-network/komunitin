# CES Flavor — Terminology Guidelines

These guidelines apply when writing or modifying language strings for the CES flavor.

## Philosophy

CES records social activity, not financial transactions. Key principle: *"This is just people doing favors and keeping records."*

- Numbers represent social relationships and community standing, not money
- Avoid all monetary language: payment, balance, transfer, buyer, seller
- Currency flow is **inverse** to the real-world exchange (see below)

## Terminology

| Komunitin default | CES flavor |
|---|---|
| Transfer | **Trade** |
| Send | **I Received** |
| Receive | **I Provided** |
| Balance | **Community Standing** |
| Currency | **Unit System** |
| Credit Limit | **Maximum Commitment** |
| Maximum Balance | **Maximum Accumulation** |
| Member | **User** |
| Move (admin action) | **Record** |
| Committed (trade state) | **Recorded** |

## The inverse flow

Currency movement is the inverse of the real-world exchange:

- **I Received** (was "Send"): the user *received* a service → their standing goes **down**
- **I Provided** (was "Receive"): the user *provided* a service → their standing goes **up**

When writing UI copy or notification text, always frame from the perspective of what actually happened in the real world, not the direction of currency movement.

## Note for translators

The CES flavor uses deliberately different terminology from the Komunitin default. When translating CES flavor strings, do **not** use the same words as the default Komunitin translation for your language — the differences are intentional.

Pay particular attention to:
- **Trade** — do not translate as the word used for "transfer" in the default
- **Community Standing** — do not translate as the word used for "balance"
- **I Received / I Provided** — these replace "Send / Receive" and reflect the real-world action, not the currency movement. The translation must preserve this perspective.
- **User** — do not translate as the word used for "member"
