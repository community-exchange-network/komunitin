<template>
  <div class="q-gutter-y-md">
    <div class="text-body2 text-onsurface-m">
      {{ current.text.value }}
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
    <div class="row justify-end q-gutter-md q-mt-none">
      <confirm-btn
        v-if="show.enable"
        :label="t('enableAccount')"
        :color="active.color.value"
        :icon="active.icon.value"
        outline
        :loading="enableAccountLoading"
        @confirm="enableAccount"
      >
        {{ t('enableAccountConfirmText') }}
      </confirm-btn>
      <confirm-btn
        v-if="show.disable"
        :label="t('disableAccount')"
        :color="disabled.color.value"
        :icon="disabled.icon.value"
        outline
        :loading="disableAccountLoading"
        @confirm="disableAccount"
      >
        {{ t('disableAccountConfirmText') }}
      </confirm-btn>
      <confirm-btn
        v-if="show.suspend"
        :label="t('suspendAccount')"
        :color="suspended.color.value"
        :icon="suspended.icon.value"
        outline
        :loading="suspendAccountLoading"
        @confirm="suspendAccount"
      >
        {{ t('suspendAccountConfirmText') }}
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
import { useAccountStatus } from '../../composables/accountStatus';

const props = defineProps<{
  member: Member & { account: Account, group: Group & { currency: Currency }}
}>();

const store = useStore()
const currentStatus = ref(props.member.attributes.state)

const active = useAccountStatus('active')
const disabled = useAccountStatus('disabled')
const suspended = useAccountStatus('suspended')

const current = useAccountStatus(() => currentStatus.value)

const show = computed(() => {
  const status = currentStatus.value
  const isAdmin = store.getters.isAdmin
  return {
    enable: (status === 'disabled' || (status === 'suspended' && isAdmin)),
    disable: (status === 'active' || (status === 'suspended' && isAdmin)),
    suspend: (isAdmin && (status === 'active' || status === 'disabled'))
  }
})


const q = useQuasar()

const setMemberStatus = async (status: "active" | "disabled" | "suspended", loadingRef: Ref<boolean>) => {
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
const suspendAccountLoading = ref(false)

const disableAccount = () => setMemberStatus("disabled", disableAccountLoading)
const enableAccount = () => setMemberStatus("active", enableAccountLoading)
const suspendAccount = () => setMemberStatus("suspended", suspendAccountLoading)

const { t } = useI18n();

</script>