<template>
<h1>HOME</h1>
  <!-- <resource-card-list
    :card="card"
    :code="code"
    :title="$t('home')"
    prop-name="need"
    module-name="needs"
    include="category,member,member.contacts"
  >
    <template #after>
      <floating-btn
        :label="$t('createNeed')"
        icon="add"
        color="kred"
        :to="`/groups/${code}/needs/new`"
      />
    </template>
  </resource-card-list> -->
</template>
<script lang="ts">
import { defineComponent } from "vue";
// import ResourceCardList from "../ResourceCardList.vue";
import NeedCard from "../../components/NeedCard.vue";
// import FloatingBtn from "../../components/FloatingBtn.vue";

export default defineComponent({
  components: {
    // ResourceCardList,
    // FloatingBtn
  },
  props: {
    // code: {
    //   type: String,
    //   required: true
    // }
  },
  data: () => ({
    card: NeedCard.name
  })
});
</script>
