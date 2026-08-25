import type { MemberUserWithResources, Recipient, User } from './types';

export const memberRecipients = (relations: MemberUserWithResources[]): Recipient[] =>
  relations.map(({ memberUser, user, member }) => {
    const membership = { memberUser, member };
    return {
      user,
      membership,
      memberships: [membership],
    };
  });

export const groupRecipients = (relations: MemberUserWithResources[]): Recipient[] => {
  const recipients = new Map<string, Recipient>();

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

export const mandatoryRecipients = (users: User[]): Recipient[] =>
  users.map((user) => ({ user, memberships: [] }));

export const recipientsByMember = (relations: MemberUserWithResources[]) => {
  const recipients = new Map<string, Recipient[]>();

  for (const recipient of memberRecipients(relations)) {
    const memberId = recipient.membership!.member.id;
    recipients.set(memberId, [
      ...(recipients.get(memberId) ?? []),
      recipient,
    ]);
  }

  return recipients;
};
