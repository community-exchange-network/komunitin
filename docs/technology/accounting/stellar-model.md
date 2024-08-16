# Stellar model

## The Stellar network

Komunitin uses the [Stellar network ](https://stellar.org)as their backend ledger. Stellar is a consolidated global blockchain providing a unique set of features that make it the best decentralized technology to implement the required model. Within the key features in Stellar there are the quick finalization time for transactions (\~5 sec), the cheap price of each transaction (fractions of cents), and the built-in implementation of custom assets, trustlines and path payments (required for external payments). Beyond that, Stellar support smart contracts allowing for future Decentralized Finance integrations.

This blockchain is ruled by the US-based non-proft The Stellar Foundation, aiming for financial inclusion.

## The model

See the [monetary model](../../overview/monetary-model.md) page for an overview of the monetary scheme we're modeling.

Every account and every transaction is recorded in the stellar network. And every community currency is a different Stellar asset. So Komunitin transactions are faithfully represented in the Stellar blockchain.

### Local payments

* Each community has an issuer account and its own local asset in Stellar.
* The asset is freezable and trustlines authorizable.
* Each community has an administrator account in Stellar.
* Each user maps to an account in Stellar. The user account has two signers, the user’s key and the administrator’s key. The user key is enough for payments, but the administrator is required for higher threshold operations.
* Each user account has a trustline with the local asset. The value of this trustline is the positive maximum defined for this currency or particular account, if any.
* The available credit for each user account (negative maximum) is modeled by “initial” payment(s) from the issuer account. The service will subtract these initial payments to the Stellar user balance to get the (eventually negative) user balance shown in the Komunitin app.

### External payments

* Each community has an external account.
* The external account has a trustline and a balance of the local asset.
* The external account is an issuer of the HOUR asset (each community issues their own HOUR asset).
* External accounts from other groups can define trustlines to this HOUR asset. And this external account can define trustlines to other external account’s HOUR assets.&#x20;
* External accounts define passive sell offers exchanging their issued HOURs by their local currency, in the two directions.
* External accounts define 1:1 passive sell offers selling their issued HOURs by the other trusted HOURs.
* External accounts define 1:1 (active) sell offers selling external HOURs by their own HOURs. These clear the balance of trade.





<figure><img src="https://lh7-rt.googleusercontent.com/docsz/AD_4nXfk6Q_RYUghJkMVusudYpv9Qg-cpDPYtrW6NQm77gtK-jeT9qQMMVJD3c-vyuupUhn-rO5E6fBL8XbpLiPz_L4q1t0r_QWcgPL-wfpCguoyNParVEX78VU4WWnZE_uYGjna71S766Jq9PWZZvGqsHbG4vND?key=bHIg-rgBbd-jpdUzkKPJrw" alt=""><figcaption></figcaption></figure>
