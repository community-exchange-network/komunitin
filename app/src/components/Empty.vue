<template>
  <div class="row justify-center q-pa-md">
    <div class="col-12 col-sm-10 col-md-8">
      <q-card class="q-pa-md">
        <q-card-section class="flex justify-center q-mt-md">
          <q-avatar color="light" text-color="muted" icon="upcoming" size="4rem"/>
        </q-card-section>
        <section class="flex justify-center q-mb-md">
          <span class="text-h6 text-weight-semi-bold text-onsurface-m">{{  header }}</span>
        </section>
      </q-card>
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