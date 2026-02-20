export const EVENT_NAME = {
  TransferCommitted: 'TransferCommitted',
  TransferPending: 'TransferPending',
  TransferRejected: 'TransferRejected',
  NeedPublished: 'NeedPublished',
  NeedExpired: 'NeedExpired',
  OfferPublished: 'OfferPublished',
  OfferExpired: 'OfferExpired',
  PostExpiresSoon: 'PostExpiresSoon',
  MemberHasExpiredPosts: 'MemberHasExpiredPosts',
  MemberJoined: 'MemberJoined',
  MemberRequested: 'MemberRequested',
  GroupRequested: 'GroupRequested',
  GroupActivated: 'GroupActivated',
  TransferStillPending: 'TransferStillPending',
  PostsPublishedDigest: 'PostsPublishedDigest',
  MembersJoinedDigest: 'MembersJoinedDigest',
  MemberHasNoPosts: 'MemberHasNoPosts',
  ValidationEmailRequested: 'ValidationEmailRequested',
  PasswordResetRequested: 'PasswordResetRequested',

} as const;

export type EventName = (typeof EVENT_NAME)[keyof typeof EVENT_NAME];

export type NotificationEvent = {
  id: string;
  name: EventName;
  source: string;
  code: string;
  time: Date;
  data: Record<string, any>;
  user: string;
};

export type TransferEvent = NotificationEvent & {
  name:
    | typeof EVENT_NAME.TransferCommitted
    | typeof EVENT_NAME.TransferPending
    | typeof EVENT_NAME.TransferRejected
    | typeof EVENT_NAME.TransferStillPending;
  data: {
    payer: string // account id of the payer
    payee: string // account id of the payee
    transfer: string // transfer id
  }
};

export type PostEvent = NotificationEvent & {
  name:
    | typeof EVENT_NAME.NeedPublished
    | typeof EVENT_NAME.NeedExpired
    | typeof EVENT_NAME.OfferPublished
    | typeof EVENT_NAME.OfferExpired
    | typeof EVENT_NAME.PostExpiresSoon;
  data: {
    offer?: string; // offer id (for offer events)
    need?: string; // need id (for need events)
    member?: string; // member id (for expired events)
  };
};

export type MemberEvent = NotificationEvent & {
  name: 
    | typeof EVENT_NAME.MemberJoined 
    | typeof EVENT_NAME.MemberRequested 
    | typeof EVENT_NAME.MemberHasExpiredPosts
  data: {
    member: string; // member id
  };
};

export type GroupEvent = NotificationEvent & {
  name: 
    | typeof EVENT_NAME.GroupRequested 
    | typeof EVENT_NAME.GroupActivated;
  data: {
    group: string; // group code
  };
};

export type UserEvent = NotificationEvent & {
  name: 
    | typeof EVENT_NAME.ValidationEmailRequested
    | typeof EVENT_NAME.PasswordResetRequested;
  data: {
    // That should usually be the same as the user field, 
    // but we keep it separate in case we want to trigger 
    // an email validation for a different user than the 
    // one who triggered the event.
    user: string;
  };
};
