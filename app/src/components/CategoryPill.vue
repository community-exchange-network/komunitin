<template>
  <div
    class="q-pa-sm row items-center bg-light pill"
  >
    <q-avatar
      :icon="icon"
      text-color="onprimary"
      :color="iconColor"
      size="md"
    />
    <span class="text-uppercase text-secondary q-mx-sm label">{{ category.attributes.name }}</span>
</div>
</template>

<script setup lang="ts">
import { computed } from "vue"
import type { Category } from "src/store/model"

const props = withDefaults(
  defineProps<{
    category: Category
    type?: string
  }>(),
  {
    type: "need",
  },
)

const iconColor = computed<string>(() => (props.type === "need" ? "kred" : "kblue"))

const defaultIcon = computed<string>(() =>
  props.type === "need" ? "loyalty" : "local_offer",
)

const icon = computed<string>(() => props.category.attributes.icon ?? defaultIcon.value)
</script>

<style lang="scss" scoped>
.pill {
  border-radius: 30px;
}
.label {
  font-weight: 600;
  letter-spacing: 0.06em;
}
</style>