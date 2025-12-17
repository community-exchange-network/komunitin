import { Member, AccountSection, AccountAlert, Offer, Need, HistoryLog } from './types';

// Constants
const HOUR_THRESHOLD = 10;
const ZERO_THRESHOLD = 2; // "Close to zero" range +/- 2 (e.g., -2 to 2)

interface AccountData {
  member: Member;
  account: any;
  activeOffers: Offer[];
  activeNeeds: Need[];
  expiredOffers: Offer[];
  expiredNeeds: Need[];
  transfers: any[];
  history: HistoryLog[];
  currencySymbol?: string;
  currencyRate?: number; // Rate relative to HOUR? User said "using currency rate to compute it"
}

export const getAccountSectionData = (data: AccountData): AccountSection => {
  const {
    account, member, activeOffers, activeNeeds,
    expiredOffers, expiredNeeds, transfers, history,
    currencySymbol = '¤', currencyRate = 1
  } = data;

  const balance = account.attributes.balance; // Assuming raw units
  // Convert balance to HOURS for logic checks
  // User says: "If balance is positive (>10 HOUR, using the currency rate to compute it)"
  // So: logicBalance = balance / rate? Or balance * rate?
  // Usually rate implies: 1 Unit = X Hours? Or 1 Hour = X Units?
  // Let's assume rate converts Balance -> Hours. 
  // If rate is provided, logicBalance = balance * rate. If not, assume 1:1.
  const balanceInHours = balance * currencyRate;

  // 1. Account Info Logic
  // ---------------------

  // Balance Text
  const balanceText = `${balance.toFixed(2)} ${currencySymbol}`;

  // Activity Text
  // "If there has been trades during the last month"
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const recentTransfers = transfers.filter(t => new Date(t.attributes.created) > oneMonthAgo);

  let activityText: string | undefined;
  if (recentTransfers.length > 0) {
    activityText = `${recentTransfers.length} exchanges during last month`;
  }

  // Balance Advice
  let balanceAdvice: string | undefined;

  if (balanceInHours > HOUR_THRESHOLD) {
    // > 10 HOURS
    balanceAdvice = "You have given more than received. You can use your balance to fulfill your needs and recirculate it to the community.";
  } else if (balanceInHours < -HOUR_THRESHOLD) {
    // < -10 HOURS
    balanceAdvice = "You have received more than given. Try to balance it by offering and helping your community.";
  } else if (Math.abs(balanceInHours) <= ZERO_THRESHOLD) {
    // Close to zero
    balanceAdvice = "Your balance is well balanced!";
  }

  // 2. Alerts Logic (Prioritized)
  // -----------------------------

  const alerts: AccountAlert[] = [];

  const noOffers = activeOffers.length === 0;
  const noNeeds = activeNeeds.length === 0;

  // Check priorities (1 = Highest)

  // 1. No offers AND negative balance (< 0, pure check) => Create offer
  if (noOffers && balance < 0) {
    alerts.push({
      type: 'NO_OFFERS_NEGATIVE',
      message: "You have no active offers and a negative balance.",
      actionText: "Create Offer",
      actionUrl: "/offers/new"
    });
  }

  // 2. No needs AND positive balance (> 0) => Create need
  if (noNeeds && balance > 0) {
    alerts.push({
      type: 'NO_NEEDS_POSITIVE',
      message: "You have no active needs and a positive balance.",
      actionText: "Create Need",
      actionUrl: "/needs/new"
    });
  }

  // 3. No offers => Create offer
  if (noOffers) {
    alerts.push({
      type: 'NO_OFFERS',
      message: "You don't have any active offers.",
      actionText: "Create Offer",
      actionUrl: "/offers/new"
    });
  }

  // 4. No needs => Create need
  if (noNeeds) {
    alerts.push({
      type: 'NO_NEEDS',
      message: "You don't have any active needs.",
      actionText: "Create Need",
      actionUrl: "/needs/new"
    });
  }

  // 5. No profile image => Edit profile
  if (!member.attributes.image) {
    alerts.push({
      type: 'NO_IMAGE',
      message: "Your profile has no image.",
      actionText: "Edit Profile",
      actionUrl: "/profile/edit"
    });
  }

  // 6. No profile bio OR location => Edit profile
  // Assuming 'bio' is in attributes or similar common field
  if (!member.attributes.bio || !member.attributes.address) { // address ~ location
    alerts.push({
      type: 'NO_BIO_LOC',
      message: "Your profile is missing a bio or location.",
      actionText: "Edit Profile",
      actionUrl: "/profile/edit"
    });
  }

  // 7. Have expired offers => Manage Offers
  if (expiredOffers.length > 0) {
    alerts.push({
      type: 'EXPIRED_OFFERS',
      message: `You have ${expiredOffers.length} expired offers.`,
      actionText: "Manage Offers",
      actionUrl: "/offers" // or /my-offers
    });
  }

  // 8. Have expired needs => Manage Needs
  if (expiredNeeds.length > 0) {
    alerts.push({
      type: 'EXPIRED_NEEDS',
      message: `You have ${expiredNeeds.length} expired needs.`,
      actionText: "Manage Needs",
      actionUrl: "/needs" // or /my-needs
    });
  }

  // Select best alert: Highest priority NOT shown twice in a row
  let selectedAlert: AccountAlert | undefined;

  for (const alert of alerts) {
    // Check history
    // We look at last 2 newsletters
    let repeatCount = 0;
    for (let i = 0; i < 2; i++) {
      // history is sorted desc? Assuming YES.
      if (!history[i]) break;
      // Check if log contains accountSection with same alert type
      const prevContent = history[i].content as any;
      if (prevContent?.accountSection?.alert?.type === alert.type) {
        repeatCount++;
      } else {
        // Consecutive chain broken
        break;
      }
    }

    // "don't show the same alert more than twice in a row"
    // If repeatCount is 2 (shown last time AND time before), Skip.
    // If repeatCount is 1 (shown last time), Accept (assuming we allow 2 in a row).
    // Prompt: "more than twice". So 2 times is max.
    // If seen 2 times consecutively, skip this type and try next priority.

    if (repeatCount < 2) {
      selectedAlert = alert;
      break; // Found one!
    }
  }

  return {
    balanceText,
    activityText,
    balanceAdvice,
    alert: selectedAlert
  };
};
