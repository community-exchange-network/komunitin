# External transfers

External transfers are payments where the payer and the destination accounts belong to different communities and hence use different currencies. Using external transfers, the system exchanges local currencies to the end-users can seamlessly pay with their own local currency. Komunitin uses a powerful system to enable reliable transfers between currencies without the need of any global coordination or intermediary global currency. With this feature, local community currencies sale up to a locally-governed global payments system.

#### The local currency rate

The administration of each local currency in Komunitin needs to manually set the exchange rate of their own currency against a global value that we'll call HOUR. The name of this global HOUR unit is meant to be an hour of labour, but once the first local currency set their exchange rate, the next ones are effectively definig the rate of their currency against the previous ones.

This rate is fixed but can be adjustable anytime by the currency administration if required.

#### Trustlines

The currency administration may establish trustlines with any other currency that they know is indeed trustworthy. A trustline has a limit value L and it means, for the currency that defines it, "we are willing to accept a value up to L of your currency".

Once currency A trusts currency B, this means that users in B can pay users in A. Trustlines are directional, so if A trusts B, that does not immediately allow users in A to pay users in B (because B does not trust A). However, once some users in B payed to users in A, then A has a positive balance of trade with B, and that allows users in A to pay to users in B until this balance gets to zero.

#### Path payments

Trustlines form a network of trust among currencies allowing you to reach other users beyond the communities that directly trust your currency or have a negative balance against your currency. Indeed, if currency A trusts currency B and currency B trusts currency C, then a user in C can make a payment to any user in A. The system will take the payer amount in C and will exchange it for units of B. Then will take the amount in B and will exchange it for units in A that will be received by the payee. This process is completely automatic and transparent to the user.&#x20;

These path payments are currently restricted to have a maximum length of 4. Note that a balance of trade between two currencies may be affected by the behavior of users not belonging to any the two because of path payements. Anyway, the trade balance berween two currencies will never exceed the limit established by the trustline.

If the balance of trade between two currencies reach the limit established by the trustline, then the trade between these two currencies is stopped in that direction. Thus, each currency administrator is supposed to take action when such limit is getting close or reached. The action may be coordinating some trades with the neighbor currency or even adjusting their currency rate.

#### Configuration options

There are several configuration options related to external transfers apart from trustlines:

* **Enable external transfers**. This needs to be on to enable external transfers at all.
* **Allow external payments**. With this option, your currency users can pay to users from other currencies and conversely, users from other currencies can pay to your members.
* **Allow external payment requests.** This is similar to the previous one, but allowing your users to request payments to external users and also external users to request payments to your users. Allowing external payment requests opens the door to spam payment requests from unknown users.
* **Accept external payments automatically.** Whether to accept external payment requests without manual approval.
* **External credit limit**. You may define a trade balance limit for the sum of all external transactions, in addition to the limits of the trustlines. When the sum of the balances of all trustlines is lower than this limit, external payments are blocked.
* **External maximum balance**. Similar to the previous option, this limit sets the limit for the total imports, even if the limit of individual trustlines is not reached.
* **Public member list.** Groups may decide to publish or hide the member list (the name and account of all members in the group) from external users, so they can be searched from external users. Even without public member list, external users can use the QR code or enter the account number for creating transfers, but they will not see the destination account name.

#### Example

This mechanism is very flexible and allows for trading among very different types of community currencies. Imagine a city with two community currencies. Assume one is 100% backed by EUR and issued by the council. Another one is a mutual credit time-bank issued by a grass-roots association. The council sets the value of their currency to 1/10 (1 HOUR = 10 units). The time bank sets their value to 1 (1 HOUR = 1 time bank unit). The time bank agreeds to trust the council currency up to an arbitrary limit of 1,000 time bank units (equal to 10,000 council units). Now all users having council units can request services and pay to the time bank users. As soon as one council unit user pays to a time bank user, all time bank users can pay to council unit users until the trade balance between the two currencies reaches zero again.

Suppose that this is working great but the trade is stopping from time to time due to the balance of trade reaching the limit of zero. The council may decide then to use 5,000 EUR of their budget to back a trustline to the time bank currency and thus allowing a more comfortable trading between the two currencies. Now the balance of trade can go up to 5,000 in on direction and up to 10,000 in the other. Suppose now that after some time the balance of trade is approaching the limit established by the council trustline. Then the time bank may decide to host a party open to the whole city where they will serve drinks and meals and will accept their own time currency. This way they rebalance and the trade can continue.









