<template>
  <q-item
    class="text-onsurface-m"
  >
    <q-item-section avatar>
      <avatar
        :img-src="group.attributes.image"
        :text="group.attributes.code"
      />
    </q-item-section>
    <q-item-section>
      <div class="text-subtitle2">
        {{ group.attributes.name }}
      </div>
      <q-item-label caption>
        {{
          group.attributes.code
        }}
      </q-item-label>
    </q-item-section>
    <slot name="extra" />
    <q-item-section side>
      <!-- No content by default on the side slot -->
      <slot name="side" />
    </q-item-section>
  </q-item>
</template>
<script setup lang="ts">
import type { Group } from 'src/store/model';
import Avatar from './Avatar.vue'

defineProps<{
  group: Group
}>()
</script>