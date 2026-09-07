<template>
  <delete-btn
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
          :account-disabled="(account: Account) => account.id === props.member.account?.id"
          :rules="[() => !!recipientAccount || $t('fieldRequired')]"
          outlined
        />
        <password-field
          v-if="!isAdmin"
          v-model="password"
          :label="$t('password')"
          :hint="$t('oldPasswordHint')"
          :rules="[() => !!password || $t('fieldRequired')]"
        />
      </div>
    </template>
  </delete-btn>
</template>
<script setup lang="ts">
import DeleteBtn from "src/components/DeleteBtn.vue"
import { Auth } from "src/plugins/Auth"
import SelectAccount from "src/components/SelectAccount.vue";
import MemberHeader from "src/components/MemberHeader.vue";
import PasswordField from "src/components/PasswordField.vue";

import { computed, ref } from "vue"
import { useStore } from "vuex"
import { useQuasar } from "quasar";
import { useI18n } from "vue-i18n";

import type { Account, Currency, Group, Member } from "src/store/model";
import { transferAccountRelationships } from "src/composables/fullAccount";
import type { DeletePayload } from "src/store/resources";
import { useRouter } from "vue-router";


const props = defineProps<{
  member: Member & {account?: Account & {currency: Currency}, group: Group}
}>()

const emit = defineEmits<{
  (e: "delete"): void
}>()

const store = useStore()
const isAdmin = computed(() => store.getters.isAdmin)

const password = ref("")
const recipientAccount = ref<Account>()

const hasAccount = computed(() => props.member.relationships.account.data !== null)
const balance = computed(() => props.member.account?.attributes.balance ?? 0)

const zeroBalance = computed(() => balance.value === 0)
const canDelete = computed(() => isAdmin.value || !hasAccount.value || balance.value >= 0)

const quasar = useQuasar()
const { t } = useI18n()

const router = useRouter()

const deleteMember = async () => {
  const member = props.member
  const isSelf = member.id === store.getters.myMember?.id
  if (!zeroBalance.value && !recipientAccount.value || !isAdmin.value && !password.value) {
    return
  }
  try {
    quasar.loading.show()
    // 1. Move balance
    if (member.account && !zeroBalance.value) {
      const currency = member.account.currency
      const balance = member.account.attributes.balance
      const payment = balance >= 0
      const payer = payment ? member.account : recipientAccount.value
      const payee = payment ? recipientAccount.value : member.account
    
      const resource = {
        type: "transfers",
        attributes: {
          amount: Math.abs(balance),
          state: "committed",
          meta: {
            description: t('setZeroBalance')
          }
        },
        relationships: transferAccountRelationships(payer, payee, currency)
      }
      await store.dispatch("transfers/create", {
        group: member.group.attributes.code,
        resource
      })
    }

    // 2. Re-login. At this point this is just a UI measure to prevent the user from
    //    accidentally deleting the account. However, using the same workflow we could
    //    convert it to a safety measure by requiring an additional scope for the 
    //    delete action.
    if (!isAdmin.value) {
      const email = store.getters.myUser.attributes.email
      // Verify credentials without reloading a membership that may already be
      // deleted by an earlier attempt whose Auth cleanup failed.
      const tokens = await new Auth().login({ email, password: password.value })
      store.commit("tokens", tokens)
    }

    // 3. Delete member
    await store.dispatch("members/delete", {
      group: member.group.attributes.code,
      id: member.id
    } as DeletePayload)

    // Clear the selected membership even when an administrator deletes their own.
    if (isSelf) {
      await router.push("/logout")
    } else {
      emit("delete")
    }

  } finally {
    quasar.loading.hide()
  }
}

</script>
