<template>
  <resource-card-list
    :code="code"
    :title="$t('offers')"
    type="offers"
    include="category,member,member.group,member.group.currency,member.account"
  >
    <template #after>
      <floating-btn
        :label="$t('createOffer')"
        icon="add"
        color="kblue"
        :to="`/groups/${code}/offers/new`"
      />
    </template>
  </resource-card-list>
</template>
<script lang="ts">
import { defineComponent } from "vue";
import ResourceCardList from "../ResourceCardList.vue";
import FloatingBtn from "../../components/FloatingBtn.vue";
import OfferCard from "../../components/OfferCard.vue";

export default defineComponent({
  components: {
    ResourceCardList,
    FloatingBtn
  },
  props: {
    code: {
      type: String,
      required: true
    }
  },
  data: () => ({
    card: OfferCard.name
  })
});
</script>
