<template>
  <div class="q-gutter-lg">
    <div>
      <div class="text-subtitle1">
        {{ $t('confirmTransactions') }}
      </div>
    </div>
    <q-list>
      <transaction-item
        v-for="trans in transfers"
        :key="trans"
        :code="code"
        :account="myAccount"
        :transfer="trans"
      />
    </q-list>
    <div class="row justify-end">
      <q-btn
        color="primary"
        :label="$t('back')"
        flat
        padding="xs lg"
        @click="emit('back')"
      />
      <q-btn
        class="q-ml-md"
        color="primary"
        type="submit"
        :label="$t('confirm')"
        name="confirm"
        unelevated
        padding="xs lg"
        @click="onSubmit"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { useStore } from 'vuex';
import { TransferRow } from './CreateTransactionMultiple.vue';
import { computed, ref, watch } from 'vue';
import { Currency, ExtendedAccount, ExtendedTransfer, Transfer, TransferState } from 'src/store/model';
import TransactionItem from 'src/components/TransactionItem.vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { notifyTransactionStateMultiple } from 'src/plugins/NotifyTransactionState';
import { useRouter } from 'vue-router';
import KError, { KErrorCode } from '../../KError';

const props = defineProps<{
  code: string
  rows: TransferRow[],
  payerAccount?: ExtendedAccount,
  payeeAccount?: ExtendedAccount
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

const store = useStore()
const myAccount = computed(() => store.getters.myAccount)
const myCurrency = computed<Currency>(() => myAccount.value.currency)

const transferAmount = (amount: number) => amount * (10 ** myCurrency.value.attributes.scale)

const transfers = ref<ExtendedTransfer[]>([])
watch(() => props.rows, () => {
  transfers.value = props.rows.map(row => {
    const payer = row.payer ?? props.payerAccount
    const payee = row.payee ?? props.payeeAccount
    if (!payer || !payee) {
      throw new KError(KErrorCode.ScriptError, "Payer or payee account not set")
    }
    return {
      type: "transfers",
      attributes: {
        amount: transferAmount(row.amount as number),
        meta: {
          description: row.description,
        },
        created: new Date().toUTCString(),
        updated: new Date().toUTCString(),
        state: "new"
      },
      relationships: {
        payer: { data: { type: "accounts", id: payer.id } },
        payee: { data: { type: "accounts", id: payee.id } }
      },
      payer,
      payee
    } as ExtendedTransfer
  })
}, {immediate: true})

const quasar = useQuasar()
const { t } = useI18n()
const router = useRouter()

const onSubmit = async () => {
  try {
    quasar.loading.show({ delay: 200 })
    // Send all transfers at once. The server will take
    // care of sending the transactions to the Stellar 
    // network using channel accounts for better throughput.
    await store.dispatch("transfers/createList", {
      group: props.code,
      resources: transfers.value.map(t => ({
        type: t.type,
        attributes: {
          ...t.attributes,
          state: "committed"
        },
        relationships: {
          ...t.relationships
        }
      }))
    })

    // Notification
    const list = store.getters["transfers/currentList"]
    const states = list.reduce((states: Record<TransferState, number>, t: Transfer) => {
      if (t.attributes.state in states) {
        states[t.attributes.state]++
      } else {
        states[t.attributes.state] = 1
      }
      return states
    }, {})
    notifyTransactionStateMultiple(states, t)

    // Go to member's transactions list. 
    // This is not the best if the user is an admin making payments between users, but there is not
    // a better page to go to where to see all the transactions.
    router.push({
      name: "TransactionList",
      params: {
        code: props.code,
        memberCode: store.getters.myMember.attributes.code
      }
    })
  } finally {
    quasar.loading.hide()
  }
}
</script>