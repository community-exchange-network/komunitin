1. Revert the changes in copy (all langs). Original copy is ok in the common case 1 identity and 1 member. Just add an additional short note adding that if you control other members from your login, you'll be able to access them normally.

2. what do you think of this approach? we're using the member as the deletion target rather than the identity, and we're only deleting identities after last member is deleted. Do you think this is a good approach?

3. In terms of the UX workflow, instead of requiring the password I'm thinking of using the same flow as in passwd change or email change: send an email with a token that the user can use to confirm the deletion. What do you think?

4. In social / deleteMember, why keep the user and anonymize email instead of just removing the user entirely?