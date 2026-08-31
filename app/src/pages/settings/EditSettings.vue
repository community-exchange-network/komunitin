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

      <div v-if="isSelf">
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

        <notifications-banner
          v-if="isSelf"
          ref="notifications-banner"
          :dismissable="false"
          class="q-my-md inline-banner"
          rounded
        />
        
        <q-list>
          <toggle-item 
            v-model="notiMyAccount"
            :label="$t('myAccountNotifications')"
            :hint="$t('myAccountNotificationsHint')"
            :disable="disableNotificationControls"
          />
          <toggle-item 
            v-model="notiGroup"
            :label="$t('groupNotifications')"
            :hint="$t('groupNotificationsHint')"
            :disable="disableNotificationControls"
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
          <toggle-btn-item
            v-model="emailGroup"
            :label="$t('groupEmails')"
            :caption="$t('groupEmailsHint')"
            :options="[
              { label: $t('weekly'), value: 'weekly'},
              { label: $t('monthly'), value: 'monthly'},
              { label: $t('never'), value: 'never', off: true},
            ]"
          />
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
import { computed, ref, useTemplateRef, watch, watchEffect } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import PageHeader from '../../layouts/PageHeader.vue';
import ToggleItem from '../../components/ToggleItem.vue';
import ToggleBtnItem from '../../components/ToggleBtnItem.vue';
import SaveChanges from '../../components/SaveChanges.vue';
import NfcTagsList from '../../components/NfcTagsList.vue';
import NotificationsBanner from 'src/components/NotificationsBanner.vue';
import AccountHeader from 'src/components/AccountHeader.vue';
import AccountSettingsFields from './AccountSettingsFields.vue';
import DeleteMemberBtn from './DeleteMemberBtn.vue';
import MemberStatusField from './MemberStatusField.vue';

import type {LangName} from "../../i18n";
import langs, { normalizeLocale} from "../../i18n";
import type { AccountSettings, MailingFrequency, AccountTag, MemberUser, User, Account, Currency, CurrencySettings } from '../../store/model';
import type { DeepPartial } from 'quasar';
import { useLocale } from "../../boot/i18n"
import { watchDebounced } from "@vueuse/shared";
import { currencySettingsToAccountSettingsAttributes, useEffectiveSettings } from 'src/composables/accountSettings';
import { useResource } from 'src/composables/useResources';
import { useEditableMember, useEditableMemberUser } from 'src/composables/editableMember';
import { isEqual } from 'lodash-es';

const props = defineProps<{
  code?: string,
  memberCode?: string
}>()

const store = useStore()
const router = useRouter()

const isAdmin = computed(() => store.getters.isAdmin || store.getters.isSuperadmin)

type FullAccount = Account & {
  settings: AccountSettings,
  currency: Currency & {settings: CurrencySettings}
}

const myUser = computed<User | undefined>(() => store.getters.myUser)
const { resource: member, isSelf } = useEditableMember(
  () => props.code,
  () => props.memberCode
)

const actualCode = computed(() => member.value?.group.attributes.code)
const actualMemberCode = computed(() => member.value?.attributes.code)
const { resource: memberUser } = useEditableMemberUser(member, isSelf)

const accountId = computed(() => member.value?.relationships.account.data?.id)
const accountOptions = computed(() => ({
  id: accountId.value ?? null,
  group: actualCode.value ?? "",
  include: "settings,currency,currency.settings"
}))
const { resource: account, update: updateAccount } = useResource<FullAccount>("accounts", accountOptions)

const accountSettings = ref<AccountSettings>()
watch(() => account.value?.settings, settings => {
  // Refresh account settings only after full reload.
  if (!settings || settings.id !== accountSettings.value?.id) {
    accountSettings.value = settings
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
  const lang = myUser.value?.attributes.language
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

const saveUser = async (resource: DeepPartial<User>) => {
  const fn = () => store.dispatch("users/update", {
    id: myUser.value?.id,
    group: actualCode.value,
    resource
  })
  await changes.value?.save(fn)
}

const saveMemberUser = async (resource: DeepPartial<MemberUser>) => {
  const fn = () => store.dispatch("member-users/update", {
    id: memberUser.value?.id,
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
    const fn = () => updateAccount(resource)
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


// User and member-user settings

const language = ref()

const notiMyAccount = ref<boolean>()
const notiGroup = ref<boolean>()


const emailMyAccount = ref<boolean>()
const emailGroup = ref<MailingFrequency>()

watchEffect(() => {
  const lang = userLanguage.value
  language.value = lang ? {label: langs[lang].label, value: lang} : undefined
})

watchEffect(() => {
  const notifications = memberUser.value?.attributes.notifications
  notiMyAccount.value = notifications?.myAccount
  notiGroup.value = notifications?.group

  const emails = memberUser.value?.attributes.emails
  emailMyAccount.value = emails?.myAccount
  emailGroup.value = emails?.group
})

const locale = useLocale()

watchDebounced(language, () => {
  if (isSelf.value && language.value !== undefined && language.value.value !== userLanguage.value) {
    saveUser({
      type: "users",
      id: myUser.value?.id,
      attributes: { language: language.value.value },
    })
    locale.value = language.value.value
  }
}, {debounce: 1000})

watchDebounced([notiMyAccount, notiGroup, emailMyAccount, emailGroup], () => {
  const notis = memberUser.value?.attributes.notifications
  const emails = memberUser.value?.attributes.emails
  if (notiMyAccount.value !== undefined && notiMyAccount.value !== notis?.myAccount
    || notiGroup.value !== undefined && notiGroup.value !== notis?.group
    || emailMyAccount.value !== undefined && emailMyAccount.value !== emails?.myAccount
    || emailGroup.value !== undefined && emailGroup.value !== emails?.group) {
    saveMemberUser({
      type: "member-users",
      id: memberUser.value?.id,
      attributes: {
        notifications: {
          myAccount: notiMyAccount.value,
          group: notiGroup.value,
        },
        emails: {
          myAccount: emailMyAccount.value,
          group: emailGroup.value
        }
      }
    })
  }
}, {debounce: 1000})

const effectiveSettings = useEffectiveSettings(accountSettings, currencySettings)

const notificationsBannerRef = useTemplateRef<InstanceType<typeof NotificationsBanner>>('notifications-banner')
const disableNotificationControls = computed(() => {
  return notificationsBannerRef.value?.show
})

</script>
<style scoped lang="scss">
.inline-banner {
  border: solid 1px $separator-color;
}

</style>
