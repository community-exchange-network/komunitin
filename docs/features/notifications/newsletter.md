# Community Admin Guide: Automated Newsletter Service

The Komunitin newsletter is a strategic engagement tool designed to increase member retention and activity by delivering personalized and localized email updates.

## What is in the Newsletter?

The newsletter features a mobile-responsive layout divided into several key sections to provide value to your members:

### 1. Header & Greeting

The header prominently displays your **Group Name and Logo** to build a closer connection with the user. Each email includes a **personalized greeting** addressing the member by name, highlighting that the content is tailored for them.

### 2. Marketplace Highlights

This section aims to spark curiosity by showcasing a curated selection of marketplace items:

* 
**Offers**: Displays 3 selected offers from the local marketplace, including an image, title, truncated description, author details (name and avatar), and the distance from the author to the user.


* 
**Needs**: Displays 3 selected needs with a similar layout to the offers.


* 
**Primary Call to Action (CTA)**: A button directing users to the main Home feed to browse more content.


* 
**Secondary CTA**: A link encouraging users to "Publish a new offer" to drive community content creation.



### 3. My Account Dashboard

Provides members with a clear view of their current status within the community:

* 
**Balance**: A prominent box displaying the local currency balance.


* 
**Balance Description**: A helpful explanation of the balance within the context of a mutual credit system (e.g., explaining that a negative balance is acceptable and represents receiving more than provided).


* 
**Monthly Stats**: Shows the number of transfers the user completed in the last month (hidden if no transfers occurred).



### 4. Account Alert Box

A high-impact, personalized section that identifies specific tasks for the user to improve their participation. It prioritizes alerts such as:

* Missing profile details (image, bio, or location).


* Negative balance with no active offers.


* Positive balance with no active needs.


* Expired offers that need management.



### 5. Community Statistics

Displays global community activity from the last month to show growth and vitality:

* Total number of transfers.


* Number of accounts with at least one transfer.


* Number of new accounts.
(Note: Any figure that is zero is automatically hidden.)



### 6. Footer

Includes the Komunitin logo and essential links for **one-click unsubscription** or managing **mailing preferences**.

---

## Configuration Options

Both administrators and individual users have control over how they interact with the newsletter service.

### For Community Admins

Administrators can manage the following settings at the community level:

* 
**Enable/Disable Newsletter**: Turn the entire newsletter service on or off for the community.


* 
**Default Frequency**: Set the default delivery frequency for new users who join the community.



### For Users

Individual members can personalize their own experience through their app settings:

* 
**Frequency Selection**: Users can choose to receive the newsletter **weekly**, **monthly**, or opt-out entirely by selecting **never**.

# Newsletter Algorithms

## Offers and Needs Selection Algorithm

The offers and needs selection algorithm has been crafted to have these global properties:

- **Items are relevant to the user**: items selected should be appealing to the target user.
- **Items are varied**: items selected should be varied.
- **Equitable publishing of items**: all offers should be shown an equitable number of times across all newsletters.

Specifically, the algorithm selects a mix of 2 "Fresh & Close" items and 1 "Random" items to ensure relevance while maintaining variety.

### 1. Fresh & Close Selection (2 Items)

This phase selects items from the 100 most recently updated candidates in the marketplace, excluding the recipient's own posts. Selection is done via **Weighted Random selection**, where each item is assigned a dynamic score:

* 
**Distance Score**: Items within 1 km receive a perfect score. Beyond that, the score decays exponentially, reaching half its value every 10 km.


* 
**Time Score**: Items created very recently (within one month or since the last newsletter) receive a perfect score. Older items decay exponentially with a three-month half-life.


* 
**Quality Score**: Items with images receive a full score (1.0), while those without images are penalized (0.5) to promote more engaging content.


* 
**Historic Penalty**: To avoid repetition, items from authors who were featured in any of the last three newsletters are penalized.


* 
**Global Variety Penalty**: To ensure the same item isn't sent to the entire community at once, a penalty is applied if an item has already been selected for many other members in the current batch.


* 
**Dynamic Re-scoring**: After the first item is chosen, the scores of remaining candidates from the same author or category are lowered to ensure the second item is different.



### 2. Random Selection (1 Item)

The final item is chosen purely at random from the remaining pool of items (excluding the user's own and those already selected).

* 
**Conflict Avoidance**: The system will retry the random selection up to three times if the chosen item happens to be from the same author or category as the items already selected in the first phase.



---

## Account Alert Conditions

The "Account Alert" box is designed to nudge users toward the most urgent action they can take to improve their standing or participation in the community. The system checks for issues in the following **priority order** and displays only the top-priority alert found:

| Priority | Condition | Recommended Action |
| --- | --- | --- |
| 1 | Negative balance AND no active offers | Create an Offer 

 |
| 2 | Positive balance AND no active needs | Create a Need 

 |
| 3 | No active offers (any balance) | Create an Offer 

 |
| 4 | No active needs (any balance) | Create a Need 

 |
| 5 | Profile is missing an image | Edit Profile 

 |
| 6 | Profile is missing a biography | Edit Profile 

 |
| 7 | Profile is missing a location | Edit Profile 

 |
| 8 | User has expired offers | Manage Offers 

 |

### Anti-Fatigue Logic (Repetition Check)

To prevent users from being "pestered" by the same message repeatedly, the system checks the logs of the previous two newsletters.

* If the same alert type was shown in the **last two consecutive newsletters**, that alert is skipped for the current email.


* The system then automatically moves to the next highest priority alert. This ensures that even if a user hasn't fixed a high-priority issue (like a missing profile picture), they might still be notified about other relevant tasks (like expiring offers).