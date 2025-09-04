<template>
  <div class="q-gutter-y-md">
    <div class="text-body2 text-onsurface-m">
      {{ t('accountStatusText') }}  
    </div>
    <div>
      <q-input
        :model-value="statusLabel"
        outlined
        :label="t('accountStatus')"
        readonly        
      >
        <template #prepend>
          <q-icon
            v-if="isActive"
            name="visibility"
            color="primary"
          />
          <q-icon
            v-if="isDisabled"
            name="visibility_off"
            color="icon-dark"
          />

        </template>
      </q-input>
    </div>
    <div class="row justify-end">
      <confirm-btn
        v-if="isActive"
        :label="t('disableAccount')"
        color="icon-dark"
        icon="visibility_off"
        outline
        @confirm="disableAccount"
        :loading="disableAccountLoading"
      >
        {{ t('disableAccountConfirmText') }}
      </confirm-btn>
      <confirm-btn
        v-if="isDisabled"
        :label="t('enableAccount')"
        color="primary"
        icon="visibility"
        outline
        @confirm="enableAccount"
        :loading="enableAccountLoading"
      >
        {{ t('enableAccountConfirmText') }}
      </confirm-btn>
    </div>
  </div>
</template>
<script lang="ts" setup>

import ConfirmBtn from '../../components/ConfirmBtn.vue';

import { computed, Ref, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStore } from 'vuex';
import { useQuasar } from 'quasar';
import { Account, Group, Member } from '../../store/model';

const props = defineProps<{
  member: Member & { account: Account, group: Group }
}>();

const isActive = computed(() => props.member.attributes.state === 'active');
const isDisabled = computed(() => props.member.attributes.state === 'disabled');

const statusLabel = computed(() => {
  switch (props.member.attributes.state) {
    case 'active':
      return t('active');
    case 'disabled':
      return t('disabled');
    default:
      return props.member.attributes.state;
  }
})

const store = useStore()
const q = useQuasar()

const setMemberStatus = async (status: "active" | "disabled", loadingRef: Ref<boolean>) => {
  try {
    loadingRef.value = true
    await store.dispatch('accounts/update', {
      id: props.member.account.id,
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
    q.notify({
      message: t('accountStatusUpdated', { status: statusLabel.value }),
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