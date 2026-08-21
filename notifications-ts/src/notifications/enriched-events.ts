import { GroupEvent, MemberEvent, NotificationEvent, PostEvent, TransferEvent, UserEvent } from "./events"
import { Account, Member, Group, Currency, Transfer, Need, Offer, ExternalResource, Recipient } from "../clients/komunitin/types";

export type EnrichedTransferEventAccountData = {
  // In case of external transfers, the account or other related data 
  // may not be accessible. 
  account: Account | ExternalResource;
  member: Member | null;
  currency: Currency | null;
  group: Group | null;
  recipients: Recipient[];
}

export type EnrichedTransferEvent = TransferEvent & {
  group: Group;
  currency: Currency;
  transfer: Transfer
  payer: EnrichedTransferEventAccountData;
  payee: EnrichedTransferEventAccountData;
};

export type EnrichedPostEvent = PostEvent & {
  group: Group;
  post: Offer | Need;
  postType: 'offers' | 'needs';
  member: Member;
  recipients: Recipient[];
};

export type EnrichedMemberEvent = MemberEvent & {
  group: Group;
  member: Member;
  recipients: Recipient[];
};

export type EnrichedMemberHasExpiredPostsEvent = EnrichedMemberEvent & {
  expiredOffers: Offer[];
  expiredNeeds: Need[];
};

export type EnrichedMemberRequestedEvent = EnrichedMemberEvent & {
  name: 'MemberRequested';
  adminRecipients: Recipient[];
};

export type EnrichedGroupEvent = GroupEvent & {
  group: Group;
  adminRecipients: Recipient[];
};

type EnrichedGroupDigestEvent = NotificationEvent & {
  group: Group;
  members: Member[];
  recipients: Recipient[];
  offers: Offer[];
  needs: Need[];
}

export type EnrichedPostsPublishedDigestEvent = EnrichedGroupDigestEvent & {
  name: 'PostsPublishedDigest';
};

export type EnrichedMembersJoinedDigestEvent = EnrichedGroupDigestEvent & {
  name: 'MembersJoinedDigest';
};

export type EnrichedMemberHasNoPostsEvent = NotificationEvent & {
  name: 'MemberHasNoPosts';
  data: {
    balance: number;
    type: 'offers' | 'needs';
  };
  member: Member;
  group: Group;
  currency: Currency;
  recipients: Recipient[];
};

export type EnrichedUserEvent = UserEvent & {
  token: string;
  // Some user events may not be associated to any group (eg email validation when creating a new group).
  group?: Group;
};

export type EnrichedEvent =
  | EnrichedGroupEvent
  | EnrichedMemberEvent
  | EnrichedMemberRequestedEvent
  | EnrichedPostEvent
  | EnrichedTransferEvent
  | EnrichedPostsPublishedDigestEvent
  | EnrichedMembersJoinedDigestEvent
  | EnrichedMemberHasNoPostsEvent;

export type AnyEnrichedEvent = EnrichedEvent | EnrichedUserEvent;
