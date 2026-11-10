import type { Account, Currency, ExtendedTransfer, Member } from '@/store/model'
import type { LoadPayload } from '@/store/resources'
import type { Ref} from 'vue';
import { watch, computed, ref } from 'vue'
import type { Store} from 'vuex';
import { useStore } from 'vuex'


/**
 * Loads all associated resources to this transfer resource: member,
 * currency and group for both payer and payee when their accounts are available.
 */
export const useFullTransferByResource = (transfer: Ref<ExtendedTransfer|undefined>) => {
  const store = useStore()
  const ready = ref(false)
  
  // External accounts can arrive after the transfer itself is stored.
  watch([transfer, () => transfer.value?.payer, () => transfer.value?.payee], async ([transfer]) => {
    if (!transfer) { return }
    const myAccount = store.getters.myAccount
    await loadTransfersRelationships([transfer], store, myAccount.id)
    ready.value = true
  }, { immediate: true })
  
  return {
    ready
  }
}

/**
 * Loads a transfer and all associated resources: account, member,
 * currency and group for both payer and payee.
 * 
 * For some external transfers, depending on external group configuration,
 * it won't be possible to fetch the member object.
 */
export const useFullTransferById = (id: Ref<{group: string, id: string}>) => {
  const store = useStore()
  // Load transfer and accounts. Note that this call already loads accounts
  // even if they are external. Also note that this updates the current logged
  // in account (if involved in transfer) and hence its balance.
  const refresh = async () => {
    await store.dispatch('transfers/load', { 
      id: id.value.id,
      group: id.value.group,
      include: "payer,payee",
      ignoreExternalErrors: true
    } as LoadPayload)
  }
  
  watch(id, refresh, { immediate: true })

  const transfer = computed<ExtendedTransfer>(() => store.getters['transfers/one'](id.value.id))

  const { ready } = useFullTransferByResource(transfer)

  return {
    transfer,
    ready,
    refresh
  }
  
}

/** Load transfer relationships in batches, allowing unavailable external groups. */
export const loadTransfersRelationships = async (transfers: ExtendedTransfer[], store: Store<unknown>, accountId?: string) => {
  const groups: Record<string, { accounts: Map<string, Account>, external: boolean }> = {}
  for (const transfer of transfers) {
    for (const role of ["payer", "payee"] as const) {
      const account = transfer[role]
      if (account && account.id !== accountId) {
        const url = account.links.self.split("/accounts/")[0]
        groups[url] ??= {
          accounts: new Map<string, Account>(),
          external: !!transfer.relationships[role].data.meta?.external
        }
        groups[url].accounts.set(account.id, account)
      }
    }
  }
  for (const [url, { accounts, external }] of Object.entries(groups)) {
    try {
      await loadAccountsRelationships(Array.from(accounts.values()), store)
    } catch (error) {
      if (!external) throw error
      console.warn(`Failed to load external account relationships: ${url}`, error)
    }
  }
}

/** Load currency and missing members for accounts belonging to one group. */
export const loadAccountsRelationships = async (accounts: (Account & {member?: Member, currency?: Currency})[], store: Store<unknown>) => {
  const accountUrl = accounts[0].links.self
  const urlPrefix = accountUrl.substring(0, accountUrl.indexOf("/accounts/"))

  const group = urlPrefix.substring(urlPrefix.lastIndexOf("/") + 1)
  const baseUrl = urlPrefix.substring(0, urlPrefix.lastIndexOf("/"))

  // load currency if required. This works even with remote servers.
  if (accounts.some(account => !account.currency)) {
    await store.dispatch("currencies/load", {
      url: `${baseUrl}/${group}/currency`,
      group
    })
  }
  // load members and group if required. Note that this only works if
  // they are using the same social server as the logged in user. That
  // could be expanded to remote servers if we add a way to get the social
  // api url related to a specific currency.
  const accountIds = accounts.filter(account => !account.member).map(account => account.id)
  if (accountIds.length > 0) {
    await store.dispatch("members/loadList", {
      group,
      filter: {
        account: accountIds.join(",")
      },
      include: "group",
      onlyResources: true
    })
  }
}
