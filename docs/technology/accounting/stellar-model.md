# Stellar model

## The Stellar network

Komunitin uses the [Stellar network ](https://stellar.org)as their backend ledger. Stellar is a consolidated global blockchain providing a unique set of features that make it the best decentralized technology to implement the required model. Within the key features in Stellar there are the quick finalization time for transactions (\~5 sec), the cheap price of each transaction (fractions of cents), and the built-in implementation of custom assets, trustlines and path payments (required for external payments). Beyond that, Stellar support smart contracts allowing for future Decentralized Finance integrations.

This blockchain is ruled by the US-based non-proft The Stellar Foundation, aiming for financial inclusion.

## The model

See the [currency model](../../features/accounting/currency-model-overview.md) page for an overview of the currency scheme we're modeling.

Every account and every transaction is recorded in the stellar network. And every community currency is a different Stellar asset. So Komunitin transactions are faithfully represented in the Stellar blockchain.

### Local transfers

* Each community has an issuer account and its own local asset in Stellar.
* The asset is freezable and trustlines authorizable.
* Each community has an administrator account in Stellar.
* Each user maps to an account in Stellar. The user account has two signers, the user's key and the administrator's key. The user key is enough for transfers, but the administrator is required for higher threshold operations.
* Each user account has a trustline with the local asset. The value of this trustline is the positive maximum defined for this currency or particular account, if any.
* The available credit for each user account (negative maximum) is modeled by "initial" transfer(s) from the issuer account. The service will subtract these initial transfers from the Stellar user balance to get the (eventually negative) user balance shown in the Komunitin app.

### External transfers

* Each community has an *external issuer* account. and an *external trader* account in Stellar. 
* The external issuer issues the HOUR asset, so each community issues their own HOUR asset.
* The external trader proxy all external transfers.
* External trader has a trustline and balance with the local currency asset as well as with the HOUR asset.
* External trader may have trustlines and balances with other external assets.
* External trader from other communities can define trustlines to this HOUR asset.
* External accounts define passive sell offers exchanging their issued HOURs by their local currency, in the two directions, following the conversion rate defined by the community.
* External accounts define 1:1 passive sell offers selling their issued HOURs by the trusted HOURs.
* External accounts define 1:1 (active) sell offers selling external HOURs in their balance by their own HOURs. These clear the balance of trade.
* Trustlines to external communities may be disabled. In this case the existing balance of external HOUR, if any, is moved to the external issuer account just in case we want to enable it again in the future.
* External trader has a credit limit and maximum balance on the local currency asset, defined by the community settings.

<figure><img src="https://lh7-rt.googleusercontent.com/docsz/AD_4nXfk6Q_RYUghJkMVusudYpv9Qg-cpDPYtrW6NQm77gtK-jeT9qQMMVJD3c-vyuupUhn-rO5E6fBL8XbpLiPz_L4q1t0r_QWcgPL-wfpCguoyNParVEX78VU4WWnZE_uYGjna71S766Jq9PWZZvGqsHbG4vND?key=bHIg-rgBbd-jpdUzkKPJrw" alt=""><figcaption></figcaption></figure>
