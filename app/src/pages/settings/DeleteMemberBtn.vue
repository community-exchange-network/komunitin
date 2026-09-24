<template>
  <delete-btn
    v-model="confirmDialog"
    outline
    icon="delete"
    :round="false"
    :flat="false"
    :label="$t('deleteAccount')"
    :disabled="!canDelete"
    @confirm="deleteMember"
  >
    <template #default>
      <div
        class="q-gutter-y-md"
      >
        <member-header
          style="margin-left: -16px;"
          :member="props.member"
          :clickable="false"
        />
        <div>
          {{ $t('deleteAccountConfirmation') }}
        </div>
        <select-account
          v-if="!zeroBalance"
          v-model="recipientAccount"
          :payer="false"
          :code="props.member.group.attributes.code"
          :label="$t('moveBalanceTo')"
          :hint="$t('moveBalanceToHint')"
          :account-disabled="(candidate: Account) => candidate.id === account?.id"
          :rules="[() => !!recipientAccount || $t('fieldRequired')]"
          outlined
        />
        <div v-if="!isAdmin">
          {{ $t('deleteAccountEmailText') }}
        </div>
      </div>
    </template>
  </delete-btn>
</template>
<script setup lang="ts">
import DeleteBtn from "@/components/DeleteBtn.vue"
import { useApiFetch } from "@/composables/useApiFetch"
import { useResource } from "@/composables/useResources"
import { config } from "@/utils/config"
import SelectAccount from "@/components/SelectAccount.vue";
import MemberHeader from "@/components/MemberHeader.vue";

import { computed, ref } from "vue"
import { useStore } from "vuex"
import { useQuasar } from "quasar";
import { useI18n } from "vue-i18n";

import type { Account, Currency, Group, Member } from "@/store/model";
import { transferAccountRelationships } from "@/composables/fullAccount";
import type { DeletePayload } from "@/store/resources";


const props = defineProps<{
  member: Member & {account?: Account & {currency: Currency}, group: Group}
}>()

const emit = defineEmits<{
  (e: "delete"): void
}>()

const store = useStore()
const apiFetch = useApiFetch()
const isAdmin = computed(() => store.getters.isAdmin || store.getters.isSuperadmin)
const isOwn = computed(() => props.member.id === store.getters.myMember?.id)
const recipientAccount = ref<Account>()
const confirmDialog = ref(false)

// Reload only when the account identity changes, not when the member object is replaced.
const accountId = computed(() => props.member.relationships.account.data?.id ?? null)
const groupCode = computed(() => props.member.group.attributes.code)
const { resource: account, load: loadAccount } = useResource<Account & {currency: Currency}>("accounts", () => ({
  id: accountId.value,
  group: groupCode.value,
  include: "currency",
}))
const hasAccount = computed(() => accountId.value !== null)
const balance = computed(() => account.value?.attributes.balance ?? 0)
const zeroBalance = computed(() => balance.value === 0)

const canDelete = computed(() =>
  (isAdmin.value || isOwn.value) &&
  (!hasAccount.value || !!account.value && (isAdmin.value || balance.value >= 0))
)

const quasar = useQuasar()
const { t } = useI18n()

// Both flows settle the balance using the user's normal Accounting permissions.
const deleteMember = async () => {
  try {
    quasar.loading.show()
    // A previous attempt may have transferred the balance but failed to request deletion.
    await loadAccount()

    if (canDelete.value && account.value && recipientAccount.value && !zeroBalance.value) {
      const payer = balance.value > 0 ? account.value : recipientAccount.value
      const payee = balance.value > 0 ? recipientAccount.value : account.value
      await store.dispatch('transfers/create', {
        group: account.value.currency.attributes.code,
        resource: {
          type: 'transfers',
          attributes: {
            amount: Math.abs(balance.value),
            state: 'committed',
            meta: { description: t('setZeroBalance') },
          },
          relationships: transferAccountRelationships(payer, payee, account.value.currency),
        },
      })
      await loadAccount()
    }

    if (canDelete.value && zeroBalance.value) {
      const member = props.member
      if (!isAdmin.value) {
        await apiFetch(`${config.SOCIAL_URL}/${encodeURIComponent(member.group.attributes.code)}/members/${member.id}/request-deletion`, {
          method: 'POST',
        })
        quasar.notify({ message: t('resetLinkSent'), color: 'positive', icon: 'mail' })
      } else {
        const adminOwnMember = isOwn.value
        await store.dispatch('members/delete', {
          group: member.group.attributes.code,
          id: member.id,
        } as DeletePayload)
        if (adminOwnMember) {
          await store.dispatch('logout')
        }
        emit('delete')
      }
    } else {
      // A changed balance or missing recipient needs another confirmation.
      confirmDialog.value = true
    }
  } finally {
    quasar.loading.hide()
  }
}

</script>
