<template>
  <q-page-sticky
    :expand="true"
    position="bottom"
    :offset="[0, 24]"
    class="row justify-center"
  >
    <div 
      class="row items-stretch q-col-gutter-md justify-center"
    >
      <div
        v-if="showRequestPayment"
        class="btn-col"
      >
        <q-btn
          id="request-payment"
          :disable="isDisabled"
          class="full-width"
          fab
          icon="arrow_downward"
          :color="color"
          :label="$t('receive')"
          :to="`/groups/${myMember.group.attributes.code}/members/${myMember.attributes.code}/transactions/receive`"
        />
      </div>
      <div
        v-if="showMakePayment"
        class="btn-col"
      >
        <q-btn
          id="make-payment"
          :disable="isDisabled"
          class="full-width"
          fab
          icon="arrow_upward"
          :color="color"
          :label="$t('send')"
          :to="`/groups/${myMember.group.attributes.code}/members/${myMember.attributes.code}/transactions/send`"
        />
      </div>
      <div
        v-if="showTransfer"
        class="btn-col"
      >
        <q-btn
          id="make-transfer"
          :disable="isDisabled"
          class="full-width"
          fab
          icon="arrow_forward"
          :color="color"
          :label="$t('move')"
          :to="`/groups/${myMember.group.attributes.code}/members/${myMember.attributes.code}/transactions/transfer`"
        />
      </div>
    </div>
  </q-page-sticky>
</template>
<script lang="ts" setup>
import { useMyAccountSettings } from 'src/composables/accountSettings'
import { computed } from 'vue'
import { useStore } from 'vuex'

const store = useStore()

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
  () => myMember.value?.attributes.state !== 'active'
)

const color = computed(() => isDisabled.value ? 'grey' : 'primary')
</script>
<style lang="scss">
.btn-col {
  min-width: 150px;
}
</style>
<style lang="scss">
/* Fix issue with quasar default CSS*/
.q-btn--fab i.q-icon {
  margin: 0;
  margin-right: 12px;
}
</style>

