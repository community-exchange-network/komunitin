# Feed Selection Algorithm

This document describes the logic behind the function used to select relevant Offers and Needs for members in the newsletter.

## Overview

The algorithm selects a mix of `M` "Fresh & Close" items and `N` "Random" items to ensure relevance while maintaining variety.

### 1. Fresh & Close Selection (M items)

This phase selects `M` items from candidates excluding the target member's own items. For performance optimization, only the 100 most recent items (by update date) are considered for scoring.

Candidates are selected using a **Weighted Random** selection, where weights are dynamic scores calculated for each candidate.

#### Scoring Formula

The score for an item is calculated using a two-component base score, followed by multiplicative penalties:

$$ Score = (w_d \times S_{dist} + w_t \times S_{time}) \times P_{history} \times P_{global} $$

**Weight Constants:**
- $w_d = 0.33$ (WEIGHT_DISTANCE)
- $w_t = 0.67$ (WEIGHT_TIME)

**Distance Score ($S_{dist}$):**

Items within 1 km receive a perfect distance score. Beyond that, the score decays exponentially with a half-life of 10 km:

- If $d \le 1000$ m: $S_{dist} = 1.0$
- If $d > 1000$ m: $S_{dist} = e^{-\frac{\ln(2)}{10000} \times (d - 1000)}$

**Time Score ($S_{time}$):**

Items created recently receive a perfect time score. The threshold adapts based on newsletter frequency: it's the minimum of 1 month or the time since the last newsletter was sent. Beyond that threshold, the score decays exponentially with a half-life of 3 months:

- Let $t_{threshold} = \min(1 \text{ month}, \text{time since last newsletter})$
- If item age $\le t_{threshold}$: $S_{time} = 1.0$
- If item age $> t_{threshold}$: $S_{time} = e^{-\frac{\ln(2)}{3 \text{ months}} \times (\text{item age} - t_{threshold})}$

Where item age is the time elapsed since the item was created (measured from now).

**Historic Penalty ($P_{history}$):**

Penalizes items from authors who were featured in the last 3 newsletters using a base penalty of 0.5:

$$ P_{history} = \prod (0.5^{(4 - m)}) $$

Where $m$ is the newsletter index (1=last, 2=previous, 3=pre-previous).

**Global Variety Penalty ($P_{global}$):**

Penalizes items that have already been selected for *other members* in the current batch generation using a base penalty of 0.5:

$$ P_{global} = 0.5^N $$

Where $N$ is the number of times the item has been featured globally.

#### Dynamic Adjustment

After selecting an item, the scores of remaining candidates are adjusted to promote variety:
- **Same Author**: Score multiplied by $0.01$ (REPEATED_MEMBER_PENALTY).
- **Same Category**: Score multiplied by $0.1$ (REPEATED_CATEGORY_PENALTY).

---

### 2. Random Selection (N items)

This phase selects items from the *remaining* pool excluding the target member's own items and those already selected.

- **Selection**: Pure random uniform selection.
- **Conflict Avoidance**: Retries up to 3 times if the selected item shares an Author or Category with any previously selected item (from either phase).

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
