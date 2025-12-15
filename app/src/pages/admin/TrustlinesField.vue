<template>
  <div>
    <div
      style="margin-left: -16px; margin-right: -16px;"
    >
      <div 
        class="row text-overline text-onsurface-m q-px-md q-mr-lg"
      >
        <div class="col-5">
          {{ $t('currency') }}
        </div>
        <div class="col-3 text-right">
          {{ $t('balance') }}
        </div>
        <div class="col-3 text-right">
          {{ $t('limit') }}
        </div>
      </div>
      <q-list>
        <div 
          v-if="!(trustlines?.length)" 
          class="q-py-md text-onsurface"
        >
          {{ $t('noTrustlines') }}
        </div>
        <group-header
          v-for="trustline in trustlines"
          :key="trustline.id"
          :group="trustline.trusted.group"
          :clickable="false"
        >
          <template #extra>
            <q-item-section
              class="text-h6 col-3 text-right"
              :class="trustline.attributes.balance >= 0 ? 'positive-amount' : 'negative-amount'"
            >
              {{ FormatCurrency(trustline.attributes.balance, trustline.currency) }}
            </q-item-section>
            <q-item-section
              class="col-3 row justify-end items-center q-gutter-x-md"
            >
              <div class="text-h6 positive-amount">
                {{ FormatCurrency(trustline.attributes.limit, trustline.currency) }}
              </div>
            </q-item-section>
          </template>
          <template #side>
            <q-btn
              rounded
              dense
              flat
              icon="edit"
              @click="editTrustline(trustline)"
            />
          </template>
        </group-header>
      </q-list>
    </div>
    <div class="row justify-end q-mt-md q-gutter-x-md">
      <q-btn
        flat
        color="primary"
        icon="refresh"
        :label="$t('refresh')"
        :loading="syncTrustlinesLoading"
        @click="syncTrustlines()"
      />
      <q-btn
        flat
        color="primary"
        icon="add"
        :label="$t('addTrustline')"
        @click="addTrustline()"
      />
    </div>
    <q-dialog v-model="showDialog">
      <q-card
        style="min-width: 50vw;"
      >
        <q-card-section>
          <div class="flex justify-between">
            <div class="text-h6">
              {{ actionLabel }}
            </div>
            <q-btn
              flat
              round
              icon="close"
              style="margin-top: -8px; margin-right: -8px;"
              @click="showDialog = false"
            />
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-y-md">
          <select-group
            v-model="group"
            :label="$t('currency')"
            :disable="action === 'edit'"
            :option-disable="groupDisabled"
            outlined
          />
          <amount-input
            v-model="limit"
            :currency="myCurrency"
            :label="$t('limit')"
            :hint="$t('trustlineLimitHint')"
            outlined
          />
        </q-card-section>
        <q-card-section align="right">
          <q-btn
            unelevated
            color="primary"
            :label="$t('save')"
            :disable="saveDisabled"
            @click="saveTrustline()"
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </div>
</template>
<script setup lang="ts">
import GroupHeader from 'src/components/GroupHeader.vue';
import SelectGroup from 'src/components/SelectGroup.vue';
import AmountInput from 'src/components/AmountInput.vue';
import FormatCurrency from 'src/plugins/FormatCurrency';
import type { Currency, Group, Trustline } from 'src/store/model';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import type { DeepPartial } from 'quasar';
import { useApiFetch } from '../../composables/useApiFetch';
import { config } from 'src/utils/config';

type ExtendedGroup = Group & {
  currency: Currency
}
type ExtendedCurrency = Currency & {
  group: ExtendedGroup
}
export type ExtendedTrustline = Trustline & {
  currency: ExtendedCurrency,
  trusted: ExtendedCurrency
}
const props = defineProps<{
  trustlines?: ExtendedTrustline[],
}>()
const emit = defineEmits<{
  (e: 'update:trustline', value: DeepPartial<Trustline>): void
  (e: 'create:trustline', value: DeepPartial<Trustline>): void
  (e: 'sync:trustlines'): void
}>()

const store = useStore()
const myGroup = computed(() => store.getters.myMember.group)
const myCurrency = computed(() => store.getters.myAccount.currency)

const showDialog = ref(false)

const action = ref<"add" | "edit">("add")

const { t } = useI18n()

const actionLabel = computed(() => {
  return action.value === "add" ? t('addTrustline') : t('editTrustline')
})

const group = ref<ExtendedGroup|undefined>()
const limit = ref<number>(0)
const editingTrustline = ref<ExtendedTrustline|undefined>()

const saveDisabled = computed(() => !group.value || !limit.value)

const editTrustline = (trustline: ExtendedTrustline) => {
  action.value = "edit"
  editingTrustline.value = trustline
  group.value = trustline.trusted.group
  limit.value = trustline.attributes.limit
  showDialog.value = true
}
const addTrustline = () => {
  action.value = "add"
  group.value = undefined
  limit.value = 0
  showDialog.value = true
}
const saveTrustline = () => {
  if (!group.value || !limit.value) {
    return
  }
  if (action.value === "add") {
    // Send trustline object as expected by the service: with the trusted currency 
    // as an external relationship. Also, omit the currency relationship as defaults
    // to the current currency.
    emit("create:trustline", {
      type: "trustlines",
      attributes: {
        limit: limit.value
      },
      relationships: {
        trusted: { 
          data: { 
            type: "currencies", 
            id: group.value.currency.id,
            meta: {
              external: true,
              href: group.value.currency.links.self
            }
          } 
        },
      }
    } as DeepPartial<Trustline>)
  } else if (action.value === "edit") {
    if (!editingTrustline.value) {
      return
    }
    editingTrustline.value.attributes.limit = limit.value
    emit("update:trustline", {
      type: "trustlines",
      id: editingTrustline.value.id,
      attributes: {
        limit: limit.value
      },
    })
  }
  
  showDialog.value = false
}

const groupDisabled = (group: Group) => {
  if (group.id === myGroup.value.id) {
    return true
  }
  if (props.trustlines?.find(t => t.trusted.group.id === group.id)) {
    return true
  }
  return false
}

const syncTrustlinesLoading = ref(false)
const apiFetch = useApiFetch()

const syncTrustlines = async () => {  
  const baseUrl = config.ACCOUNTING_URL
  const code = myGroup.value.attributes.code
  try {
    syncTrustlinesLoading.value = true
      await apiFetch(`${baseUrl}/${code}/trustlines/sync`, {
      method: 'POST',
    })
    emit("sync:trustlines")
  } finally {
    syncTrustlinesLoading.value = false
  }
}
</script>