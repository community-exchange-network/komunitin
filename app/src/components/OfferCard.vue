<template>
  <q-card
    v-if="offer"
    v-bind="cardClickAttrs"
    flat
    bordered
    :class="{ muted: isMuted }"
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
      <span class="text-uppercase text-onsurface-m text-overline">{{$t('offer')}}</span>
      <div class="text-h6">
        {{ offer.attributes.title }}
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
        {{ md2txt(offer.attributes.description) }}
      </div>
    </q-card-section>
    <q-card-section 
      v-if="canEdit"
      class="row items-center"
    >
      <post-status-badges
        v-if="isMuted"
        :status="offer.attributes.status"
        :expired="isExpired"
        :member-active="isMemberActive"
      />
      <q-space />
      <q-btn
        icon="edit"
        flat
        round
        color="icon-dark"
        :to="`/groups/${code}/offers/${offer.attributes.code}/edit`"
        class="q-ml-none"
        :title="$t('editOffer')"
      />
      <delete-offer-btn
        v-if="canEdit"
        :code="code"
        :offer="offer"
        color="icon-dark"
        class="q-ml-none"
      />
    </q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import { computed } from "vue"
import { useStore } from "vuex"
import type { Category, Currency, Group, Member, Offer } from "src/store/model"
import { useCardClickTo } from "src/composables/useCardClickTo"
import vClamp from "../plugins/Clamp"
import md2txt from "../plugins/Md2txt"
import { formatPrice } from "../plugins/FormatCurrency"
import Carousel from "./Carousel.vue"
import CategoryAvatar from "./CategoryAvatar.vue"
import MemberHeader from "./MemberHeader.vue"
import DeleteOfferBtn from "./DeleteOfferBtn.vue"
import PostStatusBadges from "./PostStatusBadges.vue"

type CardOffer = Offer & {
  category: Category
  member: Member & {
    group: Group & {
      currency?: Currency
    }
  }
}

defineOptions({
  name: "OfferCard"
})

const props = defineProps<{
  code: string
  offer: CardOffer
}>()

const store = useStore()
const price = computed(() => {
  const currency = props.offer.member.group.currency
  return currency ? formatPrice(props.offer.attributes.value ?? "", currency) : ""
})
const canEdit = computed(() =>
  props.offer.member.id === store.getters.myMember?.id
  || store.getters.isAdmin
)
const isMemberActive = computed(() => props.offer.member.attributes.status === "active")
const isExpired = computed(() => new Date(props.offer.attributes.expires) < new Date())
const isMuted = computed(() =>
  props.offer.attributes.status !== "published"
  || !isMemberActive.value
  || isExpired.value
)
const targetUrl = computed(() => {
  const path = `/groups/${props.code}/offers/${props.offer.attributes.code}`
  return props.offer.attributes.status === "draft" ? `${path}/preview` : path
})
const cardClickAttrs = useCardClickTo(targetUrl)
</script>
<style lang="scss" scoped>
  .muted {
    opacity: 0.54;
  }
</style>
