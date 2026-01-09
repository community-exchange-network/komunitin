import { GroupEvent, MemberEvent, PostEvent, TransferEvent } from "./events"
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
  postType: 'offer' | 'need';
  member: Member;
  users: Array<{ user: User; settings: UserSettings }>;
};

export type EnrichedMemberEvent = MemberEvent & {
  group: Group;
  member: Member;
  users: Array<{ user: User; settings: UserSettings }>;
};

export type EnrichedGroupEvent = GroupEvent & {
  group: Group;
  adminUsers: Array<{ user: User; settings: UserSettings }>;
};

export type EnrichedEvent = EnrichedGroupEvent | EnrichedMemberEvent | EnrichedPostEvent | EnrichedTransferEvent;



