<template>
  <q-card
    v-if="offer"
    v-card-click-to="`/groups/${code}/offers/${offer.attributes.code}`"
    flat
    bordered
    :class="{isHidden, isExpired}"
  >
    <!-- Header -->
    <member-header :member="offer.member">
      <template #caption>
        {{ $formatDate(offer.attributes.updated) }}
      </template>
      <template #side>
        <category-avatar
          :category="offer.category"
          type="offer"
        />
      </template>
    </member-header>

    <!-- Offer images -->
    <carousel
      :images="offer.attributes.images"
      height="200px"
    />

    <!-- offer title and description -->
    <q-card-section>
      <div class="text-h6">
        {{ offer.attributes.name }}
      </div>
      <!-- TODO: Add price -->
      <div class="text-subtitle2 q-mb-xs">
        <span class="text-onsurface-m">{{ $t('price') }}</span>
        <span>&nbsp;</span>
        <span class="negative-amount">{{ price }}</span>
      </div>
      <div
        v-clamp="3"
        class="text-body2 text-justify text-onsurface-m"
      >
        {{ md2txt(offer.attributes.content) }}
      </div>
    </q-card-section>
    <q-card-section 
      v-if="isMine"
      class="row justify-end items-center"
    >
      <q-btn
        v-if="isMine"
        icon="edit"
        flat
        round
        color="icon-dark"
        :to="`/groups/${code}/offers/${offer.attributes.code}/edit`"
        class="q-ml-none"
        :title="$t('editOffer')"
      />
      <delete-offer-btn
        v-if="isMine"
        :code="code"
        :offer="offer"
        color="icon-dark"
        class="q-ml-none"
      />
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { computed, defineComponent, ref, watch } from "vue";

import cardClickTo from "../plugins/CardClickTo";
import clamp from "../plugins/Clamp";
import md2txt from "../plugins/Md2txt";

import Carousel from "./Carousel.vue";
import CategoryAvatar from "./CategoryAvatar.vue";
import MemberHeader from "./MemberHeader.vue";
import DeleteOfferBtn from "./DeleteOfferBtn.vue";

import { formatPrice } from "../plugins/FormatCurrency"
import { useStore } from "vuex";

export default defineComponent({
  name: "OfferCard",
  components: {
    MemberHeader,
    CategoryAvatar,
    Carousel,
    DeleteOfferBtn
  },
  directives: {
    cardClickTo,
    clamp
  },
  props: {
    // Group code.
    code: {
      type: String,
      required: true
    },
    offer: {
      type: Object,
      required: true
    }
  },
  setup(props) {
    const store = useStore()
    const group = computed(() => props.offer.member.group)

    const currency = ref(group.value.currency)
    watch(() => group.value.currency, (value) => currency.value = value)

    const price = computed(() => currency.value ? formatPrice(props.offer.attributes.price, currency.value) : '')
    const isMine = computed(() => props.offer.member.id === store.getters.myMember.id)
    const hidden = computed(() => props.offer.attributes.state === "hidden" || props.offer.member.attributes.state !== "active")
    const expired = computed(() => new Date(props.offer.attributes.expires) < new Date())

    return {
      price,
      isMine,
      md2txt,
      isHidden: hidden,
      isExpired: expired
    }
  }
})

</script>
<style lang="scss" scoped>
  .isHidden, .isExpired {
    opacity: 0.54;
  }
</style>