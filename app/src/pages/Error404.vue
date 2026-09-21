<template>
  <div class="fixed-center text-center">
    <p>
      <img
        src="~@/assets/sad.svg"
        style="width:30vw;max-width:150px;"
      >
    </p>
    <p class="text-faded">
      {{ $t('sorryNothingHere') }}
    </p>
    <q-btn
      color="secondary"
      style="width:200px;"
      to="/"
      label="Go back"
    />
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue";
export default defineComponent({
  name: "Error404"
});
</script>