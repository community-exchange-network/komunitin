<template>
  <div class="q-gutter-y-lg">
    <div>
      <div class="text-subtitle1">
        {{ t('topupSettings') }}
      </div>
      <div class="text-onsurface-m">
        {{ t('topupSettingsText') }}
      </div>
    </div>
    <template v-if="account">
      <div class="text-body2 q-ml-md">{{t('topupSourceAccount') }}</div>
      <q-item class="q-mt-sm">
        <account-item-content
          :account="account"
        />
        <q-item-section side>  
          <div
            class="col currency text-h6"
            :class="account.attributes.balance >= 0
                ? 'positive-amount'
                : 'negative-amount'
            "
          >
            {{
              formatCurrency(
                account.attributes.balance,
                currency
              )
            }}
          </div>
        </q-item-section>
      </q-item>
    </template>
    
    <toggle-item
      v-model="enabled"
      :label="t('topupEnable')"
      :hint="t('topupEnableHint')"
      :disable="!isSuperadmin"
    />
    
    <toggle-item
      v-model="defaultAllowTopup"
      :label="t('topupDefaultAllowTopup')"
      :hint="t('topupDefaultAllowTopupHint')"
    />

    <q-input
      v-model="depositCurrency"
      :label="t('topupDepositCurrency')"
      outlined
      readonly
      required
    />

    <q-input
      v-model="paymentProvider"
      :label="t('topupPaymentProvider')"
      outlined
      readonly
      required
    />

    <q-input
      v-model="rateInput"
      type="text"
      :label="t('topupRate')"
      :hint="t('topupRateHint', {
        depositCurrency: depositCurrency,
        receiveCurrency: currency.attributes.symbol
      })"
      outlined
      required
      :rules="[(val: string) => /^\d+(\/\d+)?$/.test(val) || t('topupRateInvalid')]"
      hide-bottom-space
    >
      <template #append>
        {{currency.attributes.symbol}} / {{ depositCurrency }}
      </template>
    </q-input>

    <q-input
      v-model="minAmountInput"
      :label="t('topupMinAmount')"
      :hint="t('topupMinAmountHint')"
      outlined
      required
    >
      <template #append>
        {{ depositCurrency }}
      </template>
    </q-input>

    <q-input
      v-model="maxAmountInput"
      :label="t('topupMaxAmount')"
      :hint="t('topupMaxAmountHint')"
      outlined
      required
    >
      <template #append>
        {{ depositCurrency }}
      </template>
    </q-input>

    <q-input
      v-model="mollieApiKey"
      :label="t('topupMollieApiKey')"
      :hint="t('topupMollieApiKeyHint')"
      outlined
      type="password"
    />
      

  </div>
</template>

<script setup lang="ts">
import { watchDebounced } from '@vueuse/shared';
import type { DeepPartial } from 'quasar';
import ToggleItem from 'src/components/ToggleItem.vue';
import type { TopupSettings } from 'src/features/topup/model';
import formatCurrency from 'src/plugins/FormatCurrency';
import { computed, ref } from 'vue';
import { useStore } from 'vuex';
import AccountItemContent from '../../components/AccountItemContent.vue';
import type { Account, Currency } from '../../store/model';
import { useResource } from '../../composables/useResources';
import { useI18n } from 'vue-i18n';
import { gcd } from '../../utils/arithmetic';

const props = defineProps<{
  topupSettings: TopupSettings,
  currency: Currency,
  updatingTopupSettings: boolean
}>()

const emit = defineEmits<{
  (e: 'update:topup-settings', value: DeepPartial<TopupSettings>): void
}>()

const { t } = useI18n()

const store = useStore()

const isSuperadmin = computed(() => store.getters.isSuperadmin)

const {resource: account} = useResource<Account>('accounts', {
  group: props.currency.attributes.code,
  id: props.topupSettings.attributes.sourceAccountId
})

const enabled = ref(props.topupSettings.attributes.enabled)
const defaultAllowTopup = ref(props.topupSettings.attributes.defaultAllowTopup)
const depositCurrency = ref(props.topupSettings.attributes.depositCurrency)
const paymentProvider = ref(props.topupSettings.attributes.paymentProvider)
const rate = ref(props.topupSettings.attributes.rate)

const rateInput = computed({
  get: () => {
    const n = rate.value.n * 100
    const d = rate.value.d * 10 ** props.currency.attributes.scale
    const g = gcd(n, d)
    return `${n / g}/${d / g}`
  },
  set: (val: string) => {
    const parts = val.split('/')
    const n = (parseInt(parts[0]) || 1) * 10 ** props.currency.attributes.scale
    const d = (parts.length > 1 ? (parseInt(parts[1]) || 1) : 1) * 100
    const g = gcd(n, d)
    rate.value = {
      n: n / g,
      d: d / g
    }
  }
})

const minAmount = ref(props.topupSettings.attributes.minAmount)
const minAmountInput = computed({
  get: () => {
    return minAmount.value / 100
  },
  set: (val: string) => {
    const num = parseFloat(val)
    minAmount.value = isNaN(num) ? 0 : num * 100
  }
})
const maxAmount = ref(props.topupSettings.attributes.maxAmount)
const maxAmountInput = computed({
  get: () => {
    return typeof maxAmount.value === 'number' ? maxAmount.value / 100 : ''
  },
  set: (val: string) => {
    const num = parseFloat(val)
    maxAmount.value = isNaN(num) ? false : num * 100
  }
})

const mollieApiKey = ref('')

watchDebounced([enabled, defaultAllowTopup, rateInput, minAmount, maxAmount, mollieApiKey], () => {
  const attributes: Partial<TopupSettings["attributes"]> = {
      enabled: enabled.value,
      defaultAllowTopup: defaultAllowTopup.value,
      rate: rate.value,
      minAmount: minAmount.value,
      maxAmount: maxAmount.value,
  }
  if (mollieApiKey.value) {
    attributes.mollieApiKey = mollieApiKey.value
  }
  emit('update:topup-settings', {
    id: props.topupSettings.id,
    type: "topup-settings",
    attributes
  } as DeepPartial<TopupSettings>)
})

</script>
<style lang="scss" scoped>
.text-overline {
  margin-bottom: -16px;
}
</style>
