<template>
  <q-item
    :clickable="link != ''"
    :to="link"
  >
    <account-item-content
      :account="account"
      :address="address"
    />
  </q-item>
</template>
<script setup lang="ts">
import { computed } from "vue"
import { useStore } from "vuex"
import { Account, Currency, Group, Member } from "src/store/model"
import AccountItemContent from "./AccountItemContent.vue"


const props = defineProps<{
  /**
   * The account to show. If undefined, then you must pass an address.
   */
  account?: Account & { 
    member?: Member & {group?: Group},
    currency?: Currency & {group?: Group}
  },
  /**
   * In case of a credit commons account, the address to show.
   * If this is defined, the `account` prop is ignored.
   */
  address?: string,
  /**
   * If defined, the link to navigate to when clicking on the item.
   * If not defined, it will use the account's member url (if exists).
   */
  to?: string
}>()

const store = useStore()
const myGroup = computed<Group>(() => store.getters.myMember.group)

const isLocal = computed(() => props.account?.member?.group?.id == myGroup.value.id)

const link = computed(() => {
  if (props.to !== undefined) {
    return props.to
  } else if (isLocal.value) {
    return `/groups/${myGroup.value.attributes.code}/members/${props.account?.member?.attributes.code}`
  } else {
    return ""
  }
})

</script>