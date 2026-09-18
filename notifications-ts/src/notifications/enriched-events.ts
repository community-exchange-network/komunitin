import { GroupEvent, MemberEvent, NotificationEvent, PostEvent, TransferEvent, UserEvent } from "./events"
import {
  Account,
  AccountRecipient,
  Currency,
  ExternalResource,
  Group,
  GroupRecipient,
  MandatoryRecipient,
  Member,
  Need,
  Offer,
  Transfer,
} from "../clients/komunitin/types";

export type EnrichedTransferEventAccountData = {
  // In case of external transfers, the account or other related data 
  // may not be accessible. 
  account: Account | ExternalResource;
  member: Member | null;
  currency: Currency | null;
  group: Group | null;
  recipients: AccountRecipient[];
}

export type EnrichedTransferEvent = TransferEvent & {
  group: Group;
  currency: Currency;
  transfer: Transfer
  payer: EnrichedTransferEventAccountData;
  payee: EnrichedTransferEventAccountData;
};

type EnrichedPostEventData = {
  group: Group;
  post: Offer | Need;
  postType: 'offers' | 'needs';
  member: Member;
};

export type EnrichedPublishedPostEvent = PostEvent & EnrichedPostEventData & {
  name: 'OfferPublished' | 'NeedPublished';
  recipients: GroupRecipient[];
};

export type EnrichedAccountPostEvent = PostEvent & EnrichedPostEventData & {
  name: 'OfferExpired' | 'NeedExpired' | 'PostExpiresSoon';
  recipients: AccountRecipient[];
};

export type EnrichedPostEvent = EnrichedPublishedPostEvent | EnrichedAccountPostEvent;

export type EnrichedMemberEvent = MemberEvent & {
  group: Group;
  member: Member;
  recipients: AccountRecipient[];
};

export type EnrichedMemberHasExpiredPostsEvent = EnrichedMemberEvent & {
  expiredOffers: Offer[];
  expiredNeeds: Need[];
};

export type EnrichedMemberRequestedEvent = EnrichedMemberEvent & {
  name: 'MemberRequested';
  adminRecipients: MandatoryRecipient[];
};

export type EnrichedGroupEvent = GroupEvent & {
  group: Group;
  adminRecipients: MandatoryRecipient[];
};

type EnrichedGroupDigestEvent = NotificationEvent & {
  group: Group;
  members: Member[];
  recipients: GroupRecipient[];
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
  recipients: AccountRecipient[];
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
