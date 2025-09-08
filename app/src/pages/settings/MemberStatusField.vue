<template>
  <div class="q-gutter-y-md">
    <div class="text-body2 text-onsurface-m">
      {{ t('accountStatusText') }}  
    </div>
    <div>
      <q-field
        :model-value="currentStatus"
        :label="t('accountStatus')"
        outlined
        readonly        
      >
        <member-status-chip :status="currentStatus" />
      </q-field>
    </div>
    <div class="row justify-end">
      <confirm-btn
        v-if="isActive"
        :label="t('disableAccount')"
        color="icon-dark"
        icon="visibility_off"
        outline
        :loading="disableAccountLoading"
        @confirm="disableAccount"
      >
        {{ t('disableAccountConfirmText') }}
      </confirm-btn>
      <confirm-btn
        v-if="isDisabled"
        :label="t('enableAccount')"
        color="primary"
        icon="visibility"
        outline
        :loading="enableAccountLoading"
        @confirm="enableAccount"
      >
        {{ t('enableAccountConfirmText') }}
      </confirm-btn>
    </div>
  </div>
</template>
<script lang="ts" setup>

import ConfirmBtn from '../../components/ConfirmBtn.vue';
import MemberStatusChip from '../../components/MemberStatusChip.vue';

import { computed, Ref, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import { useQuasar } from 'quasar';
import { Account, Currency, Group, Member } from '../../store/model';

const props = defineProps<{
  member: Member & { account: Account, group: Group & { currency: Currency }}
}>();

const currentStatus = ref(props.member.attributes.state)
const isActive = computed(() => currentStatus.value === 'active');
const isDisabled = computed(() => currentStatus.value === 'disabled');

const store = useStore()
const q = useQuasar()

const setMemberStatus = async (status: "active" | "disabled", loadingRef: Ref<boolean>) => {
  try {
    loadingRef.value = true
    await store.dispatch('accounts/update', {
      id: props.member.account.id,
      group: props.member.group.currency.attributes.code,
      resource: {
        type: "accounts",
        attributes: {
          status: status
        }
      }
    })
    await store.dispatch('members/update', {
      id: props.member.id,
      group: props.member.group.attributes.code,
      resource: {
        type: "members",
        attributes: {
          state: status
        }
      }
    })
    currentStatus.value = status
    q.notify({
      message: t('accountStatusUpdated'),
      color: "positive"
    })
  } finally {
    loadingRef.value = false
  }
}

const disableAccountLoading = ref(false)
const enableAccountLoading = ref(false)

const disableAccount = () => setMemberStatus("disabled", disableAccountLoading)
const enableAccount = () => setMemberStatus("active", enableAccountLoading)

const { t } = useI18n();
</script>