import { TransferEvent } from '../events';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Account } from '../../clients/komunitin/types';
import { eventBus } from '../event-bus';
import { EnrichedTransferEvent } from '../enriched-events';

export const handleTransferEvent = async (event: TransferEvent): Promise<void> => {
  const client = new KomunitinClient();

  // Fetch transfer with included payer and payee accounts
  const transferResponse = await client.getTransfer(event.code, event.data.transfer, ['payer', 'payee']);
  const transfer = transferResponse.data;
  const included = transferResponse.included || [];

  // Extract accounts from included resources
  const payerAccount = included.find((r: any) => r.type === 'accounts' && r.id === transfer.relationships.payer.data.id) as Account;
  const payeeAccount = included.find((r: any) => r.type === 'accounts' && r.id === transfer.relationships.payee.data.id) as Account;

  if (!payerAccount || !payeeAccount) {
    throw new Error(`Missing payer or payee account in transfer ${transfer.id}`);
  }

  // Fetch members for both accounts
  const members = await client.getMembersByAccount(event.code, [payerAccount.id, payeeAccount.id]);
  const payerMember = members.find((m) => m.relationships.account.data.id === payerAccount.id);
  const payeeMember = members.find((m) => m.relationships.account.data.id === payeeAccount.id);

  if (!payerMember || !payeeMember) {
    throw new Error(`Missing payer or payee member for transfer ${transfer.id}`);
  }

  // Fetch users for both members, group, and currency in parallel
  const [payerUsersWithSettings, payeeUsersWithSettings, groupResponse, currency] = await Promise.all([
    client.getMemberUsers(payerMember.id),
    client.getMemberUsers(payeeMember.id),
    client.getGroup(event.code),
    client.getCurrency(event.code),
  ]);

  const group = groupResponse.data;

  const enrichedEvent: EnrichedTransferEvent = {
    ...event,
    group,
    currency,
    transfer,
    payer: {
      account: payerAccount,
      member: payerMember,
      users: payerUsersWithSettings,
    },
    payee: {
      account: payeeAccount,
      member: payeeMember,
      users: payeeUsersWithSettings,
    },
  };

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
