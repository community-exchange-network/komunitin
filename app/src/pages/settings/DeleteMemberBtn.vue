<template>
  <delete-btn
    outline
    color="negative"
    icon="delete"
    :round="false"
    :flat="false"
    :label="$t('deleteAccount')"
    :disabled="!canDelete"
    @confirm="deleteMember"
  >
    <template #default>
      <div 
        class="q-gutter-y-md q-my-lg"
      >
        <div class="text-h6">
          {{ $t('deleteAccount') }}
        </div>
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
import SelectAccount from "src/components/SelectAccount.vue";
import MemberHeader from "src/components/MemberHeader.vue";
import PasswordField from "src/components/PasswordField.vue";

import { computed, ref } from "vue"
import { useStore } from "vuex"
import { useQuasar } from "quasar";
import { useI18n } from "vue-i18n";

import { Account, Currency, Group, Member } from "src/store/model";
import { transferAccountRelationships } from "src/composables/fullAccount";
import { DeletePayload } from "src/store/resources";
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
  if (!zeroBalance.value && !recipientAccount.value || !isAdmin.value && !password.value) {
    return
  }
  try {
    quasar.loading.show()
    // 1. Move balance
    if (props.member.account && !zeroBalance.value) {
      const currency = props.member.account.currency
      const balance = props.member.account.attributes.balance
      const payment = balance >= 0
      const payer = payment ? props.member.account : recipientAccount.value
      const payee = payment ? recipientAccount.value : props.member.account
    
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
        group: props.member.group.attributes.code,
        resource
      })
    }

    // 2. Re-login. At this point this is just a UI measure to prevent the user from
    //    accidentally deleting the account. However, using the same workflow we could
    //    convert it to a safety measure by requiring an additional scope for the 
    //    delete action.
    if (!isAdmin.value) {
      const email = store.getters.myUser.attributes.email
      await store.dispatch("login", {email: email.value, password: password.value})
    }

    // 3. Delete member
    await store.dispatch("members/delete", {
      group: props.member.group.attributes.code,
      id: props.member.id
    } as DeletePayload)

    // 4. Logout (definitely)
    if (!isAdmin.value) {
      await store.dispatch("logout")
      await router.push("/")
    } else {
      emit("delete")
    }

  } finally {
    quasar.loading.hide()
  }
}

</script>