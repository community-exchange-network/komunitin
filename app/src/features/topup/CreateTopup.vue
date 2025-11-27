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
              :hint="t('topupAmountToDepositHint')"
              outlined
              required
              :rules="[
                () => amountToDeposit !== undefined || t('topupErrorInvalidAmount'),
                () => amountToDeposit >= minAmount || t('topupErrorMinAmount', {amount: minAmount / 100}),
                () => maxAmount === false || amountToDeposit <= maxAmount || t('topupErrorMaxAmount', {amount: maxAmount / 100})
              ]"
            >
              <template #append>
                <span class="text-h6 text-onsurface-m">{{ settings.depositCurrency }}</span>
              </template>
            </q-input>
            <q-input
              :model-value="formatCurrency(amountToReceive, myCurrency)"
              :label="t('topupAmountToReceive')"
              :hint="t('topupAmountToReceiveHint')"
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
            <div class="text-subtitle1">{{ t('topupDisclaimerHeaader') }}</div>
            <div class="text-onsurface-m" v-html="md2html(t('topupDisclaimerText'))" />
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
            <q-card flat bordered class="q-pa-md">
              <div class="q-gutter-y-md">
                <div class="row items-center justify-between">
                  <span class="text-body2 text-onsurface-m">{{ t('topupAmountToDeposit') }}</span>
                  <span class="text-h6 text-weight-medium text-onsurface">
                    {{ (amountToDeposit / 100).toLocaleString(locale, {
                      style: 'currency',
                      currency: settings.depositCurrency,
                      currencyDisplay: 'symbol'
                    }) }}
                  </span>
                </div>
                <q-separator />
                <div class="row items-center justify-between">
                  <span class="text-body2 text-onsurface-m">{{ t('topupAmountToReceive') }}</span>
                  <span class="text-h6 text-weight-medium text-primary">
                    {{ formatCurrency(amountToReceive, myCurrency) }}
                  </span>
                </div>
              </div>
            </q-card>
            
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
import { useTopup, useTopupSettings } from './useTopup';

import PageHeader from '../../layouts/PageHeader.vue';
import { QInput } from 'quasar';
import KError, { KErrorCode } from '../../KError';
import { useLocale } from '../../boot/i18n';
import md2html from '../../plugins/Md2html';
import { useRouter } from 'vue-router';

const { t } = useI18n()
const store = useStore()

defineProps<{
  code: string,
  memberCode: string,
}>()

const myAccount = computed(() => store.getters.myAccount)
const myCurrency = computed(() => myAccount.value.currency)

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

const {create, cancel, start, amountToReceive, isLoading, topup} = useTopup({
  account: myAccount,
  amountToDeposit,
})

const settings = useTopupSettings(myAccount)
const minAmount = settings.value.minAmount
const maxAmount = settings.value.maxAmount === false ? false : settings.value.maxAmount

const router = useRouter()

const checkout = async () => {
  // 1. create the topup
  await create()
  // 2. check that topup receive amount is the same as expected
  if (topup.value.attributes.receiveAmount < amountToReceive.value) {
    await cancel()
    throw KError.getKError(KErrorCode.UnknownScript)
  }
  // 3. create payment link
  await start()
  // 4. check that we have a checkout URL
  if (!topup.value.attributes.paymentData.checkoutUrl) {
    throw KError.getKError(KErrorCode.UnknownServer)
  }
  // redirect to the payment URL
  const redirectUrl = topup.value.attributes.paymentData.checkoutUrl
  router.push(redirectUrl)
  // after payment is completed, the payment provider will redirect back to our app
  // to /topup
}

const amountRef = ref<InstanceType<typeof QInput>>()

const locale = useLocale()

const next = () => {
  switch (step.value) {
    case 'form':
      if (amountRef.value.hasError) {
        amountRef.value.focus()
        throw KError.getKError(KErrorCode.InvalidAmount)
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