<template>
  <floating-btn-menu
    v-if="actions.length > 1" 
    :actions="actions"
    color="primary"
    :label="t('createTransaction')"
    :disable="isDisabled"
  />
  <floating-btn
    v-else-if="actions.length == 1"
    color="primary"
    :icon="actions[0].icon"
    :label="actions[0].label"
    :to="actions[0].to"
    :disable="actions[0].disable"
  />
</template>
<script lang="ts" setup>
import FloatingBtnMenu, { type FABAction } from './FloatingBtnMenu.vue'
import FloatingBtn from './FloatingBtn.vue'
import { useMyAccountSettings } from 'src/composables/accountSettings'
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import { useTopupSettings } from '../features/topup/useTopup'

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
  () => myMember.value?.attributes.status !== 'active' || myMember.value?.group.attributes.status !== 'active'
)

function createAction(label: string, icon: string, path: string) {
  return {
    label,
    icon,
    to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/${path}`,
    color: 'surface',
    textColor: 'primary',
    disable: isDisabled.value
  }
}

const coreActions = computed<FABAction[]>(() => {
  const visibleActions = []

  if (showMakePayment.value) {
    visibleActions.push(createAction(t('send'), 'arrow_upward', 'transactions/send'))
  }
  if (showRequestPayment.value) {
    visibleActions.push(createAction(t('receive'), 'arrow_downward', 'transactions/receive'))
  }
  if (showTransfer.value) {
    visibleActions.push(createAction(t('move'), 'arrow_forward', 'transactions/transfer'))
  }

  return visibleActions
})

let actions = coreActions

if (process.env.FEAT_TOPUP === 'true') {
  const topupSettings = useTopupSettings()
  actions = computed(() => topupSettings.value?.allowTopup
    ? [...coreActions.value, createAction(t('topup'), 'add', 'topup')]
    : coreActions.value
  )
}
</script>
