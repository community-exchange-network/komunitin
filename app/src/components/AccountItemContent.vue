<template>
  <q-item-section avatar class="avatar-section">
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
      {{ primaryText }} 
    </q-item-label>
    <q-item-label 
      caption
      lines="1"
    >
      {{ secondaryText }}
    </q-item-label>
  </q-item-section>
</template>
<script setup lang="ts">
import type { Account, Currency, Group, Member } from "src/store/model"
import Avatar from "./Avatar.vue"
import { computed } from "vue"

const props = withDefaults(defineProps<{
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
   * Override or disable secondary text
   */
  caption?: string | boolean | undefined,

}>(), {
  // We need to explicitly set the default value for caption
  // because otherwise Vue sets it to `false` if not defined.
  caption: undefined,
  // And then we need to set the remaining defaults to avoid
  // Vue warnings.
  account: undefined,
  address: undefined
})

const addressLeaf = computed(() => {
  return props.address?.split("/").pop()
})

const avatarImage = computed(() => {
  if (props.address) {
    return undefined
  } else if (props.account?.member) {
    return props.account.member.attributes.image
  } else if (props.account?.currency?.group) {
    return props.account.currency.group.attributes.image
  }
  return undefined  
})

const avatarText = computed(() => { 
  if (addressLeaf.value) {
    return addressLeaf.value
  } else if (props.account?.member) {
    return props.account.member.attributes.name
  } else if (props.account) {
    return props.account.attributes.code
  }
  return ""
})

const primaryText = computed(() => { 
  if (addressLeaf.value) {
    return addressLeaf.value
  } else if (props.account?.member) {
    return props.account.member.attributes.name
  } else if (props.account?.currency?.group) {
    return props.account.currency.group.attributes.name
  } else if (props.account) {
    return props.account.attributes.code
  }
  return ""
})

const secondaryText = computed(() => {
  if (typeof props.caption == 'string') {
    return props.caption
  } else if (props.address) {
    return props.address.split("/").slice(0, -1).join("/")
  } else if (props.account && primaryText.value !== props.account.attributes.code) {
    return props.account.attributes.code
  }
  return ""
})
</script>

<style lang="scss" scoped>
  /*
  When the item content is not the first element in the q-item,+
  the avatar does not have the correct right padding, so we force
  it here. Furthermore, the q-pr-md class does not work because
  it is overwritten by internal Quasar styles.
  */
  .avatar-section {
    padding-right: 16px !important;
  }
</style>