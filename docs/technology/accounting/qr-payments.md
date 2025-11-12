# QR transfers

The concept behind QR transfers is fairly simple, as this method is just a convenient user experience for sources to have all the required information to create the transfer. Indeed, QR transfers don't use any different API call than regular simple transfers and all the logic is implemented in the frontend.

#### Transfer links

The QR codes encode transfer links. A transfer link is:

```
https://komunitin.org/pay?t=<account_url>&m=<description>&a=<amount>
```

With the amount being expressed in the account's currency. Since the full account url is used, this method works fine for external transfers and it is in fact the preferred method since account discovery is a challenge otherwise.

Note that you can scan the QR code with any other app and, provided it correctly redirects you to the Komunitin app, the transfer flow will continue.

Note also that transfer links may have further applications beyond QR codes.

#### Workflow

The destination is the initiator of the workflow by creating a transfer link encoded as a QR code with their own account, the description and the amount. Then the source scans the code as a quick way to have the transfer details, fills the source field with their own account and effectively submits the transfer.
