<template>
  <q-select
    ref="field"
    v-model="account"
    :options="options"
    use-input
    :option-disable="isAccountDisabled"
    :loading="loading"
    :input-debounce="0"
    input-style="position: absolute"
    @input-value="searchText = $event"
    @virtual-scroll="onScroll"
    @popup-show="popupOpened = true"
    @popup-hide="popupOpened = false"
    @keydown.backspace="account = undefined"
  >
    <template #option="{itemProps, opt}">
      <account-header
        v-bind="itemProps"
        :account="opt"
        to=""
      />
    </template>
    <template #selected>
      <account-header
        v-if="account && !popupOpened && searchText === ''"
        :account="account"
        to=""
      />
    </template>
    <template #before-options>
      <select-group-expansion
        v-if="changeGroup"
        v-model="group"
        :payer="payer"
      />
    </template>
    <template #no-option>
      <select-group-expansion
        v-if="changeGroup"
        v-model="group"
        :payer="payer"
      />
      <div 
        style="position: relative; min-height: 140px;"
      >
        <div 
          class="text-onsurface-m q-pa-lg"
          style="position: absolute"
        >
          {{ noOptionsText }}
        </div>
      </div>
    </template>
  </q-select>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { Account, Currency, Group, Member } from 'src/store/model';
import AccountHeader from './AccountHeader.vue';
import SelectGroupExpansion from './SelectGroupExpansion.vue';
import { useStore } from 'vuex'
import { QSelect } from 'quasar';
import { watchDebounced } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { normalizeAccountCode } from 'src/plugins/FormatCurrency';

type ExtendedAccount = Account & {member?: ExtendedMember & {group: Group}, currency?: Currency}
type ExtendedMember = Member & {account?: ExtendedAccount }
type ExtendedGroup = Group & {currency: Currency}

const props = defineProps<{
  modelValue?: ExtendedAccount|undefined,
  code: string,
  payer: boolean
  lazy?: boolean
  accountDisabled?: (account: Account) => boolean
  changeGroup?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ExtendedAccount|undefined): void
}>()

const field = ref<QSelect>()
const loading = ref(false)
const popupOpened = ref(false)

const account = computed<ExtendedAccount|undefined>({
  get: () => props.modelValue,
  set: (v: ExtendedAccount|undefined) => emit('update:modelValue', v)
})
const store = useStore()


const myGroup = computed<ExtendedGroup>(() => store.getters.myMember?.group)
const group = ref<ExtendedGroup>(props.modelValue?.member?.group as ExtendedGroup ?? myGroup.value)

const searchText = ref("")

// Not all groups allow us to list their members.
// We know that (quite indirectly) by checking the existence of the
// related link in the "members" relationship of the group.
const canListMembers = computed(() => {
  return group.value && (group.value.id === myGroup.value.id || group.value.relationships?.members?.links?.related)
})

// Current queried list of members.
const members = computed(() => store.getters["members/currentList"])
// Current displayed list of options.
const options = ref<ExtendedAccount[]>([])

watch(members, (members) => {
  // When the user types and this component fetches a new query, the result
  // is null while waiting for the response. We only update the options list
  // when we have a valid response (empty array included).

  // We need to add the canListMembers in order to update the options list
  // after returning async request when switching to a group that doesn't allow 
  // listing members.
  if (canListMembers.value) {
    if (members) {
      options.value = members.map((member: ExtendedMember) => member.account)
    } else if (searchText.value !== "") {
      // This is the case when the cache is empty for this particular search.
      // We do a local search among the current options while waiting for the
      // server response.
      options.value = options.value.filter((account) => 
        ((account.attributes.code.toLowerCase() + " " + account.member?.attributes.name.toLowerCase()).includes(searchText.value.toLowerCase()))
      )
    }
  }
}, {immediate: true})

const currentAccount = computed(() => store.getters["accounts/current"])
watch(currentAccount, (currentAccount) => {
  if (!canListMembers.value && searchText.value !== "") {
    options.value = currentAccount ? [currentAccount] : []
  }
})

// After updating the options list, focus the first one if we've searched something
watch(options, async (options) => {
  if (searchText.value !== "" && options.length > 0) {
    // This setTimeout is hacky indeed, but it is the only way I've found to
    // do it after the option list in the select field is updated.
    setTimeout(() => {
      // Unselect and move to skip disabled options.
      field.value?.setOptionIndex(-1)
      field.value?.moveOptionSelection(1)
    }, 10)
  }
})

const fetchExternalAccountByCode = async (search?: string) => {
  if (!search || search === "") {
    // For some unknown reason, when changing the group, the account.value is not
    // always undefined here. So we check if the selected account has correct group.
    if (account.value && group.value.currency.id === account.value.currency?.id) {
      options.value = [account.value]
    } else {
      options.value = []
    }
  } else {
    const code = normalizeAccountCode(search, group.value.currency)
    const currencyUrl = group.value.relationships.currency.links.related
    const baseUrl = currencyUrl.replace('/currency', '')
    const accountUrl = `${baseUrl}/accounts?filter[code]=${code}`

    await store.dispatch('accounts/load', {
      url: accountUrl,
      group: group.value.currency.attributes.code
    })
  }
}

const fetchResources = async (search?: string) => {
  try {
    loading.value = true
    if (canListMembers.value) {
      await store.dispatch("members/loadList", {
        search,
        include: "account",
        group: group.value.attributes.code,
        cache: 1000*60*5
      })
    } else {
      await fetchExternalAccountByCode(search)
    }
  } finally {
    loading.value = false
  }
}

const loadNextPage = async () => {
  try {
    loading.value = true
    if (store.getters["members/hasNext"]) {
      await store.dispatch("members/loadNext", {
        cache: 1000*60*5
      });
    }
  } finally {
    loading.value = false
  }
}

// Fetch first page when showing the component
if (!props.lazy) {
  onMounted(async () => {
    await fetchResources(props.modelValue?.attributes.code) 
  })
}

// Reactivity idea (to be correctly implemented):
// [search text, group change] => fetch resources => store gets updated (possibly more than once due to cache) => update members => update options
// [scroll down] => fetch next page => store gets updated (again posisbly twice) => update members => update options

// <disabled> [search text] => locally filter options from existing full members list (for a quicker experience) => update options

// Debounced watch for search text
watchDebounced(searchText, async (search) => {
  if (searchText.value !== "") {
    field.value?.showPopup()
  }
  await fetchResources(search !== "" ? search : undefined)
}, { debounce: 300 })

// Immediate watch for group change
watch(group, async (newGroup, oldGroup) => {
  if (newGroup.id !== oldGroup.id) {
    field.value?.setOptionIndex(-1)
    account.value = undefined
    options.value = []
    field.value?.focus()
    await fetchResources(searchText.value !== "" ? searchText.value : undefined) 
  }
})

const onScroll = async({to, direction}: {to:number, direction: string}) => {
  if (!loading.value && canListMembers.value && direction === 'increase' && options.value && to > options.value.length - 10) {
    await loadNextPage()
  }
}

// Show logged in account as disabled.
const myAccount = computed(() => store.getters.myAccount)

const isAccountDisabled = (account: Account) => {
  if (props.accountDisabled) {
    return props.accountDisabled(account)
  } else {
    return account.id == myAccount.value?.id
  }
}

const { t } = useI18n()
const noOptionsText = computed(() => {
  if (loading.value) {
    return t('loading')
  } else if (canListMembers.value) {
    return t('noAccountsFound')
  } else if (searchText.value != "") {
    return t('accountCodeInvalid')
  } else {
    return t('chooseAccountNoListingText', {group: group.value.attributes.name})
  }
})

</script>
<style lang="scss">

</style>