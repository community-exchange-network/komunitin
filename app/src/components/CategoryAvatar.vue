<template>
  <div class="q-py-xs">
    <span
      v-if="category && caption && right"
      class="q-pr-md text-overline text-uppercase text-on-surface-medium"
    >{{ category.attributes.name }}</span>
    <q-avatar
      :icon="icon"
      text-color="on-primary"
      :color="color"
      size="40px"
    >
      <q-tooltip v-if="category && !caption">
        {{ category.attributes.name }}
      </q-tooltip>
    </q-avatar>
    <span
      v-if="category && caption && !right"
      class="q-pl-md text-overline text-uppercase text-on-surface-medium"
    >{{ category.attributes.name }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue"
import type { Category } from "@/store/model"

const props = withDefaults(defineProps<{
  category: Category | null,
  type?: "offers" | "needs",
  caption?: boolean,
  right?: boolean
}>(), {
  type: "needs",
  caption: false,
  right: false
})

const color = computed(() => props.type === "needs" ? "want" : "offer")
const defaultIcon = computed(() => props.type === "needs" ? "loyalty" : "local_offer")
const icon = computed(() => props.category?.attributes.icon?.value ?? defaultIcon.value)
</script>
