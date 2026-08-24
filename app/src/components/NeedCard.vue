<template>
  <q-card
    v-if="need"
    v-bind="cardClickAttrs"
    flat
    bordered
    :class="{ muted: isMuted }"
  >
    <!-- Header -->
    <member-header :member="need.member">
      <template #caption>
        {{ $formatDate(need.attributes.updated) }}
      </template>
      <template #side>
        <category-avatar
          :category="need.category"
          type="need"
        />
      </template>
    </member-header>
    <!-- Need images -->
    <carousel
      v-if="hasImages"
      :images="need.attributes.images"
      height="200px"
    />

    <!-- Need text -->
    <q-card-section>
      <span class="text-uppercase text-onsurface-m text-overline">{{$t('need')}}</span>
      <div
        v-clamp="hasImages ? 3 : 13"
        class="text-body2 text-justify text-onsurface-m"
      >
        {{ md2txt(need.attributes.description) }}
      </div>
    </q-card-section>

    <q-card-actions>
      <contact-button
        v-if="isAvailable"
        flat
        color="primary"
        :contacts="need.member.attributes.contacts"
      >
        {{
          $t("reply")
        }}
      </contact-button>
      <post-status-badges
        v-else
        :status="need.attributes.status"
        :expired="expired"
        :member-active="memberActive"
      />
      <q-space />
      <share-button
        v-if="isAvailable"
        icon="share"
        flat
        round
        color="icon-dark"
        :url="url"
        :title="$t('checkThisNeed', { member: need.member.attributes.name })"
        :text="need.attributes.description"
      />
      <q-btn
        v-if="canEdit"
        icon="edit"
        flat
        round
        color="icon-dark"
        :to="`/groups/${code}/needs/${need.attributes.code}/edit`"
        class="q-ml-none"
        :title="$t('editNeed')"
      />
      <delete-need-btn
        v-if="canEdit"
        :code="code"
        :need="need"
        color="icon-dark"
        class="q-ml-none"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { useStore } from "vuex"
import type { Category, Member, Need } from "src/store/model"
import { useCardClickTo } from "src/composables/useCardClickTo"
import vClamp from "../plugins/Clamp"
import md2txt from "../plugins/Md2txt"
import Carousel from "./Carousel.vue"
import CategoryAvatar from "./CategoryAvatar.vue"
import ContactButton from "./ContactButton.vue"
import MemberHeader from "./MemberHeader.vue"
import ShareButton from "./ShareButton.vue"
import DeleteNeedBtn from "./DeleteNeedBtn.vue"
import PostStatusBadges from "./PostStatusBadges.vue"

type CardNeed = Need & {
  category: Category
  member: Member
}

defineOptions({
  name: "NeedCard"
})

const props = defineProps<{
  code: string
  need: CardNeed
}>()

const store = useStore()
const hasImages = computed(() => props.need.attributes.images.length > 0)
const url = computed(() =>
  `${window.location.origin}/groups/${props.code}/needs/${props.need.attributes.code}`
)
const canEdit = computed(() =>
  props.need.member.id === store.getters.myMember?.id
  || store.getters.isAdmin
)
const memberActive = computed(() => props.need.member.attributes.status === "active")
const expired = computed(() => new Date(props.need.attributes.expires) < new Date())
const isAvailable = computed(() =>
  props.need.attributes.status === "published"
  && memberActive.value
  && !expired.value
)
const isMuted = computed(() => !isAvailable.value)
const targetUrl = computed(() => {
  const path = `/groups/${props.code}/needs/${props.need.attributes.code}`
  return props.need.attributes.status === "draft" ? `${path}/preview` : path
})
const cardClickAttrs = useCardClickTo(targetUrl)
</script>
<style lang="scss" scoped>
  .muted {
    opacity: 0.54;
  }

  .q-ml-none {
    margin-left: 0 !important;
  }
</style>
