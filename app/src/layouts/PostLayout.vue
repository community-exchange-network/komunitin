<template>
  <q-card class="bg-surface">
    <q-card-section>
      <div class="row q-col-gutter-lg">
        <!--
          On mobile, display: contents removes this column's layout box, making its images
          and map flex items of the outer row. order-last places the map below the content
          without remounting it. Mobile gutters still target this wrapper's DOM children.
        -->
        <div
          class="col-md-6"
          :class="{ 'q-col-gutter-lg': !$q.screen.gt.sm }"
          :style="{ display: $q.screen.gt.sm ? 'block' : 'contents' }"
        >
          <div v-if="numImages > 0" class="full-width" :class="{ 'q-mb-md': $q.screen.gt.sm }">
            <carousel
              :images="post.attributes.images"
              thumbnails
              height="300px"
            />
          </div>
          <location-map
            class="full-width order-last"
            :height="numImages > 0 ? '250px' : undefined"
            :center="post.member.attributes.location?.coordinates ?? post.member.group.attributes.location?.coordinates"
            :marker="post.member.attributes.location?.coordinates"
            :name="post.member.attributes.location?.name"
          />
        </div>
        <div class="col-12 col-md-6">
          <category-avatar
            :type="post.type"
            :category="post.category"
            class="q-mb-md"
            caption
          />
          <div class="q-mb-md">
            <slot name="header" />
            <div class="text-caption text-muted row items-center">
              <q-icon name="schedule" size="16px" class="q-mr-xs" />
              <time :datetime="post.attributes.updated">
                {{ $t('updatedAt', { date: $formatDate(post.attributes.updated) }) }}
              </time>
            </div>
          </div>
          <q-separator />
          <member-header
            :to="`/groups/${code}/members/${post.member.attributes.code}`"
            :member="post.member"
            class="q-px-none"
          >
            <template #side>
              <q-icon name="chevron_right" />
            </template>
          </member-header>
          <q-separator class="q-mb-md" />
          <!-- eslint-disable vue/no-v-html -->
          <div
            class="text-body1 text-onsurface"
            v-html="md2html(post.attributes.description)"
          />
          <!-- eslint-enable vue/no-v-html -->
          <post-expiry
            v-if="post.attributes.expires"
            :expires="post.attributes.expires"
            class="q-mt-md"
          />
          <div class="row items-center q-gutter-sm q-mt-md">
            <slot name="actions" />
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>
<script setup lang="ts">
import { computed } from "vue"
import type { Category, Group, Member, Need, Offer } from "../store/model"
import PostExpiry from "../components/PostExpiry.vue"
import MemberHeader from "../components/MemberHeader.vue"
import Carousel from "../components/Carousel.vue"
import CategoryAvatar from "../components/CategoryAvatar.vue"
import LocationMap from "../components/LocationMap.vue"
import md2html from "../plugins/Md2html"

const props = defineProps<{
  post: (Offer | Need) & {
    category: Category | null
    member: Member & { group: Group }
  }
  code: string
}>()

const numImages = computed(() => props.post.attributes.images.length)
</script>
