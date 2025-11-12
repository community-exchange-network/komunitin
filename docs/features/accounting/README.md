# Accounting

## Currencies

Komunitin allows for creating different currencies, one for each community. Each currency is effectively a different token in the Stellar blockchain. When defining a currency you need to set some basic properties:

* **Code**: A unique 4-uppercase-letter code such as HOUR or COIN
* **Name**: The name of the currency, such as "Euro" or "Hour" or "Twike"
* **Symbol**: Such as $, €, ℏ, ¤ or any valid string of unicode symbols up to 3 characters.
* **Decimals**: The number of decimals to use when formatting the currency. Usually 2.
* **Scale**: The real number of decimals when doing internal computations with the currency.
* **Value**: The value of the currency measured with the global unit `HOUR`, meaning an average hour of labor. This value sets the exchange rate with other currencies in Komunitin and can be set as a fraction. More on that in [External transfers](external-transfers.md) section.

Currencies also have a set of settings defining some rules for the currency and what can or can not be done. See the Currency settings section.

## Accounts

Each account belongs to one and only one currency, and hence holds a balance in this currency. Each account is effectively an account in the Stellar blockchain. Accounts have

* **Code**: The currency code followed by 4 numbers. For example COIN0123.
* **Credit limit**: Each account can be as much negative as defined by its credit limit setting. If set to zero, then it can't be negative. If set to 100, then it can be as much negative as -100. Credit limits can be set in a per-account basis or also with a currency-wide strategy, and can change over time.
* **Maximum balance**: Optionally, accounts can be bounded by the upside too.

Accounts have a set of settings defining some behavior and what is allowed to do. See the Account settings section.

## Transfers

Users can send to other accounts of the same currency. There are several methods for making transfers and they can be enabled or disabled by configuration:

* **Simple send**. A user can see the list of community members and choose the destination account. Then enter the amount and a description, and submit.
* **Simple receive**. The initiating user is now the destination rather than the source. They go to the app, choose the source from the members list, set a description and amount and request the transfer. Generally, the source will receive a notification and an email asking for their approval. When the source approves the transfer, the destination will receive a notification as well.\
  Users can have a whitelist of accounts that will get their requests automatically accepted, and can even configure their account so that it automatically accepts all transfer requests.
* **Multiple transfers.** The app provides an interface for entering a batch of transfers and executing them all at once. This is just a convenient productivity interface for use cases when tens of transfers need to be entered. This option is available either for sending or for receiving.
* **Upload file**. An alternative way to enter multiple transfers is importing a CSV (Comma Separated Values) file with the transfers. The user may use any spreadsheet program to comfortably create the file. The format is simple: exactly 4 columns with Source, Destination, Description and Amount. External transfers are not supported.
* **QR code**. This is a method that allows the requester to enter the Description and the Amount of a transfer and build a QR code. This QR code can be then scanned by the source to finish the transfer.
* **NFC tag**. This feature allows for transfers with a workflow similar to contactless cards (the technology is different though). Users can link one or several existing NFC tags to their account. Then the receiver can initiate the transfer by adding a description and an amount and showing their NFC reader to the source. The source brings their NFC tag close to the destination reader to complete the transfer. Currently NFC tag transfers only work in Android devices.

Note that all these transfer methods are configurable and can be enabled at currency or account level depending on your concrete requirements. It is not recommended to leave all them available by default since too many options may cause confusion to users. A good approach is to set a single default way to perform transfers and open additional methods on a per-account basis as required.

## Account settings

Beyond the code, and the credit and maximum limits accounts have some additional settings governing their behavior. All this settings can be set account by account and they have a default value for all accounts in a currency.

* **Allow sending**. Allow this account to send to other accounts.
* **Allow receiving**. Allow this account to request transfers from other accounts.
* **Accept transfers automatically**. Transfer requests from users in the community are accepted by default, without the need of manual acceptance. This feature may look dangerous since it allows unsupervised charges from anyone in the community, but it has proved useful for small trustful communities since it simplifies the transfer request workflow.
* **Account whitelist**. It is a list of accounts. Transfer requests from the whitelist are automatically accepted.
* **Transfers timeout**. After a transfer request is done, it may be set to be automatically accepted after some time, eg 15 days.
* **Allow external sending**. Allow this account to send to accounts in other currencies.
* **Allow external receiving**. Allow this account to request transfers from accounts in other currencies.
* **Allow tag sending**. Allow this account to link NFC tags to their account and authorize transfers through these linked tags.
* **Allow tag receiving**. Allow this account to request transfers authorized with NFC tags. To perform NFC tag transfers, the source needs to have "Allow tag sending" and the destination needs to have "Allow tag receiving".
* **Accept external transfers automatically**. Extend the accept transfers automatically to transfer requests from accounts from other currencies as well.
* **On-transfer credit limit update**. This setting enables a dynamic scheme for account credit limits. Concretely, the account credit limit is updated automatically every time this account receives a transfer so the account credit limit equals the total sum of transfers received by this account. The credit limit thus gradually grows with currency up to a configurable hard limit.

While this set of settings already provides a great level of flexibility, the project is set to provide more configurable features as they are requested by partner communities.

## Currency settings

Beyond the basic currency properties (name, code, symbol, scale, decimals), currencies have some additional settings.&#x20;

* **Initial credit limit**. The credit limit for the new accounts. Changing this setting does not affect existing accounts.
* **Enable external transfers**. Whether this currency supports transfers to other currencies (both incoming and outgoing).
* **Enable external transfer requests**. Whether this currency supports transfer requests from other currencies (both incoming and outgoing).
* **Default account settings**. Currency have a set of account settings by default: allow sending, allow receiving requests, accept transfers automatically, whitelist, etc. \
  For example, if a community wants regular accounts to be just able to send and some special accounts to be able to both send and request transfers, they can set the allow sending to true and allow receiving requests to false at currency level and then overwrite the allow receiving requests setting for the special accounts.



