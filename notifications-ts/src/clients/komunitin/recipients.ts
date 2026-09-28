import type {
  AccountRecipient,
  GroupRecipient,
  MandatoryRecipient,
  MemberUserWithResources,
  User,
} from './types';

export const memberRecipients = (relations: MemberUserWithResources[]): AccountRecipient[] =>
  relations.map(({ memberUser, user, member }) => {
    const membership = { memberUser, member };
    return {
      user,
      membership,
    };
  });

export const groupRecipients = (relations: MemberUserWithResources[]): GroupRecipient[] => {
  const recipients = new Map<string, GroupRecipient>();

  for (const { memberUser, user, member } of relations) {
    const membership = { memberUser, member };
    const recipient = recipients.get(user.id);
    if (recipient) {
      recipient.memberships.push(membership);
    } else {
      recipients.set(user.id, {
        user,
        memberships: [membership],
      });
    }
  }

  return [...recipients.values()];
};

export const mandatoryRecipients = (users: User[]): MandatoryRecipient[] =>
  users.map((user) => ({ user }));

export const recipientsByMember = (relations: MemberUserWithResources[]) => {
  const recipients = new Map<string, AccountRecipient[]>();

  for (const recipient of memberRecipients(relations)) {
    const memberId = recipient.membership.member.id;
    recipients.set(memberId, [
      ...(recipients.get(memberId) ?? []),
      recipient,
    ]);
  }

  return recipients;
};
