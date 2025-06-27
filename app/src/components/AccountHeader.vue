<template>
  <q-item
    :clickable="link != ''"
    :to="link"
  >
    <q-item-section avatar>
      <avatar
        :img-src="avatarImage"
        :text="avatarText"
      />
    </q-item-section>
    <q-item-section>
      <q-item-label
        lines="1"
        class="text-subtitle2 text-onsurface-m"
      >
        <slot name="text">
          {{ primaryText }}
        </slot>
      </q-item-label>
      <q-item-label caption>
        <slot name="caption">
          {{ secondaryText }}
        </slot>
      </q-item-label>
    </q-item-section>
    <slot name="extra" />
    <q-item-section side>
      <slot name="side" />
    </q-item-section>
  </q-item>
</template>
<script setup lang="ts">
import { Account, Currency, Group, Member } from "src/store/model"
import Avatar from "./Avatar.vue"
import { useStore } from "vuex"
import { computed } from "vue"

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
   * If the account is defined, this will be ignored.
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
const hasMember = computed(() => !!(props.account?.member))

const addressLeaf = computed(() => {
  return props.address?.split("/").pop()
})

const link = computed(() => {
  if (props.to !== undefined) {
    return props.to
  } else if (isLocal.value) {
    return `/groups/${myGroup.value.attributes.code}/members/${props.account?.member?.attributes.code}`
  } else {
    return ""
  }
})

const avatarImage = computed(() => hasMember.value 
  ? props.account?.member?.attributes.image 
  : props.account?.currency?.group?.attributes.image
)

const avatarText = computed(() => { 
  if (props.account?.member) {
    return props.account.member.attributes.name as string
  } else if (props.account) {
    return props.account.attributes.code
  } else if (addressLeaf.value) {
    return addressLeaf.value
  }
  return ""
})

const primaryText = computed(() => { 
  if (props.account?.member) {
    return props.account.member.attributes.name as string
  } else if (props.account?.currency?.group) {
    return props.account.currency.group.attributes.name
  } else if (props.account) {
    return props.account.attributes.code
  } else if (addressLeaf.value) {
    return addressLeaf.value
  }
  return ""
})

const secondaryText = computed(() => {
  if (props.account && primaryText.value !== props.account.attributes.code) {
    return props.account.attributes.code
  } else if (props.address) {
    return props.address.split("/").slice(0, -1).join("/")
  }
  return ""
})

</script>