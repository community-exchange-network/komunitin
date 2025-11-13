<template>
  <resource-card-list
    :card="card"
    code=""
    :title="$t('groupsNearYou')"
    type="groups"
    include="contacts"
  />
</template>
<script lang="ts">
import { defineComponent } from "vue";
import ResourceCardList from "../ResourceCardList.vue";
import GroupCard from "../../components/GroupCard.vue";

export default defineComponent({
  components: {
    ResourceCardList
  },
  data: () => ({
    card: GroupCard.name
  })
});
</script>