<template>  
  <q-form @submit="onSubmit">
    <div>
      <div class="text-subtitle1 q-pb-lg">
        {{ $t('confirmTransaction') }}
      </div>
    </div>
    <transaction-card 
      :transfer="transfer"
    >
      <q-separator inset />
      <q-card-actions class="justify-end q-pa-md">
        <q-btn 
          :label="$t('back')"
          color="primary"
          flat
          padding="xs lg"
          @click="emit('back')"
        />
        <q-btn
          id="confirm-transaction"
          :label="$t('confirm')"
          type="submit"
          color="primary"
          padding="xs lg"
          unelevated
        />
      </q-card-actions>
    </transaction-card>
  </q-form>  
</template>
<script setup lang="ts">
import { useI18n } from "vue-i18n"
import { useRouter } from "vue-router"
import { useStore } from "vuex"
import type { DeepPartial} from "quasar";
import { useQuasar } from "quasar"
import TransactionCard from '../../components/TransactionCard.vue'
import {notifyTransactionState} from "../../plugins/NotifyTransactionState"
import type { Transfer } from "src/store/model"
import KError, { KErrorCode } from "src/KError"
import { onMounted } from "vue"

const props = defineProps<{
  code: string;
  transfer: DeepPartial<Transfer>;
  autoConfirm?: boolean;
}>()

const emit = defineEmits<{
  (e:'back'): void
}>()

const store = useStore()
const router = useRouter()
const quasar = useQuasar()
const {t} = useI18n()

const onSubmit = async () => {
  quasar.loading.show({
    delay: 200
  })

  if (!props.transfer.attributes) {
    throw new KError(KErrorCode.ScriptError, "Transfer attributes are missing")
  }

  try {
    await store.dispatch("transfers/create", {
      group: props.code,
      resource: {
        type: "transfers",
        attributes: {
          ...props.transfer.attributes,
          state: "committed"
        },
        relationships: {
          ...props.transfer.relationships
        }
      }
    });
    const created = store.getters["transfers/current"]
    notifyTransactionState(created.attributes.state as string, t)
    router.push({
      name: "Transaction",
      params: {
        code: props.code,
        transferCode: created.id
      }
    })
  } finally {
    quasar.loading.hide()
  }
}

onMounted(async () => {
  if (props.autoConfirm) {
    await onSubmit()
  }
})

</script>