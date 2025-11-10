<template>
  <floating-btn-menu 
    :actions="actions"
    color="primary"
    :label="t('createTransaction')"
    :disable="isDisabled"
  />
</template>
<script lang="ts" setup>
import FloatingBtnMenu, { type FABAction } from './FloatingBtnMenu.vue'
import { useMyAccountSettings } from 'src/composables/accountSettings'
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'

const store = useStore()
const { t } = useI18n()

const myMember = computed(() => store.getters.myMember)
const settings = useMyAccountSettings()

const showMakePayment = computed(
  // Note that having the tag payments setting enabled (only) does not make this button to show, any other does.
  () => settings.value?.allowPayments && (settings.value?.allowSimplePayments || settings.value?.allowQrPayments || settings.value?.allowMultiplePayments)
)
const showRequestPayment = computed(
  // Note that QR payments don't need the allowPaymentRequests setting since they are actually always performed by the payer.
  () => settings.value?.allowPaymentRequests && (settings.value?.allowSimplePaymentRequests || settings.value.allowMultiplePaymentRequests || settings.value.allowTagPaymentRequests)
        || settings.value?.allowQrPaymentRequests
)
const showTransfer = computed(
  () => store.getters.isAdmin
)
const isDisabled = computed(
  () => myMember.value?.attributes.state !== 'active' || myMember.value?.group.attributes.status !== 'active'
)


const actions = computed<FABAction[]>(() => {
  const acts = []
  if (showMakePayment.value) {
    acts.push({
      label: t('send'),
      icon: 'arrow_upward',
      color: 'surface',
      textColor: 'primary',
      to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/transactions/send`,
      disable: isDisabled.value
    })
  }
  if (showRequestPayment.value) {
    acts.push({
      label: t('receive'),
      icon: 'arrow_downward',
      color: 'surface',
      textColor: 'primary',
      to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/transactions/receive`,
      disable: isDisabled.value
    })
  }
  if (showTransfer.value) {
    acts.push({
      label: t('move'),
      icon: 'arrow_forward',
      color: 'surface',
      textColor: 'primary',
      to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/transactions/transfer`,
      disable: isDisabled.value
    })
  }
  return acts
})
</script>


