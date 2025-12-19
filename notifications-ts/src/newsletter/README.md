# Feed Selection Algorithm

This document describes the logic behind the `selectBestItems` function used to select relevant Offers and Needs for members in the newsletter.

## Usage

```typescript
import { selectBestItems } from './posts-algorithm';

const options = {
  freshCount: 2, // M
  randomCount: 1  // N
};

const items = selectBestItems(context, options);
```

## Overview

The algorithm selects a mix of "Fresh & Close" items and "Random" items to ensure relevance while maintaining variety.

### 1. Fresh & Close Selection (M items)

This phase selects `freshCount` items from candidates that are:
- Created *after* the last newsletter date.
- Not authored by the target member.

Candidates are selected using a **Weighted Random** simplified selection, where weights are dynamic scores calculated for each candidate.

#### Scoring Formula

The score for an item is calculated as:

$$ Score = S_{dist} \times P_{history} \times P_{global} $$

**Distance Score ($S_{dist}$):**

We use a flat score for local items (within $K=1000$ km) and an exponential decay for further items. A base score floor ($ALPHA=0.1$) ensures distant items remain reachable.

- If $d \le 1000$: $Term = 1.0$
- If $d > 1000$: $Term = e^{-(d - 1000) / 1000}$

$$ S_{dist} = 0.1 + (0.9 \times Term) $$

**Historic Penalty ($P_{history}$):**

Penalizes items from authors who were featured in the last 3 newsletters.

$$ P_{history} = \prod (0.5^{(4 - m)}) $$

Where $m$ is the newsletter index (1=last, 2=previous, 3=pre-previous).

**Global Variety Penalty ($P_{global}$):**

Penalizes items that have already been selected for *other members* in the current batch generation.

$$ P_{global} = 0.5^N $$

Where $N$ is the number of times the item has been featured globally.

#### Dynamic Adjustment

After selecting an item, the scores of remaining candidates are adjusted to promote variety:
- **Same Author**: Score multiplied by $0.01$ ($0.1^2$).
- **Same Category**: Score multiplied by $0.1$.

---

### 2. Random Selection (N items)

This phase selects `randomCount` items from the *remaining* pool (including older items), excluding only the target member's own items and those already selected.

- **Selection**: Pure random uniform selection.
- **Conflict Avoidance**: Retries up to 3 times if the selected item shares an Author or Category with any previously selected item (from either phase).

## Fallback

If there are not enough "Fresh" items to satisfy `freshCount`, the algorithm proceeds to fill the remaining desired total slots using the Random strategy with the broader pool of items (including old ones).

# Your Account Section Algorithm

This logic generates the "Your Account" section, providing personalized feedback and alerts based on the member's account status and history.

## 1. Account Info Logic

This section displays the current balance and celebrates recent activity.

- **Activity Stats**: Celebrates if there have been *any* exchanges (transfers) in the last month (e.g., "N exchanges during last month").
- **Balance Advice**:
    - **Positive (> 10 Hours)**: "You have given more than received. You can use your balance..."
    - **Negative (< -10 Hours)**: "You have received more than given. Try to balance it..."
    - **Balanced (Within +/- 10 Hours)**: "Your balance is well balanced!"

## 2. Alerts Logic (Prioritized)

Selects the most specific and urgent action for the user to take. Alerts are checked in the following priority order:

1.  No active offers AND negative balance. (Action: Create Offer)
2.  No active needs AND positive balance. (Action: Create Need)
3.  No active offers. (Action: Create Offer)
4.  No active needs. (Action: Create Need)
5.  Profile has no image. (Action: Edit Profile)
6.  Profile has no bio. (Action: Edit Profile)  
7.  Profile has no location. (Action: Edit Profile)  
8.  Has expired offers. (Action: Manage Offers)

### History Check (Anti-Repetition)

To avoid "alert fatigue", the algorithm checks the previous 2 newsletter logs for this member.

- If the **same alert type** was shown in the **last 2 consecutive newsletters**, that alert is **skipped**.
- The algorithm then proceeds to the next highest priority alert.
- This ensures users are not pestered with the same message more than twice in a row, allowing lower-priority but relevant alerts to surface.
