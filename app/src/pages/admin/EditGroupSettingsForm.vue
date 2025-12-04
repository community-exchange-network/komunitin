<template>
  <div class="q-gutter-y-lg">
    <div>
      <div class="text-subtitle1">
        {{ $t('signupSettings') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('signupSettingsText') }}
      </div>
    </div>
    <div class="text-overline text-uppercase text-onsurface-m">
      {{ $t('termsOfUse') }}
    </div>
    <toggle-item
      v-model="requireAcceptTerms"
      :label="$t('enableTermsOfUse')"
      :hint="$t('enableTermsOfUseHint')"
    />
    <q-input
      v-model="terms"
      type="textarea"
      :label="$t('termsOfUse')"
      outlined
      autogrow
      :debounce="1000"
      input-style="min-height: 100px;"
    />
    <div class="text-overline text-uppercase text-onsurface-m">
      {{ $t('offersAndNeeds') }}
    </div>
    <q-input
      v-model.number="minOffers"
      type="number"
      :label="$t('minOffers')"
      :hint="$t('minOffersHint')"
      min="0"
      max="5"
      outlined
    />
    <q-input
      v-model.number="minNeeds"
      type="number"
      :label="$t('minNeeds')"
      :hint="$t('minNeedsHint')"
      min="0"
      max="5"
      outlined
    />
    <div class="text-overline text-uppercase text-onsurface-m">
      {{ $t('accountStart') }}
    </div>
    <amount-input
      v-model="defaultInitialCreditLimit"
      :label="$t('initialCredit')"
      :hint="$t('initialCreditHint')"
      :currency="currency"
      outlined
    />
    <amount-input
      v-model="defaultInitialMaximumBalance"
      :label="$t('maximumBalance')"
      :hint="$t('initialMaximumBalanceHint')"
      :currency="currency"
      outlined
    />
    <q-separator class="q-mt-xl" />
    <div class="q-mt-lg">
      <div class="text-subtitle1">
        {{ $t('marketplace') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('marketplaceText') }}
      </div>
    </div>
    <div class="text-overline text-uppercase text-onsurface-m">
      {{ $t('categories') }}
    </div>
    <div class="text-onsurface-m">
      {{ $t('categoriesText') }}
    </div>
    <categories-field
      :categories="categories"
      @update:category="(category: DeepPartial<Category>) => $emit('update:category', category)"
      @create:category="(category: DeepPartial<Category>) => $emit('create:category', category)"
      @delete:category="(category: DeepPartial<Category>) => $emit('delete:category', category)"
    />
    <q-separator class="q-mt-xl" />
    <div class="q-mt-lg">
      <div class="text-subtitle1">
        {{ $t('accountDefaults') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('accountDefaultsText') }}
      </div>
    </div>
    <account-settings-fields
      v-model:settings="accountSettings"
      :currency="currency"
      :limits="false"
    />
    <q-separator />
    <div class="q-mt-lg">
      <div class="text-subtitle1">
        {{ $t('externalPayments') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('externalPaymentsText') }}
      </div>
    </div>
    <div class="text-overline text-uppercase text-onsurface-m">
      {{ $t('settings') }}
    </div>
    <toggle-item
      v-model="enableExternalPayments"
      :label="$t('enableExternalPayments')"
      :hint="$t('enableExternalPaymentsHint')"
    />
    <toggle-item
      v-model="enableExternalPaymentRequests"
      :label="$t('enableExternalPaymentRequests')"
      :hint="$t('enableExternalPaymentRequestsHint')"
    />
    <toggle-item
      v-model="enableCreditCommonsPayments"
      :label="$t('enableCreditCommonsPayments')"
      :hint="$t('enableCreditCommonsPaymentsHint')"
    />
    <toggle-item
      v-model="allowAnonymousMemberList"
      :label="$t('allowAnonymousMemberList')"
      :hint="$t('allowAnonymousMemberListHint')"
    />
    <input-update
      v-model="currencyValue"
      type="text"
      :label="$t('currencyValue')"
      :hint="$t('currencyValueHint')"
      outlined
      required
      :rules="[(val: string) => val.match(/^\d+(\/\d+)?$/) || $t('invalidCurrencyValue')]"
      hide-bottom-space
      :loading="currencyValueLoading"
      disable
    />
    <input-update
      v-model="externalTraderCreditLimit"
      :loading="externalTraderCreditLimitLoading"
    >
      <template #default="{modelValue, updateModelValue}">
        <amount-input
          :model-value="modelValue"
          :currency="currency"
          :label="$t('externalTraderCreditLimit')"
          :hint="$t('externalTraderCreditLimitHint')"
          outlined
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <input-update
      v-model="externalTraderMaximumBalance"
      :loading="externalTraderMaximumBalanceLoading"
    >
      <template #default="{modelValue, updateModelValue}">
        <amount-input
          :model-value="modelValue"
          :currency="currency"
          :label="$t('externalTraderMaximumBalance')"
          :hint="$t('externalTraderMaximumBalanceHint')"
          outlined          
          @update:model-value="updateModelValue"
        />
      </template>
    </input-update>
    <div class="text-overline text-uppercase text-onsurface-m">
      {{ $t('trustlines') }}
    </div>
    <div class="text-onsurface-m">
      {{ $t('trustlinesText') }}
    </div>
    <trustlines-field
      :trustlines="trustlines"
      @update:trustline="$emit('update:trustline', $event)"
      @create:trustline="$emit('create:trustline', $event)"
    />
    <q-separator class="q-mt-xl" />
    <div class="q-mt-lg">
      <div class="text-subtitle1">
        {{ $t('groupStatus') }}
      </div>
      <div class="text-onsurface-m">
        {{ $t('groupStatusText') }}
      </div>
    </div>
    <group-status-field 
      :group="props.group"
    />
    <q-separator class="q-mt-xl" />
  </div>

</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ToggleItem from 'src/components/ToggleItem.vue';
import InputUpdate from 'src/components/InputUpdate.vue';
import AmountInput from 'src/components/AmountInput.vue';
import TrustlinesField from './TrustlinesField.vue';
import CategoriesField from './CategoriesField.vue';
import AccountSettingsFields from 'src/pages/settings/AccountSettingsFields.vue';
import GroupStatusField from './GroupStatusField.vue';
import type { Group, GroupSettings, Currency, CurrencySettings, Trustline, Category, AccountSettings } from 'src/store/model';
import { watchDebounced } from '@vueuse/shared';
import type { DeepPartial } from 'quasar';
import { accountSettingsToCurrencySettingsAttributes, currencySettingsToAccountSettingsAttributes } from 'src/composables/accountSettings';


const props = defineProps<{
  group: Group,
  groupSettings: GroupSettings,
  categories: Category[],
  currency: Currency,
  currencySettings: CurrencySettings,
  trustlines: Trustline[],

  updatingGroupSettings: boolean,
  updatingCategory: boolean,
  updatingCurrency: boolean,
  updatingCurrencySettings: boolean,
  updatingTrustline: boolean
}>()

const groupSettings = computed(() => props.groupSettings)
const currency = computed(() => props.currency)
const currencySettings = computed(() => props.currencySettings)
const trustlines = computed(() => props.trustlines)

const emit = defineEmits<{
  (e: 'update:group-settings', value: DeepPartial<GroupSettings>): void
  (e: 'update:currency', value: DeepPartial<Currency>): void
  (e: 'update:currency-settings', value: DeepPartial<CurrencySettings>): void
  (e: 'update:trustline', value: DeepPartial<Trustline>): void
  (e: 'create:trustline', value: DeepPartial<Trustline>): void
  (e: 'update:category', value: DeepPartial<Category>): void
  (e: 'create:category', value: DeepPartial<Category>): void
  (e: 'delete:category', value: DeepPartial<Category>): void
}>()

// Social API

const requireAcceptTerms = ref(groupSettings.value.attributes.requireAcceptTerms ?? false)
const terms = ref(groupSettings.value.attributes.terms ?? "")
const minOffers = ref(groupSettings.value.attributes.minOffers ?? 0)
const minNeeds = ref(groupSettings.value.attributes.minNeeds ?? 0)
const allowAnonymousMemberList = ref(groupSettings.value.attributes.allowAnonymousMemberList ?? false)

watchDebounced([requireAcceptTerms, terms, minOffers, minNeeds, allowAnonymousMemberList], () => {
  emit('update:group-settings', {
    ...groupSettings.value,
    attributes: {
      requireAcceptTerms: requireAcceptTerms.value,
      terms: terms.value,
      minOffers: minOffers.value,
      minNeeds: minNeeds.value,
      allowAnonymousMemberList: allowAnonymousMemberList.value
    }
  } as DeepPartial<GroupSettings>)
})

// Accounting API

// This ref selects the loading spinner
const lastCurrencySettingsUpdate = ref<"rate"|"settings"|"externalTraderCreditLimit"|"externalTraderMaximumBalance">()

// Currency

const currencyValue = ref(currency.value.attributes.rate.n + "/" + currency.value.attributes.rate.d)
const currencyValueLoading = computed(() => lastCurrencySettingsUpdate.value === "rate" && props.updatingCurrency)

watchDebounced(currencyValue, (value) => {
  lastCurrencySettingsUpdate.value = "rate"
  const [n,d] = value.split("/")
  emit('update:currency', {
    ...currency.value,
    attributes: {
      rate: {
        n: parseInt(n),
        d: parseInt(d)
      }
    }
  } as DeepPartial<Currency>)
})

// Currency settings

// We create a fake account settings object to use the AccountSettingsFields component
// for the account defaults section.
const accountSettings = ref({
  attributes: currencySettingsToAccountSettingsAttributes(currencySettings.value)
} as AccountSettings)

const vals = currencySettings.value.attributes
const defaultInitialCreditLimit = ref(vals.defaultInitialCreditLimit ?? 0)
const defaultInitialMaximumBalance = ref(vals.defaultInitialMaximumBalance ?? 0)
const enableExternalPayments = ref(vals.enableExternalPayments ?? false)
const enableExternalPaymentRequests = ref(vals.enableExternalPaymentRequests ?? false)
const enableCreditCommonsPayments = ref(vals.enableCreditCommonsPayments ?? false)

watchDebounced([accountSettings, defaultInitialCreditLimit, defaultInitialMaximumBalance, enableExternalPayments, enableExternalPaymentRequests, enableCreditCommonsPayments], () => {
  lastCurrencySettingsUpdate.value = "settings"

  const accountDefaults = accountSettingsToCurrencySettingsAttributes(accountSettings.value)

  const attributes = {
    ...accountDefaults,
    defaultInitialCreditLimit: defaultInitialCreditLimit.value,
    defaultInitialMaximumBalance: defaultInitialMaximumBalance.value,
    enableExternalPayments: enableExternalPayments.value,
    enableExternalPaymentRequests: enableExternalPaymentRequests.value,
    enableCreditCommonsPayments: enableCreditCommonsPayments.value,
  }

  emit('update:currency-settings', {
    id: currencySettings.value.id,
    type: "currency-settings",
    attributes
  })
})

// These two settings are updated separately because they imply a stellar transaction so
// they deserve a different UX (click to, show spinner).
const externalTraderCreditLimit = ref(vals.externalTraderCreditLimit ?? 0)
const externalTraderMaximumBalance = ref(vals.externalTraderMaximumBalance ?? 0)

watch(externalTraderCreditLimit, (value) => {
  lastCurrencySettingsUpdate.value = "externalTraderCreditLimit"
  emit('update:currency-settings', {
    id: currencySettings.value.id,
    type: "currency-settings",
    attributes: {
      externalTraderCreditLimit: value
    }
  })
})


const externalTraderCreditLimitLoading = computed(() => lastCurrencySettingsUpdate.value === "externalTraderCreditLimit" && props.updatingCurrencySettings)

watch(externalTraderMaximumBalance, (value) => {
  lastCurrencySettingsUpdate.value = "externalTraderMaximumBalance"
  emit('update:currency-settings', {
    id: currencySettings.value.id,
    type: "currency-settings",
    attributes: {
      externalTraderMaximumBalance: value
    }
  })
})
const externalTraderMaximumBalanceLoading = computed(() => lastCurrencySettingsUpdate.value === "externalTraderMaximumBalance" && props.updatingCurrencySettings)

</script>
<style lang="scss" scoped>
.text-overline {
  margin-bottom: -16px;
}
</style>