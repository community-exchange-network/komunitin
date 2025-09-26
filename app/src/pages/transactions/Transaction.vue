<template>
  <div>
    <page-header 
      :title="$t('transaction')"
      :back="`/groups/${code}/members/${myMember?.attributes.code}/transactions`"
      balance
    />
    <q-page-container
      class="row justify-center bg-light"
    >
      <q-page
        v-if="!isLoading"
        padding
        class="q-py-lg q-px-md col-12 col-sm-8 col-md-6"
      >
        <transaction-card :transfer="transfer">
          <div v-if="isPendingMe">
            <q-separator />
            <q-card-actions class="justify-end">
              <q-btn 
                :label="$t('reject')"
                color="primary"
                flat
                padding="xs lg"
                @click="updateTransactionState('rejected')"
              />
              <q-btn
                :label="$t('accept')"
                type="submit"
                color="primary"
                padding="xs lg"
                unelevated
                @click="updateTransactionState('committed')"
              />
            </q-card-actions>  
          </div>
        </transaction-card>
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue"
import { useQuasar } from "quasar"
import { useStore } from "vuex"
import PageHeader from "../../layouts/PageHeader.vue"
import {Transfer, TransferState} from "../../store/model"
import { useI18n } from "vue-i18n"

import TransactionCard from "../../components/TransactionCard.vue"
import { UpdatePayload } from "../../store/action-payloads"
import {notifyTransactionState} from "../../plugins/NotifyTransactionState"
import { useFullTransferById } from "src/composables/fullTransfer"

const props = defineProps<{
  code: string,
  transferCode: string
}>()

const store = useStore()
const { t } = useI18n()
const quasar = useQuasar()

const myAccount = computed(() => store.getters.myAccount)
const myMember = computed(() => store.getters.myMember)

const transferId = computed(() => ({
  group: props.code,
  id: props.transferCode
}))
const {transfer, ready, refresh} = useFullTransferById(transferId)
const isLoading = computed(() => !(ready.value || transfer.value && transfer.value.payee.member && transfer.value.payer.member))
const isPendingMe = computed(() => (transfer.value?.attributes.state == 'pending') && (myAccount.value.id == transfer.value.payer.id))

const updateTransactionState = async(state: TransferState) => {
  try {
    quasar.loading.show({
      delay: 200
    })
    const payload: UpdatePayload<Transfer> = {
      id: props.transferCode,
      group: props.code,
      resource: {
        id: transfer.value.id,
        type: transfer.value.type,
        attributes: {
          state
        }
      } 
    }
    await store.dispatch("transfers/update", payload)
    notifyTransactionState(transfer.value.attributes.state, t)
  } finally {
    quasar.loading.hide()
  }
  // Fetch transfer again so it also updates accounts (and the user balance).
  await refresh()
}
</script>