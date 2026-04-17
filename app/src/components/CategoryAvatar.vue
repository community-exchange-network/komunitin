<template>
  <div class="q-py-xs">
    <span
      v-if="caption && right"
      class="q-pr-md text-overline text-uppercase text-onsurface-m"
    >{{ category.attributes.name }}</span>
    <q-avatar
      :icon="icon"
      text-color="onprimary"
      :color="color"
      size="40px"
    >
      <q-tooltip v-if="!caption">
        {{ category.attributes.name }}
      </q-tooltip>
    </q-avatar>
    <span
      v-if="caption && !right"
      class="q-pl-md text-overline text-uppercase text-onsurface-m"
    >{{ category.attributes.name }}</span>
  </div>
</template>
<script lang="ts">
import { defineComponent } from "vue"
export default defineComponent({
  name: "CategoryAvatar",
  props: {
    category: {
      type: Object,
      required: true,
    },
    type: {
      type: String,
      required: false,
      default: "need"
    },
    caption: {
      type: Boolean,
      required: false,
      default: false,
    },
    right: {
      type: Boolean,
      required: false,
      default: false,
    }
  },
  computed: {
    color(): string {
      return this.type == 'need' ? 'kred' : 'kblue';
    },
    icon(): string {
      return this.category.attributes.icon ? `sym_r_${this.category.attributes.icon}` : this.defaultIcon;
    },
    defaultIcon(): string {
      return this.type == 'need' ? "sym_r_loyalty" : "sym_r_local_offer";
    }
  }
})
</script>