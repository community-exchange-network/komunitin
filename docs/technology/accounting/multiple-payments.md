# Multiple transfers

The user interface provides a page suitable to enter a batch of transfers (either sending or receiving requests) and send them all at once. While this may seem just a repetition of the single transfer case, it is a bit problematic in the case of a distributed ledger such as Stellar because it imposes a series of limits:

* The total transfer throughput of Stellar is in the orders of 1000 operations / ledger, and a new ledger closes every 5 sec.
* The Stellar transfer fee increases if the network gets flooded with transactions
* One account can only submit one transaction per ledger
* The stellar service endpoints impose further rate limits (\~100 calls every 6 seconds).

In order to accommodate these limits, the server will use up to 10 [channel accounts](https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/channel-accounts) so that a single account is doing up to 11 transfers / 5 sec. And the server further limits the rate of calls to stellar so it does not break the 100 requests/ 6 sec limit.
