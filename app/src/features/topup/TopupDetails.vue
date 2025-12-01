<template>
  <div>
    <page-header 
      :title="t('topupDetails')"
      :back="`/groups/${code}/members/${myMember?.attributes.code}/transactions`"
      balance
    />
    <q-page-container
      class="row justify-center bg-light"
    >
      <q-page
        padding
        class="q-py-lg q-px-md col-12 col-sm-8 col-md-6"
      >
        <topup-card v-if="topup"
          :topup="topup"
          :account="topup.account"
          :polling="polling"
        />
        <div class="row q-mt-lg">
          <q-btn
            v-if="topup?.attributes.status == 'transfer_failed'"
            class="col"
            color="primary"
            unelevated
            icon="refresh"
            :label="t('topupRetry')"
            :loading="loading"
            @click="retry"
          />
          <q-btn
            v-if="topup?.attributes.status == 'transfer_completed'"
            class="col"
            color="primary"
            unelevated
            :label="t('goToTransfer')"
            :to="`/groups/${code}/transactions/${topup.relationships.transfer.data.id}`"
          />
        </div>
      </q-page>
    </q-page-container>
  </div>
</template>
<script setup lang="ts">
import PageHeader from '../../layouts/PageHeader.vue';
import TopupCard from './TopupCard.vue';
import { useI18n } from 'vue-i18n';
import { useTopup } from './useTopup';
import { useStore } from 'vuex';
import { computed } from 'vue';

const props = defineProps<{
  code: string,
  id: string
}>()

const store = useStore()
const myMember = computed(() => store.getters.myMember)
const {resource: topup, update, load, loading} = useTopup(props.code, props.id)

const retry = async () => {
  if (topup.value && topup.value.attributes.status === 'transfer_failed') {
    await update({ attributes: {status: 'transfer_completed'} })
  }
}
// Poll topup status every second
const polling = computed(() => topup.value && ['pending', 'payment_completed'].includes(topup.value.attributes.status))
const intervalId = setInterval(() => {
  if (topup.value && polling.value && !loading.value) {
    load()
  } else if (topup.value && !polling.value) {
    clearInterval(intervalId)
  }
}, 1000)

const { t } = useI18n()
</script>
        