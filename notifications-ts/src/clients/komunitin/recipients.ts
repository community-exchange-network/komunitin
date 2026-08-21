import type { MemberUserWithUser, Recipient, User } from './types';

export const memberRecipients = (relations: MemberUserWithUser[]): Recipient[] =>
  relations.map(({ memberUser, user }) => ({
    user,
    memberUser,
    memberUsers: [memberUser],
  }));

export const groupRecipients = (relations: MemberUserWithUser[]): Recipient[] => {
  const recipients = new Map<string, Recipient>();

  for (const { memberUser, user } of relations) {
    const recipient = recipients.get(user.id);
    if (recipient) {
      recipient.memberUsers.push(memberUser);
    } else {
      recipients.set(user.id, {
        user,
        memberUsers: [memberUser],
      });
    }
  }

  return [...recipients.values()];
};

export const mandatoryRecipients = (users: User[]): Recipient[] =>
  users.map((user) => ({ user, memberUsers: [] }));
