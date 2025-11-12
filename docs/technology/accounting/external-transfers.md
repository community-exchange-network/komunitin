# External transfers

External transfers are transfers where the two accounts belong to different currencies. We've already outlined the scheme in the [currency model ](../../overview/currency-model.md#external-transfers)page and the set of elements [in the Stellar network](stellar-model.md#external-transfers).

Provided there is a trustline path between the source and destination currencies, the service needs to know the remote account public key in order to make the path transfer. Remember that the remote account can belong to a currency in the same or a different server.

## API

External transfers make use of a JSON:API extension for external resources. Concretely, an external `payee` relationship  looks like:

```
"payee": { 
  "data" : { 
    "type": "accounts", 
    "id": "123"
    "meta": {
      "external": true
      "href": "https://komunitin.org/TEST/accounts/123"
    }
  }
}
```

The server can get the external resource following the href property. The public key is part of the resource body.

## Account discovery

Depending on the user interface method used to initiate the transfer, the account discovery model may vary.&#x20;

* The most straightforward is the QR code method. Indeed, the QR already contains the full account URL, and this is directly used to get the public key.
* If using the account select field (either in the single or multiple page) the user will need to select first the remote community. Currently only the communities in the same server are available for selection.
  * If the remote community has enabled the possibility for anonymous users to list the community members, the source will see the full list of all remote members with names, avatar pictures and account numbers
  * Otherwise, the source can enter the account number AAAAXXXX and the remote account will be obtained from that. In this case the source doesn't see the name of the destination account.
* NFC tag transfers don't support external transfers currently.

## Information sharing

At this point we're capable of doing the Stellar transfer, but we want more than that: we want to share the transfer description and other offchain bits of information from the source server to the destination server.

In order to do so, the source server directly sends all these additional data to the destination server. The source identifies themselves using the source account private key so the external server can verify that the transfer information indeed comes from the transfer source.

This authentication method will be used for remote external transfer requests as well.

### Transfer requests

When it is the destination account who wants to initiate the external transfer, the destination server sends the transfer request to the source server. Then, if the source account allows receiving external transfer requests the transfer will be recorded in the source server and a notification will be sent to the source. After approval, the transfer will be submitted by the source server and will follow the same workflow as an external source.

Note that the requests between servers are authenticated using tokens signed with the respective account private keys.

