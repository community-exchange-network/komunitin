<template>
  <q-item
    :clickable="to !== route.path"
    active-class="bg-active"
    :active="active"
    :disable="disable"
    @click="itemClick"
  >
    <q-item-section avatar>
      <q-icon
        :name="icon"
        :color="active ? 'primary' : 'icon'"
      />
    </q-item-section>
    <q-item-section
      class="text-label-large"
      :class="active ? 'text-primary-variant' : 'text-on-surface-medium'"
    >
      {{ title }}
    </q-item-section>
    <slot />
  </q-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * List item in the left drawer menu.
 */

const props = withDefaults(defineProps<{
  icon: string
  title: string
  to?: string | null
  href?: string | null
  disable?: boolean
  exact?: boolean
}>(), {
  to: null,
  href: null
})

const emit = defineEmits<{ click: [] }>()
const route = useRoute()
const router = useRouter()

const active = computed(() => !!props.to && (
  route.path === props.to || (!props.exact && route.path.startsWith(`${props.to}/`))
))

const itemClick = () => {
  if (props.to) {
    router.push(props.to)
  } else if (props.href) {
    window.open(props.href, '_blank')
  }
  emit('click')
}
</script>
