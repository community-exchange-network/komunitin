import {Currency, Member, AccountSection, AccountAlert, Offer, Need, HistoryLog } from './types';

// Constants
const HOUR_THRESHOLD = 10;

interface AccountData {
  member: Member;
  account: any;
  activeOffers: Offer[];
  activeNeeds: Need[];
  expiredOffers: Offer[];
  expiredNeeds: Need[];
  transfers: any[];
  history: HistoryLog[];
  currency: Currency;
}

export const getAccountSectionData = (data: AccountData): AccountSection => {
  const {
    account, member, activeOffers, activeNeeds,
    expiredOffers, expiredNeeds, transfers, history, currency
    } = data;

  const balance = account.attributes.balance;

  // Convert balance to HOURS for logic checks
  const balanceInHours = (balance / (10 ** currency.attributes.scale)) * (currency.attributes.rate.n / currency.attributes.rate.d);


  // 1. Account Info Logic
  // ---------------------

  // Activity Text
  // "If there has been trades during the last month"
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const recentTransfers = transfers.filter(t => new Date(t.attributes.created) > oneMonthAgo);

  let activityCount: number | undefined;
  if (recentTransfers.length > 0) {
    activityCount = recentTransfers.length;
  }

  // Balance Advice
  let balanceAdviceId: string | undefined;

  if (balanceInHours > HOUR_THRESHOLD) {
    // > 10 HOURS
    balanceAdviceId = "BALANCE_ADVICE_POSITIVE";
  } else if (balanceInHours < -HOUR_THRESHOLD) {
    // < -10 HOURS
    balanceAdviceId = "BALANCE_ADVICE_NEGATIVE";
  } else if (Math.abs(balanceInHours) <= HOUR_THRESHOLD) {
    // Close to zero
    balanceAdviceId = "BALANCE_ADVICE_BALANCED";
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
      titleId: "ALERT_NO_OFFERS_NEGATIVE_TITLE",
      textId: "ALERT_NO_OFFERS_NEGATIVE_TEXT",
      actionTextId: "ACTION_CREATE_OFFER",
      actionUrl: "/offers/new"
    });
  }

  // 2. No needs AND positive balance (> 0) => Create need
  if (noNeeds && balance > 0) {
    alerts.push({
      type: 'NO_NEEDS_POSITIVE',
      titleId: "ALERT_NO_NEEDS_POSITIVE_TITLE",
      textId: "ALERT_NO_NEEDS_POSITIVE_TEXT",
      actionTextId: "ACTION_CREATE_NEED",
      actionUrl: "/needs/new"
    });
  }

  // 3. No offers => Create offer
  if (noOffers) {
    alerts.push({
      type: 'NO_OFFERS',
      titleId: "ALERT_NO_OFFERS_TITLE",
      textId: "ALERT_NO_OFFERS_TEXT",
      actionTextId: "ACTION_CREATE_OFFER",
      actionUrl: "/offers/new"
    });
  }

  // 4. No needs => Create need
  if (noNeeds) {
    alerts.push({
      type: 'NO_NEEDS',
      titleId: "ALERT_NO_NEEDS_TITLE",
      textId: "ALERT_NO_NEEDS_TEXT",
      actionTextId: "ACTION_CREATE_NEED",
      actionUrl: "/needs/new"
    });
  }

  // 5. No profile image => Edit profile
  if (!member.attributes.image) {
    alerts.push({
      type: 'NO_IMAGE',
      titleId: "ALERT_NO_IMAGE_TITLE",
      textId: "ALERT_NO_IMAGE_TEXT",
      actionTextId: "ACTION_EDIT_PROFILE",
      actionUrl: "/profile/edit"
    });
  }

  // 6. No profile bio => Edit profile
  if (!member.attributes.description) {
    alerts.push({
      type: 'NO_BIO',
      titleId: "ALERT_NO_BIO_TITLE",
      textId: "ALERT_NO_BIO_TEXT",
      actionTextId: "ACTION_EDIT_PROFILE",
      actionUrl: "/profile/edit"
    });
  }

  // 7. No location => Edit profile
  if (!member.attributes.location?.coordinates[0] && !member.attributes.location?.coordinates[1]) {
    alerts.push({
      type: 'NO_LOCATION',
      titleId: "ALERT_NO_LOCATION_TITLE",
      textId: "ALERT_NO_LOCATION_TEXT",
      actionTextId: "ACTION_EDIT_PROFILE",
      actionUrl: "/profile/edit"
    });
  }

  // 8. Have expired offers => Manage Offers
  if (expiredOffers.length > 0) {
    alerts.push({
      type: 'EXPIRED_OFFERS',
      titleId: "ALERT_EXPIRED_OFFERS_TITLE",
      textId: "ALERT_EXPIRED_OFFERS_TEXT",
      messageParams: { count: expiredOffers.length },
      actionTextId: "ACTION_MANAGE_OFFERS",
      actionUrl: "/offers" // or /my-offers
    });
  }

  // 9. Have expired needs => Manage Needs
  if (expiredNeeds.length > 0) {
    alerts.push({
      type: 'EXPIRED_NEEDS',
      titleId: "ALERT_EXPIRED_NEEDS_TITLE",
      textId: "ALERT_EXPIRED_NEEDS_TEXT",
      messageParams: { count: expiredNeeds.length },
      actionTextId: "ACTION_MANAGE_NEEDS",
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
    // If repeatCount is 1 (shown last time), Accept
    // If seen 2 times consecutively, skip this type and try next priority.

    if (repeatCount < 2) {
      selectedAlert = alert;
      break; // Found one!
    }
  }

  return {
    balance,
    activityCount,
    balanceAdviceId,
    alert: selectedAlert
  };
};
