<template>
  <div class="row">
    <div class="col-12 col-sm-6 col-md-4 q-pa-lg xs-last">
      <img
        class="full-width empty-img"
        src="~@/assets/acorn-512.png"
      >
    </div>
    <div class="col-12 col-sm-6 col-md-8 q-pa-lg self-center">
      <div class="text-h4 text-onsurface-m">
        {{ header }}
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue"
export default defineComponent({
  props: {
    text: {
      type: String,
      default: "",
      required: false,
    }
  },
  computed: {
    header(): string {
      return this.text == "" ? this.$t('nothingHere') : this.text;
    }
  }
})
</script>
<style lang="scss" scoped>
  .empty-img {
    opacity: 75%;
  }
  @media (max-width: $breakpoint-xs-max) {
    .xs-last {
      order: 2;
    }
  }

</style>