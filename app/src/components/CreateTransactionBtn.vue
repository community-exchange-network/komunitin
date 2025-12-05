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
import { computed, watch } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
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
  () => myMember.value?.attributes.state !== 'active' || myMember.value?.group.attributes.status !== 'active'
)

const actions = ref<FABAction[]>([])

function setAction(enable: boolean, action: Pick<FABAction, 'label' | 'icon' | 'to'>) {
  actions.value = actions.value.filter(a => a.label !== action.label)
  if (enable) {
    actions.value.push({
      ...action,
      color: 'surface',
      textColor: 'primary',
      disable: isDisabled.value
    })
  }
}

watch([showMakePayment, showRequestPayment, showTransfer, myMember],() => {
  setAction(showMakePayment.value, {
    label: t('send'),
    icon: 'arrow_upward',
    to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/transactions/send`,
  })
  setAction(showRequestPayment.value, {
    label: t('receive'),
    icon: 'arrow_downward',
    to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/transactions/receive`,
  })
  setAction(showTransfer.value, {
    label: t('move'),
    icon: 'arrow_forward',
    to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/transactions/transfer`,
  })
}, {immediate: true})

if (process.env.FEAT_TOPUP === 'true') {
  const topupSettings = useTopupSettings()
  const showTopup = computed(
    () => topupSettings.value?.allowTopup
  )
  watch([showTopup, myMember], () => {
    setAction(showTopup.value, {
      label: t('topup'),
      icon: 'add',
      to: `/groups/${myMember.value.group.attributes.code}/members/${myMember.value.attributes.code}/topup`,
    })
  }, {immediate: true})
}
</script>


