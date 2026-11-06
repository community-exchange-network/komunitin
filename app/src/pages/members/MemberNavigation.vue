<template>
  <nav class="row q-gutter-sm q-mt-md">
    <nav-button
      :to="`${profileUrl}/offers`"
      class="col col-sm-auto"
      icon="local_offer"
      :label="$t('offers')"
      :count="member.relationships.offers?.meta.count ?? 0"
      :active="page === 'offers'"
      :stack="$q.screen.xs"
    />
    <nav-button
      :to="`${profileUrl}/needs`"
      class="col col-sm-auto"
      icon="loyalty"
      :label="$t('needs')"
      :count="member.relationships.needs?.meta.count ?? 0"
      :active="page === 'needs'"
      :stack="$q.screen.xs"
    />
    <nav-button
      v-if="member.account"
      :to="`${profileUrl}/transfers`"
      class="col col-sm-auto"
      icon="swap_horiz"
      :label="$t('transactions')"
      :active="page === 'transfers'"
      :stack="$q.screen.xs"
    />
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NavButton from '@/components/NavButton.vue'
import type { Member } from '@/store/model'

const props = defineProps<{
  code: string
  member: Member
  page?: 'offers' | 'needs' | 'transfers'
}>()

const profileUrl = computed(() => `/groups/${props.code}/members/${props.member.attributes.code}`)
</script>
