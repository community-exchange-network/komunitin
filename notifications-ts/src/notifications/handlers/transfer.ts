import { TransferEvent } from '../events';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Account, Currency, Member, ExternalResource, Group } from '../../clients/komunitin/types';
import { eventBus } from '../event-bus';
import { EnrichedTransferEvent, EnrichedTransferEventAccountData } from '../enriched-events';
import logger from '../../utils/logger';
import { config } from '../../config';
import { getCachedCurrency, getCachedGroup } from '../../utils/cached-resources';

type ExternalAccountData = {
  ref: ExternalResource;
  account: Account | null;
  member: Member | null;
  currency: Currency | null;
  group: Group | null;
}

const fetchExternalAccountData = async (client: KomunitinClient, ref: ExternalResource): Promise<ExternalAccountData> => {
  // Fetch the account and currency from the transfer meta.
  const accountUrl = ref.meta.href
  const currencyUrl = accountUrl.split("/accounts/")[0] + "/currency"
  let account: Account | null = null, currency: Currency | null = null, group: Group | null = null, member: Member | null = null
  try {
    account = (await client.fetch(accountUrl)).data;
    currency = (await client.fetch(currencyUrl)).data;
  } catch (error) {
    logger.error(error, `Failed to fetch external account or currency for account ${ref.id}.`)    
  }

  if (account && currency) {
    // Try fetch the group from this server.
    const code = currency.attributes.code;
    try {
      group = (await getCachedGroup(client, code)).data;
    } catch (error) {
      logger.warn(error, `Failed to fetch external group code ${code}, probably because it's not hosted on this server. Fetching external groups is not implemented yet.`);
    }
    // TODO: We should have a reliable way to get the group URL for an external account.
    // See https://github.com/community-exchange-network/komunitin/issues/638
    
    // We fetch the member directly by url so we don't use the service access token.
    const memberUrl = `${config.KOMUNITIN_SOCIAL_URL}/${code}/members?filter[account]=${account.id}`;
    try {
      const membersResponse = await client.fetch(memberUrl);
      if (membersResponse.data && membersResponse.data.length > 0) {
        member = membersResponse.data[0];
      }
    } catch (error) {
      // Swallow error since external servers may not allow fetching members without authentication.
    }
  }
  return { ref, account, member, currency, group };

}

export const handleTransferEvent = async (event: TransferEvent): Promise<void> => {
  const client = new KomunitinClient();

  // Fetch transfer with included payer and payee accounts
  const transferResponse = await client.getTransfer(event.code, event.data.transfer, ['payer', 'payee']);
  const transfer = transferResponse.data;
  const included = transferResponse.included || [];

  const accounts = included.filter((r: any) => r.type === 'accounts');
  
  const local: Account[] = accounts.filter((a: any) => !a.meta?.external);
  const external: ExternalResource[] = accounts.filter((a: any) => a.meta?.external);
  
  // Fetch local data
  const localMembers = await client.getMembersByAccount(event.code, local.map(a => a.id));
  const localGroup = await getCachedGroup(client, event.code);
  const localCurrency = await getCachedCurrency(client, event.code);
  const accountData: EnrichedTransferEventAccountData[] = []

  for (const account of local) {
    const member = localMembers.find(m => m.relationships.account.data.id === account.id);
    if (!member) {
      throw new Error(`Member not found for local account ${account.id}`);
    }
    const users = await client.getMemberUsers(member.id);
    accountData.push({
      account,
      member,
      users,
      currency: localCurrency,
      group: localGroup.data,
    })
  };

  // Fetch external data, if any.
  const externalData = await Promise.all(external.map((ref) => fetchExternalAccountData(client, ref)));
  for (const data of externalData) {
    const { ref, account, member, currency, group } = data;
    accountData.push({
      account: account ?? ref,
      member,
      currency,
      group,
      users: []
    })
  }

  const payerData = accountData.find(d => d.account?.id === transfer.relationships.payer.data.id);
  const payeeData = accountData.find(d => d.account?.id === transfer.relationships.payee.data.id);

  if (!payerData) {
    throw new Error(`Payer account data not found for account ${transfer.relationships.payer.data.id}`);
  }
  if (!payeeData) {
    throw new Error(`Payee account data not found for account ${transfer.relationships.payee.data.id}`);
  }

  const enrichedEvent: EnrichedTransferEvent = {
    ...event,
    group: localGroup.data,
    currency: localCurrency,
    transfer,
    payer: payerData,
    payee: payeeData,
  };

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
