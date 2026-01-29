import {AccountSection, AccountAlert, HistoryLog } from './types';
import { Member, Offer, Need, Currency } from '../clients/komunitin/types';

// Constants
const HOUR_THRESHOLD = 10;

interface AccountData {
  member: Member;
  account: any;
  activeOffers: Offer[];
  activeNeeds: Need[];
  expiredOffers: Offer[];
  transfers: any[];
  history: HistoryLog[];
  currency: Currency;
}

export const getAccountSectionData = (data: AccountData): AccountSection => {
  const {
    account, member, activeOffers, activeNeeds,
    expiredOffers, transfers, history, currency
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
    balanceAdviceId = "newsletter.balance_advice_positive";
  } else if (balanceInHours < -HOUR_THRESHOLD) {
    // < -10 HOURS
    balanceAdviceId = "newsletter.balance_advice_negative";
  } else if (Math.abs(balanceInHours) <= HOUR_THRESHOLD) {
    // Close to zero
    balanceAdviceId = "newsletter.balance_advice_balanced";
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
      titleId: "newsletter.alert_no_offers_negative_title",
      textId: "newsletter.alert_no_offers_negative_text",
      actionTextId: "newsletter.action_create_offer",
      actionUrl: "/groups/:code/offers/new"
    });
  }

  // 2. No needs AND positive balance (> 0) => Create need
  if (noNeeds && balance > 0) {
    alerts.push({
      type: 'NO_NEEDS_POSITIVE',
      titleId: "newsletter.alert_no_needs_positive_title",
      textId: "newsletter.alert_no_needs_positive_text",
      actionTextId: "newsletter.action_create_need",
      actionUrl: "/groups/:code/needs/new"
    });
  }

  // 3. No offers => Create offer
  if (noOffers) {
    alerts.push({
      type: 'NO_OFFERS',
      titleId: "newsletter.alert_no_offers_title",
      textId: "newsletter.alert_no_offers_text",
      actionTextId: "newsletter.action_create_offer",
      actionUrl: "/groups/:code/offers/new"
    });
  }

  // 4. No needs => Create need
  if (noNeeds) {
    alerts.push({
      type: 'NO_NEEDS',
      titleId: "newsletter.alert_no_needs_title",
      textId: "newsletter.alert_no_needs_text",
      actionTextId: "newsletter.action_create_need",
      actionUrl: "/groups/:code/needs/new"
    });
  }

  // 5. No profile image => Edit profile
  if (!member.attributes.image) {
    alerts.push({
      type: 'NO_IMAGE',
      titleId: "newsletter.alert_no_image_title",
      textId: "newsletter.alert_no_image_text",
      actionTextId: "newsletter.action_edit_profile",
      actionUrl: "/profile"
    });
  }

  // 6. No profile bio => Edit profile
  if (!member.attributes.description) {
    alerts.push({
      type: 'NO_BIO',
      titleId: "newsletter.alert_no_bio_title",
      textId: "newsletter.alert_no_bio_text",
      actionTextId: "newsletter.action_edit_profile",
      actionUrl: "/profile"
    });
  }

  // 7. No location => Edit profile
  // In practice service may return [0,0] coords when no location set
  if (!member.attributes.location?.coordinates[0] && !member.attributes.location?.coordinates[1]) {
    alerts.push({
      type: 'NO_LOCATION',
      titleId: "newsletter.alert_no_location_title",
      textId: "newsletter.alert_no_location_text",
      actionTextId: "newsletter.action_edit_profile",
      actionUrl: "/profile"
    });
  }

  // 8. Have expired offers => Manage Offers
  if (expiredOffers.length > 0) {
    alerts.push({
      type: 'EXPIRED_OFFERS',
      titleId: "newsletter.alert_expired_offers_title",
      textId: "newsletter.alert_expired_offers_text",
      messageParams: { count: expiredOffers.length },
      actionTextId: "newsletter.action_manage_offers",
      actionUrl: "/groups/:code/offers"
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
      const prevContent = history[i].content;
      if (prevContent.account?.alert === alert.type) {
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
