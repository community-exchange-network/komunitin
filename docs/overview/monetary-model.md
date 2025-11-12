# Monetary model

Our goal is to provide a tool that facilitates the economic organization of a society in transition to a more sustainable production and consumption model and also a tool that promotes inclusion and fair trade. The model is based on real experience from exchange communities across Spain, Italy and Greece for more than 10 years.

### Community currencies

Each community has their own currency. Local communities are able to get organized and make decisions following their own governance model, and they issue a local currency based on their interpersonal trust. The exact definition and rules of the currency are left to the local community. Hence we offer an administration account with rights to perform actions on their currency and the accounts in their community. The local exchange community will typically have some sort of board that will own the credentials for the admin account.

Typically, the community currency follows a mutual credit scheme, where the currency is created when an account gets negative. If your balance is positive, it means that you've given more to the community than received, and if your account is negative, you've got more than given. Community currencies are thought more as a unit of measure than as an asset. There are multiple ways to give credit to accounts. Some communities give all users the same amount of credit upon onboarding, others don't allow negative balances, but give the currency units based on community work, others allow increasing negative balances based on previous use of the currency. Some communities give extra credit to selected members for developing projects for the common good.

The app offers a wide range of different configuration options including different transfer methods and credit limit schemes so currency administrators can develop their own scheme.

### External transfers

Exchange between different community currencies is a feature that has been already rudimentarily implemented both by IntegralCES (Komunitin's predecessor) and CES (the most popular community currency platform). However existing applications don't model the risk of trusting currencies out of the control of the local community and that has been a source of problems. Thanks to the idea of path transfers provided by Stellar (also referred to as credit mesh or ripple in other ledgers), we define a model where communities can control the risk of trading with external currencies. In this model, the required liquidity for currency exchange is provided by communities as a community and without profit margin.

The community administration may establish a trustline with one or a few other neighboring communities. That means that this community is willing to accept a limited amount of currency from the other one. This trust can be granted unilaterally by one community to another, but will typically follow a trading agreement between two neighboring communities. Global transfers are then possible via multiple hops of local currency exchanges via these local trust channels, even if the endpoint communities don't directly trust each other.

<figure><img src="../.gitbook/assets/Komunitin Stellar integration (1).png" alt=""><figcaption></figcaption></figure>

Imagine Alice from community A wants to send to Carol from community C. However Carol uses currency C so she is not interested in currency A from Alice. Moreover, there is no trade agreement between currency A and currency C so Alice can't directly get currency C to send to Carol with her currency A. However both currency A and C have a trade agreement with an intermediate currency B. Thus, Alice can exchange her currency A by some currency B, and then exchange some currency B by some currency C to finally send to Carol.

In order to provide liquidity for external trade, the model does not rely on individual for-profit market makers. Instead, each community defines a fixed (but configurable) exchange rate of their currency against a global unit that we call HOUR. Then they define the trust (in HOURs) to each trustworthy neighbor community. This is the maximum amount of HOURs this community is willing to accept from the other community. If the limit is reached, the trade is blocked in one direction and then the two communities may need to cooperate to revert the situation (with coordinated trades, change of rates, etc).

This model is a mix between the classical centralized monetary model, where a central authority issues the currency and everybody needs to trust this single institution and the path transfers model, where every individual is the issuer of their currency and they individually need to establish the trust lines with their peers. In this model, users need to fully trust the issuer and administrator of their local community currency, but they can trade with all other users from any reachable other community only through a limited trust with one or a few well-known neighbor communities.



\
