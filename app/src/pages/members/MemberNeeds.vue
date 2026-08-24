<template>
  <resource-cards
    :card="card"
    :code="groupCode"
    type="needs"
    include="category"
    :filter="filter"
  />
</template>
<script setup lang="ts">
import { computed } from "vue"
import ResourceCards from "../ResourceCards.vue";
import NeedCard from "../../components/NeedCard.vue";
import type { Member } from "../../store/model";
import { useStore } from "vuex";
import { getMemberPostsFilter } from "src/composables/memberPostsFilter";

const props = defineProps<{
  groupCode: string,
  member: Member
}>()

const card = NeedCard.name
const store = useStore()
const filter = computed(() => getMemberPostsFilter(
  props.member.id,
  store.getters.myMember?.id,
  store.getters.isAdmin
))

</script>
