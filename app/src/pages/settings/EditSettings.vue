<template>
  <page-header 
    :title="$t('settings')" 
    balance 
    :back="`/groups/${actualCode}/members/${actualMemberCode}`"
  />
  <q-page-container class="row justify-center">
    <q-page 
      padding 
      class="q-py-lg q-px-md col-12 col-sm-8 col-md-6"
    >
      <account-header
        v-if="isAdmin && account"
        class="q-mb-md"
        style="margin-left: -16px"
        :account="account"
        to=""
      />

      <div>
        <div class="text-overline text-uppercase text-onsurface-m q-mb-sm">
          {{ $t('app') }}
        </div>
        <q-select
          v-model="language"
          outlined
          :options="langOptions"
          :label="$t('language')"
        />
      </div>  
      <account-settings-fields
        v-if="accountSettings && currency && defaultSettings"
        v-model:settings="accountSettings"
        v-model:credit-limit="creditLimit"
        v-model:maximum-balance="maximumBalance"
        :credit-limit-loading="creditLimitLoading"
        :maximum-balance-loading="maximumBalanceLoading"

        class="q-pt-md"
        :currency="currency"
        :defaults="defaultSettings"
        :indeterminate-states="isAdmin"
        limits
      />
      <div 
        v-if="effectiveSettings && effectiveSettings.allowTagPayments"
        class="q-mt-lg"
      >
        <div class="text-overline text-uppercase text-onsurface-m q-mb-sm">
          {{ $t('nfcTags') }}
        </div>
        <div class="text-body2 text-onsurface-m q-mb-sm">
          {{ $t('nfcTagsText') }}
        </div>
        <nfc-tags-list
          v-model="tags"
        />
      </div>
      <div class="q-mt-lg">
        <div class="text-overline text-uppercase text-onsurface-m text-bold">
          {{ $t('notifications') }}
        </div>
        <div class="text-body2 text-onsurface-m q-mb-sm">
          {{ $t('notificationsSettingsText') }}
        </div>
        <q-list>
          <toggle-item 
            v-model="notiMyAccount"
            :label="$t('myAccountNotifications')"
            :hint="$t('myAccountNotificationsHint')"
          />
          <toggle-item 
            v-model="notiNeeds"
            :label="$t('needsNotifications')"
          />
          <toggle-item 
            v-model="notiOffers"
            :label="$t('offersNotifications')"
          />
          <toggle-item 
            v-model="notiMembers"
            :label="$t('membersNotifications')"
          />
        </q-list>
      </div>
      <div class="q-mt-lg">
        <div class="text-overline text-uppercase text-onsurface-m text-bold">
          {{ $t('emails') }}
        </div>
        <div class="text-body2 text-onsurface-m q-mb-sm">
          {{ $t('emailsSettingsText') }}
        </div>
        <q-list>
          <toggle-item 
            v-model="emailMyAccount"
            :label="$t('myAccountEmails')"
            :hint="$t('myAccountEmailsHint')"
          />
          <q-item style="padding-left: 12px; padding-right: 12px;">
            <q-item-section>
              <q-item-label>{{ $t('groupEmails') }}</q-item-label>
              <q-item-label caption>{{ $t('groupEmailsHint') }}</q-item-label>
              <q-btn-toggle
                v-model="emailGroup"
                class="q-mt-sm"
                spread
                unelevated
                color="white"
                text-color="primary"
                :options="[
                  {label: $t('weekly'), value: 'weekly', style: 'border: solid 1px var(--q-primary); border-right: none'},
                  {label: $t('monthly'), value: 'monthly', style: 'border: solid 1px var(--q-primary); border-left: none; border-right: none'},
                  {label: $t('never'), value: 'never', style: [
                    // #9E9E9E is 'grey' in Quasar color palette.
                    'border: solid 1px #9E9E9E; border-left: none',
                    emailGroup === 'never' ? 'background-color: #9E9E9E !important; color: white !important;' : 'color: #9E9E9E !important;'
                  ]},
                ]"
              />
            </q-item-section>
          </q-item>
        </q-list>  
      </div>
      <div class="q-mt-lg">
        <div class="text-overline text-uppercase text-onsurface-m text-bold">
          {{ $t('accountStatus') }}
        </div>
        <member-status-field 
          v-if="member"
          :member="member"
        />
      </div>
      <div class="q-mt-lg">
        <div class="text-overline text-uppercase text-onsurface-m text-bold">
          {{ $t('deleteAccount') }}
        </div>
        <div class="text-body2 text-onsurface-m q-mb-sm">
          {{ $t('deleteAccountText') }}
        </div>
        <div class="row justify-right q-mt-md">
          <delete-member-btn
            v-if="member"
            class="q-ml-auto"
            :member="member"
            @delete="() => router.back()"
          />  
        </div>
      </div>
      <save-changes
        ref="changes"
        class="q-my-xl"
      />
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import type { Ref} from 'vue';
import { computed, ref, watch, watchEffect } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import PageHeader from '../../layouts/PageHeader.vue';
import ToggleItem from '../../components/ToggleItem.vue';
import SaveChanges from '../../components/SaveChanges.vue';
import NfcTagsList from '../../components/NfcTagsList.vue';
import AccountHeader from 'src/components/AccountHeader.vue';
import AccountSettingsFields from './AccountSettingsFields.vue';
import DeleteMemberBtn from './DeleteMemberBtn.vue';
import MemberStatusField from './MemberStatusField.vue';

import type {LangName} from "../../i18n";
import langs, { normalizeLocale} from "../../i18n";
import type { AccountSettings, MailingFrequency, AccountTag, UserSettings, Member, Account, Group, Currency, CurrencySettings } from '../../store/model';
import type { DeepPartial } from 'quasar';
import { useLocale } from "../../boot/i18n"
import { watchDebounced } from "@vueuse/shared";
import { currencySettingsToAccountSettingsAttributes, useEffectiveSettings } from 'src/composables/accountSettings';
import { useFullMemberByCode } from 'src/composables/fullMember';
import { isEqual } from 'lodash-es';

const props = defineProps<{
  code?: string,
  memberCode?: string
}>()

const store = useStore()
const router = useRouter()

const isAdmin = computed(() => store.getters.isAdmin || store.getters.isSuperadmin)

// Load member & user.
const {user, member} = useFullMemberByCode(() => props.code, () => props.memberCode)

const userSettings = computed(() => user.value?.settings)

const actualCode = computed(() => (member.value as (Member & {group: Group}))?.group.attributes.code)
const actualMemberCode = computed(() => member.value?.attributes.code)

// Load account and settings
const account = ref<Account & {settings: AccountSettings, currency: Currency & {settings: CurrencySettings}}>()
// These are the settings model and not need to be in always in sync with the account.settings
const accountSettings = ref<AccountSettings>()

watch(member, async (member) => {
  if (member && member.relationships.account.data !== null) {
    await store.dispatch("accounts/load", {
      id: member.relationships.account.data.id,
      group: actualCode.value,
      include: "settings,currency,currency.settings"
    })
    account.value = store.getters["accounts/current"]
    accountSettings.value = account.value?.settings
  }
}, {immediate: true})

const currency = computed(() => account.value?.currency)
const currencySettings = computed(() => currency.value?.settings)

const defaultSettings = computed(() => {
  if (currencySettings.value) {
    return {
      attributes: currencySettingsToAccountSettingsAttributes(currencySettings.value)
    }
  } else {
    return undefined
  }
})

const userLanguage = computed(() => {
  const lang = userSettings.value?.attributes.language
  return lang ? normalizeLocale(lang) : undefined
})

const langOptions = computed(() => {
  return (Object.keys(langs) as LangName[]).map((lang: LangName) => ({label: langs[lang].label, value: lang}))
})

const changes = ref<typeof SaveChanges>()

const saveAccountSettings = async (resource: DeepPartial<AccountSettings>) => {
  const fn = () => store.dispatch("account-settings/update", {
    id: account.value?.id,
    group: actualCode.value,
    resource
  })
  await changes.value?.save(fn)
}

const saveUserSettings = async (resource: DeepPartial<UserSettings>) => {
  const fn = () => store.dispatch("user-settings/update", {
    id: user.value?.id,
    group: actualCode.value,
    resource
  })
  await changes.value?.save(fn)
}

// Account settings
const tags = ref()
watchEffect(() => {
  tags.value = accountSettings.value?.attributes.tags ?? undefined
})

const tagsEqual = (a: AccountTag[], b?: AccountTag[] | null) => {
  if (!b) {
    return a.length === 0
  }
  if (a.length !== b.length) {
    return false
  }
  return a.every((tag, i) => tag.id === b[i].id)
}

const settingsEqual = (a: AccountSettings, b: AccountSettings) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {tags: tagsA, ...restA} = a.attributes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {tags: tagsB, ...restB} = b.attributes
  return isEqual(restA, restB)
}

watch([accountSettings, tags], async () => {
  let save = false
  let attributes: Partial<AccountSettings["attributes"]> = {}
  
  if (tags.value !== undefined && !tagsEqual(tags.value, account.value?.settings.attributes.tags)) {
    attributes.tags = tags.value
    save = true
  }
  if (accountSettings.value && account.value && !settingsEqual(accountSettings.value, account.value.settings)) {
    attributes = {
      ...accountSettings.value.attributes,
      ...attributes, // overwrite tags.
    }
    save = true
  }
  if (save) {
    await saveAccountSettings({ attributes })
  }
})

// Credit limit & maximum balance
const saveAccount = async (resource: DeepPartial<Account>, loading: Ref<boolean>) => {
  try {
    loading.value = true
    const fn = () => store.dispatch("accounts/update", {
      id: account.value?.id,
      group: actualCode.value,
      resource
    })
    await changes.value?.save(fn)
  } finally {
    loading.value = false
  }
}


// Credit limit & maximum balance
watch(account, () => {
  if (account.value) {
    creditLimit.value = account.value.attributes.creditLimit
    maximumBalance.value = account.value.attributes.maximumBalance ? account.value?.attributes.maximumBalance : 0
  }
})

const creditLimit = ref<number>()
const creditLimitLoading = ref<boolean>(false)

watch(creditLimit, async () => {
  if (account.value && creditLimit.value !== account.value.attributes.creditLimit) {
    await saveAccount({attributes: {creditLimit: creditLimit.value}}, creditLimitLoading)
  }
})

const maximumBalance = ref<number>()
const maximumBalanceLoading = ref<boolean>(false)

watch(maximumBalance, async () => {
  if (account.value && maximumBalance.value !== (account.value.attributes.maximumBalance ?? 0)) {
    await saveAccount({
      attributes: {
        maximumBalance: maximumBalance.value == 0 ? false : maximumBalance.value
      }
    }, maximumBalanceLoading)
  }
})


// User settings

const language = ref()

const notiMyAccount = ref<boolean>()
const notiNeeds = ref<boolean>()
const notiOffers = ref<boolean>()
const notiMembers = ref<boolean>()

const emailMyAccount = ref<boolean>()
const emailGroup = ref<MailingFrequency>()

watchEffect(() => {
  const lang = userLanguage.value
  language.value = lang ? {label: langs[lang].label, value: lang} : undefined
  
  const notifications = userSettings.value?.attributes.notifications
  notiMyAccount.value = notifications?.myAccount
  notiNeeds.value = notifications?.newNeeds
  notiOffers.value = notifications?.newOffers
  notiMembers.value = notifications?.newMembers

  const emails = userSettings.value?.attributes.emails
  emailMyAccount.value = emails?.myAccount
  emailGroup.value = emails?.group
})

const locale = useLocale()

watchDebounced([language, notiMyAccount, notiNeeds, notiOffers, notiMembers, emailMyAccount, emailGroup], () => {
  const notis = userSettings.value?.attributes.notifications  
  const emails = userSettings.value?.attributes.emails
  if (language.value !== undefined && language.value.value !== userLanguage.value
    || notiMyAccount.value !== undefined && notiMyAccount.value !== notis?.myAccount
    || notiNeeds.value !== undefined && notiNeeds.value !== notis?.newNeeds
    || notiOffers.value !== undefined && notiOffers.value !== notis?.newOffers
    || notiMembers.value !== undefined && notiMembers.value !== notis?.newMembers
    || emailMyAccount.value !== undefined && emailMyAccount.value !== emails?.myAccount
    || emailGroup.value !== undefined && emailGroup.value !== emails?.group) {
    saveUserSettings({
      attributes: {
        language: language.value.value,
        notifications: {
          myAccount: notiMyAccount.value,
          newNeeds: notiNeeds.value,
          newOffers: notiOffers.value,
          newMembers: notiMembers.value
        },
        emails: {
          myAccount: emailMyAccount.value,
          group: emailGroup.value
        }
      }
    })
    // This triggers a language app update if this is the current user.
    if (store.getters.myUser.id === user.value?.id) {
      locale.value = language.value.value
    }
    
  }
}, {debounce: 1000})

const effectiveSettings = useEffectiveSettings(accountSettings, currencySettings)

</script>