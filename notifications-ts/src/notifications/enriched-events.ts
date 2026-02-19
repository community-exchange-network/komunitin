import { GroupEvent, MemberEvent, NotificationEvent, PostEvent, TransferEvent } from "./events"
import { Account, Member, User, Group, Currency, Transfer, UserSettings, Need, Offer } from "../clients/komunitin/types";

export type EnrichedTransferEvent = TransferEvent & {
  group: Group;
  currency: Currency;
  transfer: Transfer
  payer: {
    account: Account;
    member: Member;
    users: Array<{ user: User; settings: UserSettings }>;
  };
  payee: {
    account: Account;
    member: Member;
    users: Array<{ user: User; settings: UserSettings }>;
  };
};

export type EnrichedPostEvent = PostEvent & {
  group: Group;
  post: Offer | Need;
  postType: 'offers' | 'needs';
  member: Member;
  users: Array<{ user: User; settings: UserSettings }>;
};

export type EnrichedMemberEvent = MemberEvent & {
  group: Group;
  member: Member;
  users: Array<{ user: User; settings: UserSettings }>;
};

export type EnrichedMemberHasExpiredPostsEvent = EnrichedMemberEvent & {
  expiredOffers: Offer[];
  expiredNeeds: Need[];
};

export type EnrichedGroupEvent = GroupEvent & {
  group: Group;
  adminUsers: Array<{ user: User; settings: UserSettings }>;
};

type EnrichedGroupDigestEvent = NotificationEvent & {
  group: Group;
  members: Member[];
  users: Array<{ user: User; settings: UserSettings }>;
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
  users: Array<{ user: User; settings: UserSettings }>;
};

export type EnrichedUserEvent = NotificationEvent & {
  name: 'ValidationEmailRequested' | 'PasswordResetRequested';
  // user is already taken.
  target: { user: User; settings: UserSettings };
  token: string;
  // Some user events may not be associated to any group (eg email validation when creating a new group).
  group?: Group;
};

export type EnrichedEvent =
  | EnrichedGroupEvent
  | EnrichedMemberEvent
  | EnrichedPostEvent
  | EnrichedTransferEvent
  | EnrichedPostsPublishedDigestEvent
  | EnrichedMembersJoinedDigestEvent
  | EnrichedMemberHasNoPostsEvent
  | EnrichedUserEvent;