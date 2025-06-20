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
  account: Account & { 
    member?: Member & {group?: Group},
    currency?: Currency & {group?: Group}
  },
  to?: string
}>()
const store = useStore()
const myGroup = computed<Group>(() => store.getters.myMember.group)

const isAccount = computed(() => props.account.type === "account")
const isLocal = computed(() => props.account.member?.group?.id == myGroup.value.id)
const hasMember = computed(() => !!props.account.member)

const isCreditCommonsAccount = computed(() => props.account.type === "credit-commons-account")
const creditCommonsName = computed(() => props.account.id.split("/").pop())
const creditCommonsParents = computed(() => {
  return props.account.id.split("/").slice(0, -1).join("/")
})

const link = computed(() => {
  if (props.to !== undefined) {
    return props.to
  } else if (isLocal.value) {
    return `/groups/${myGroup.value.attributes.code}/members/${props.account.member?.attributes.code}`
  } else {
    return ""
  }
})

const avatarImage = computed(() => hasMember.value 
  ? props.account.member?.attributes.image 
  : props.account.currency?.group?.attributes.image
)

const avatarText = computed(() => { 
  if (isAccount.value) { 
    return hasMember.value 
    ? props.account.member?.attributes.name 
    : props.account.attributes.code
  } else if (isCreditCommonsAccount.value) {
    return props.account.id
  }
  return ""
})

const primaryText = computed(() => { 
  if (isAccount.value) {
    if (hasMember.value) {
      return props.account.member?.attributes.name 
    } else if (props.account.currency?.group) {
      return props.account.currency.group.attributes.name
    } else {
      return props.account.attributes.code  
    }
  } else if (isCreditCommonsAccount.value) {
    return props.account.id
  }
})

const secondaryText = computed(() => {
  return primaryText.value !== props.account.attributes.code
    ? props.account.attributes.code
    : ""}
)

</script>