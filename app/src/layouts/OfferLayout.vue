<template>
  <div>
    <div
      class="row q-col-gutter-md"
    >
      <div class="col-md-6 col-12 column q-gutter-y-md">
        <div>
          <slot name="member" />
        </div>
        <div
          v-if="numImages > 0"
          class="item relative-position"
        >
          <slot name="images" />
          <div 
            class="q-ml-sm q-mb-sm absolute-bottom-left"
          >
            <slot name="category" />
          </div>
        </div>
        <div 
          v-if="numImages === 0"
          class="">
          <slot name="category" />
        </div>
        <div v-if="$q.screen.gt.sm">
          <slot name="map" />
        </div>
      </div>
      <div class="col-md-6 col-12 column q-gutter-y-md">
        <div class="content">
          <slot name="content" />
        </div>
        <div v-if="!$q.screen.gt.sm">
          <slot name="map" />
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue"
export default defineComponent({
  props: {
    numImages: {
      type: Number,
      required: true
    }
  },
})
</script>