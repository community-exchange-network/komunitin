# Technology

The Komunitin system is made of several microservices.

* **App**: The client application with user interface. See the [app](../../app) folder.
* **Notifications** service: The backend service for the messaging system including mails and push notifications. See the [notifications-ts](../../notifications-ts) folder.
* **Accounting** service: The decentralized backend for the accounting API based on the [Stellar](https://stellar.org/) blockchain. See the [accounting](../../accounting) folder.
* **Social** service: The backend for communities, member profiles, offers, needs and categories. See the [social overview](social/README.md).
* **Auth** service: The identity provider for user login, access tokens and authorization between services. See [authentication and authorization](auth/README.md).
