<template>
  <page-header 
    :title="t('topupTitle')" 
    balance 
    :back="`/groups/${code}/members/${memberCode}/transactions`"
  />
  <q-page-container>
    <q-page>
      <div class="row justify-center">
        <div class="q-py-lg q-px-md col-12 col-sm-8 col-md-6">
          <div v-if="step === 'form'" class="q-gutter-y-lg column">
            <div class="text-subtitle1">{{t('topupFormHeader')}}</div>
            <div class="text-onsurface-m">{{t('topupFormText')}}</div>
            <q-input
              ref="amountRef"
              v-model="amountToDepositInput"
              :label="t('topupAmountToDeposit')"
              :hint="t('topupAmountToDepositHint', {currency: settings.depositCurrency})"
              outlined
              required
              :rules="[
                () => amountToDeposit !== undefined || t('ErrorInvalidAmount'),
                () => amountToDeposit >= minAmount || t('topupErrorMinAmount', {amount: minAmount / 100}),
                () => maxAmount === false || amountToDeposit <= maxAmount || t('topupErrorMaxAmount', {amount: maxAmount / 100})
              ]"
            >
              <template #append>
                <span class="text-h6 text-onsurface-m">{{ settings.depositCurrency }}</span>
              </template>
            </q-input>
            <q-input
              :model-value="formatCurrency(amountToReceive, myCurrency, {symbol: false})"
              :label="t('topupAmountToReceive')"
              :hint="t('topupAmountToReceiveHint', {currency: myCurrency.attributes.namePlural})"
              outlined
              readonly
            >
              <template #append>
                <span class="text-h6 text-onsurface-m">{{ myCurrency.attributes.symbol }}</span>
              </template>
            </q-input>
            <q-btn
              :label="t('next')"
              type="submit"
              color="primary"
              unelevated
              @click="next"
            />
          </div>
          <div v-if="step === 'disclaimer'" class="q-gutter-y-lg column">
            <div class="text-subtitle1">{{ t('topupDisclaimerHeader') }}</div>
            <div class="text-onsurface-m" v-html="md2html(t('topupDisclaimerText',{
              group: myGroup.attributes.name,
              communityCurrency: myCurrency.attributes.namePlural,
              depositCurrency: settings.depositCurrency
            }))" />
            <div class="row q-gutter-sm">
              <q-btn
                class="col"
                :label="t('back')"
                flat
                color="primary"
                @click="back"
              />
              <q-btn
                :label="t('topupAcceptDisclaimer')"
                type="submit"
                color="primary"
                unelevated
                class="col"
                @click="next"
              />
            </div>
          </div>
          <div v-if="step === 'confirmation'" class="q-gutter-y-lg column">
            <div class="text-subtitle1">{{ t('topupCheckoutHeader') }}</div>
            <div class="text-onsurface-m">{{ t('topupCheckoutText') }}</div>
            <topup-card :topup="topup" :account="myAccount" />
            <div class="row q-gutter-sm">
              <q-btn
                :label="t('back')"
                color="primary"
                flat
                class="col"
                @click="back"
                :disable="isLoading"
              />
              <q-btn
                :label="t('checkout')"
                color="primary"
                unelevated
                class="col"
                @click="checkout"
                :loading="isLoading"
              />
            </div>
          </div>
        </div>
      </div>
    </q-page>
  </q-page-container>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useStore } from "vuex"
import formatCurrency from '../../plugins/FormatCurrency';
import { computed, ref } from 'vue';
import { useCreateTopup, useTopupSettings } from './useTopup';

import PageHeader from '../../layouts/PageHeader.vue';
import { QInput } from 'quasar';
import KError, { KErrorCode } from '../../KError';
import md2html from '../../plugins/Md2html';
import TopupCard from './TopupCard.vue';

const { t } = useI18n()
const store = useStore()

defineProps<{
  code: string,
  memberCode: string,
}>()

const myAccount = computed(() => store.getters.myAccount)
const myCurrency = computed(() => myAccount.value.currency)
const myGroup = computed(() => store.getters.myMember?.group)

const step = ref('form')

const amountToDepositInput = ref<string>('')

const amountToDeposit = computed(() => {
  const val = parseFloat(amountToDepositInput.value.replace(',', '.'))
  if (!isNaN(val)) {
    return Math.floor(val * 100);
  } else {
    return 0;
  }
})

const {create, cancel, start, amountToReceive, isLoading, topup} = useCreateTopup({
  account: myAccount,
  amountToDeposit,
})

const settings = useTopupSettings(myAccount)
const minAmount = computed(() => settings.value?.minAmount ?? 0)
const maxAmount = computed(() => (settings.value?.maxAmount === false ? false : settings.value?.maxAmount) ?? false)

const checkout = async () => {
  // 1. create the topup
  await create()
  // 2. check that topup receive amount is the same as expected
  if (topup.value.attributes.receiveAmount < amountToReceive.value) {
    await cancel()
    throw new KError(KErrorCode.UnknownScript)
  }
  // 3. create payment link
  await start()
  // 4. check that we have a checkout URL
  if (!topup.value.attributes.paymentData?.checkoutUrl) {
    throw new KError(KErrorCode.UnknownServer)
  }
  // redirect to the payment URL
  const redirectUrl = topup.value.attributes.paymentData.checkoutUrl
  window.location.href = redirectUrl
  
  // after payment is completed, the payment provider will redirect back to our app
  // to /topup
}

const amountRef = ref<InstanceType<typeof QInput>>()

const next = () => {
  switch (step.value) {
    case 'form':
      amountRef.value.validate()
      if (amountRef.value.hasError) {
        amountRef.value.focus()
        throw new KError(KErrorCode.InvalidAmount)
      } else {
        step.value = 'disclaimer'
        break
      }
    case 'disclaimer':
      step.value = 'confirmation'
      break
    
  }
}

const back = () => {
  switch (step.value) {
    case 'disclaimer':
      step.value = 'form'
      break
    case 'confirmation':
      step.value = 'disclaimer'
      break
  }
}


</script>