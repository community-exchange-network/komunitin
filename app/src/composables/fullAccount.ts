import { MaybeRefOrGetter, toValue } from "@vueuse/core"
import { Account, AccountSettings, Currency, CurrencySettings, ExtendedAccount, RelatedResource } from "src/store/model"
import { ref, watchEffect } from "vue"
import { useStore } from "vuex"
import { LoadByUrlPayload } from "../store/resources"

export type ExtendedAccountWithSettings = ExtendedAccount & { settings: AccountSettings, currency: Currency & { settings: CurrencySettings } }

const useFullAccountByMemberCode = (groupCode: MaybeRefOrGetter<string>, memberCode: MaybeRefOrGetter<string|undefined>) => {
  
  const store = useStore()
  const account = ref<ExtendedAccountWithSettings>()

  watchEffect(async () => {
    const memberCodeStr = toValue(memberCode)
    const groupCodeStr = toValue(groupCode)

    if (!memberCodeStr) {
      account.value = undefined
      return
    }
    // Try get member from cache
    const member = account.value = store.getters["members/find"]({code: memberCodeStr})
    if (member && member.group && member.account) {
      account.value = member.account
    } else if (!member || !member.group || !member.account) {
      // Load account from server
      await store.dispatch("members/load", {
        code: memberCodeStr,
        group: groupCodeStr,
        include: "account,group",
      })
      account.value = store.getters["members/find"]({code: memberCodeStr}).account
    }
    // Load account settings
    if (account.value && !account.value.settings) {
      await store.dispatch("account-settings/load", {
        url: account.value.relationships.settings?.links.related
      } as LoadByUrlPayload)
    }
    // We don't really need to fetch the currency and currency settings here because
    // they are always the local currency which is already loaded.

  })

  return account
}

const useCreateTransferAccount = (groupCode: string, memberCode: string|undefined, direction: "send"|"receive"|"transfer", checkDirection: "send"|"receive") => {
  if (direction === checkDirection) {
    if (memberCode) {
      const account = useFullAccountByMemberCode(groupCode, memberCode)
      return account
    } else {
      const store = useStore()
      return ref<ExtendedAccountWithSettings>(store.getters.myAccount)
    }
  } else {
    return ref<ExtendedAccountWithSettings>()
  }
}

/**
 * Get the implicit payer account in a transfer operation. It returns an undefined reference if
 * there is no such account. Specifically, if the direction is "receive" or "transfer", since there
 * is no implicit payer (needs to be selected by the user), this function will return an undefined
 * reference. If otherwise the direction is "send", it will return the account specified by the codes
 * provided or the current user's account if no member code is provided.
 */
export const useCreateTransferPayerAccount = (groupCode: string, memberCode: string|undefined, direction: "send"|"receive"|"transfer") => {
  return useCreateTransferAccount(groupCode, memberCode, direction, "send")
}
/**
 * Get the implicit payer account in a transfer operation.
 * { @see useCreateTransferPayerAccount }
 */
export const useCreateTransferPayeeAccount = (groupCode: string, memberCode: string|undefined, direction: "send"|"receive"|"transfer") => {
  return useCreateTransferAccount(groupCode, memberCode, direction, "receive")
}

/**
 * HElper function for creating the transfer relationships object frm the account resources objects.
 */
export const transferAccountRelationships = (payer: Account|undefined, payee: Account|undefined, myCurrency: Currency) => {
  const accountRelationship = (account: Account) => {
    const relationship = {data: {type: "accounts", id: account.id}} as RelatedResource
    if (account.relationships.currency.data.id !== myCurrency.id) {
      relationship.data.meta = {
        external: true,
        href: account.links.self
      }
    }
    return relationship
  }

  const relationships = {
    ...(payer ? { payer: accountRelationship(payer)} : {}),
    ...(payee ? { payee: accountRelationship(payee)} : {}),
    
  }
  return relationships
}