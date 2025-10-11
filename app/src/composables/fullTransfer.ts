import type { Account, Currency, ExtendedTransfer, Member } from 'src/store/model'
import type { LoadPayload } from 'src/store/resources'
import type { Ref} from 'vue';
import { watch, computed, ref } from 'vue'
import type { Store} from 'vuex';
import { useStore } from 'vuex'


/**
 * Loads all associated resources to this transfer resource: member,
 * currency and group for both payer and payee. Not that the transfer
 * must have at least the payer and payee accounts already loaded.
 */
export const useFullTransferByResource = (transfer: Ref<ExtendedTransfer|undefined>) => {
  const store = useStore()
  const ready = ref(false)
  
  watch(transfer, async (transfer) => {
    if (!transfer) { return }
    const isExternalPayer = transfer.relationships.payer?.data.meta?.external
    const isExternalPayee = transfer.relationships.payee?.data.meta?.external
    // Load local members (except for the logged in account which is already loaded).
    const myAccount = store.getters.myAccount
    const myCurrency = myAccount.currency

    const localAccountIds = []
    if (!isExternalPayer && transfer.payer && transfer.payer.id !== myAccount.id) {
      localAccountIds.push(transfer.payer.id)
    }
    if (!isExternalPayee && transfer.payee && transfer.payee.id !== myAccount.id) {
      localAccountIds.push(transfer.payee.id)
    }
    if (localAccountIds.length > 0) {
      await store.dispatch("members/loadList", {
        group: myCurrency.attributes.code,
        filter: {
          account: localAccountIds.join(",")
        },
        onlyResources: true
      })
    }
    // If there are no external accounts we're done, since we have accounts, members 
    // and also currency and group since they are the same as the ones for the logged 
    // in account.
    if (isExternalPayee) {
      await loadExternalAccountRelationships(transfer.payee, store)
    }
    if (isExternalPayer) {
      await loadExternalAccountRelationships(transfer.payer, store)
    }
    ready.value = true
  })
  
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
      include: "payer,payee"
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

export const loadExternalAccountRelationships = async (account: Account & {member?: Member, currency?: Currency}, store: Store<unknown>) => {
  const accountUrl = account.links.self
  const urlPrefix = accountUrl.substring(0, accountUrl.indexOf("/accounts/"))

  const group = urlPrefix.substring(urlPrefix.lastIndexOf("/") + 1)
  const baseUrl = urlPrefix.substring(0, urlPrefix.lastIndexOf("/"))

  // load currency if required. This works even with remote servers.
  if (!account.currency) {
    await store.dispatch("currencies/load", {
      url: `${baseUrl}/${group}/currency`,
      group
    })
  }
  // load members and group if required. Note that this only works if
  // they are using the same social server as the logged in user. That
  // could be expanded to remote servers if we add a way to get the social
  // api url related to a specific currency.
  if (!account.member) {
    await store.dispatch("members/loadList", {
      group,
      filter: {
        account: account.id
      },
      include: "group",
      onlyResources: true
    })
  }
}

