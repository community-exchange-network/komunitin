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

const props = defineProps<{
  groupCode: string,
  member: Member
}>()

const card = NeedCard.name
const store = useStore()
const canEdit = computed(() => props.member?.id == store.getters.myMember.id || store.getters.isAdmin)

const filter = computed(() => ({
  member: props.member.id,
  expired: 'false' + (canEdit.value ? ',true' : ''),
  state: 'published' + (canEdit.value ? ',hidden' : '')
}))

</script>