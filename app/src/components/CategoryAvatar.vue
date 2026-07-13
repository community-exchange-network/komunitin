<template>
  <div class="q-py-xs">
    <span
      v-if="caption && right"
      class="q-pr-md text-overline text-uppercase text-onsurface-m"
    >{{ category.attributes.name }}</span>
    <q-avatar
      :icon="icon"
      text-color="onprimary"
      :color="color"
      size="40px"
    >
      <q-tooltip v-if="!caption">
        {{ category.attributes.name }}
      </q-tooltip>
    </q-avatar>
    <span
      v-if="caption && !right"
      class="q-pl-md text-overline text-uppercase text-onsurface-m"
    >{{ category.attributes.name }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue"
import type { Category } from "src/store/model"

const props = withDefaults(defineProps<{
  category: Category,
  type?: "need" | "offer",
  caption?: boolean,
  right?: boolean
}>(), {
  type: "need",
  caption: false,
  right: false
})

const color = computed(() => props.type === "need" ? "kred" : "kblue")
const defaultIcon = computed(() => props.type === "need" ? "loyalty" : "local_offer")
const icon = computed(() => props.category.attributes.icon?.value ?? defaultIcon.value)
</script>
