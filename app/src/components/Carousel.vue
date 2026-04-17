<template>
  <div>
    <q-carousel
      v-if="images && images.length"
      v-model="slide"
      v-bind="$attrs"
      animated
      swipeable
      infinite
      keep-alive
      :arrows="images.length > 1 && (!thumbnails || $q.screen.lt.md)"
    >
      <q-carousel-slide
        v-for="(image, i) of images"
        :key="i"
        :name="i + 1"
        class="q-pa-none"
        :img-src="image"
      />
    </q-carousel>
    <fit-text
      v-else
      update
      class="placeholder"
    >
      <q-icon name="sym_r_no_photography" />
    </fit-text>
    <div
      v-if="thumbnails && (images.length > 1)"
      class="gt-sm q-mt-none row q-col-gutter-sm"
    >
      <div
        v-for="(image, i) of images"
        :key="i"
        class="col-3"
      >
        <img
          :src="image"
          class="thumbnail vertical-bottom cursor-pointer"
          :class="'thumbnail-' + (slide == i + 1 ? 'active' : 'inactive')"
          @click="slide = i + 1"
        >
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue";
import FitText from "./FitText.vue";
/**
 * Almost just a wrapper around Quasar QCarousel to avoid repetition and unify behavior across the app.
 */
export default defineComponent({
  components: {
    FitText
  },
  props: {
    thumbnails: {
      type: Boolean,
      required: false,
      default: false,
    },
    images: {
      type: Array,
      required: true,
    }
  },
  data: () => ({
    slide: 1
  }),
});
</script>
<style lang="scss" scoped>
.thumbnail {
  width: 100%;
  max-height: 64px;
  object-fit: cover;
  object-position: center;
  overflow: clip;
}
.thumbnail-inactive {
  opacity: 0.5;
}
.thumbnail-inactive:hover {
  opacity: 1;
}
.placeholder{
  color: rgba(0,0,0,0.12);
  line-height: 0;
  padding: 0 48px;
}
</style>