<template>
  <div>
    <div
      class="column q-col-gutter-md"
      :style="$q.screen.gt.sm ? `height: ${parentHeight}px` : ''"
    >
      <div class="col-auto item">
        <slot name="member" />
      </div>
      <div
        v-if="numImages > 0"
        class="col-auto item relative-position"
      >
        <slot name="images" />
        <div class="q-ml-lg q-mb-sm absolute-bottom-left">
          <slot name="category" />
        </div>
      </div>
      <div class="col-auto item sm-last">
        <slot name="map" />
      </div>
      <div 
        v-if="numImages === 0"
        class="col-auto item">
        <slot name="category" />
      </div>
      <div class="col-auto item content">
        <slot name="content" />
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
  computed: {
    parentHeight(): number {
      // This is the height (in pixels) of the member header.
      let height = 64;
      if (this.numImages > 0) {
        // This is the height of the image (400) and its padding (16).
        height += 416;
        // This is the height of the thumbnails.
        if (this.numImages > 1) {
          height += 94 * Math.ceil(this.numImages / 4);
        }
      }
      // This is the height of the map (200), its padding (16) and its label (21).
      height += 237;
      return height;
    }
  }
})
</script>
<style lang="scss" scoped>
/* 
On large screens, make two columns layout and send the content to the last position,
that ends being the first element of the second column.
*/
@media (min-width: $breakpoint-md-min){
  .item {
    width: 50%;
  }
  .content {
    height: 0;
  }
}
@media (max-width: $breakpoint-sm-max){
  .sm-last {
    order: 1000;
  }
}
</style>