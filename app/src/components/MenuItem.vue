<template>
  <q-item
    :clickable="!active"
    :active-class="rail ? 'menu-item--rail-active' : 'bg-active'"
    :active="active"
    :disable="disable"
    :class="{ 'menu-item--rail': rail }"
    @click="itemClick"
  >
    <q-item-section avatar>
      <q-icon
        :name="icon"
        :color="active ? 'primary' : 'icon'"
      />
    </q-item-section>
    <q-item-section
      :class="[
        rail ? 'text-label-medium' : 'text-label-large',
        active ? 'text-primary-variant' : 'text-on-surface-medium'
      ]"
    >
      {{ title }}
    </q-item-section>
    <slot />
  </q-item>
</template>

<script lang="ts">
import { defineComponent } from "vue";
/**
 * List item in the left drawer menu.
 */
export default defineComponent({
  name: "MenuItem",
  props: {
    icon: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    to: {
      type: String,
      required: false,
      default: null
    },
    href: {
      type: String,
      required: false,
      default: null
    },
    rail: {
      type: Boolean,
      required: false,
      default: false
    },
    disable: {
      type: Boolean,
      required: false,
      default: false
    }
  },
  emits: ["click"],
  computed: {
    active(): boolean {
      return this.to == this.$route.path
    },
  },
  methods: {
    itemClick() {
      if (this.to) {
        this.$router.push(this.to);
      } else if (this.href) {
        window.open(this.href, "_blank");
      }
      this.$emit("click");
    }
  }
});
</script>
<style lang="scss" scoped>
.menu-item--rail {
  min-height: 56px;
  padding: 2px 0;
  flex-direction: column;
  align-items: center;

  :deep(.q-item__section--avatar) {
    position: relative;
    flex: none;
    width: 56px;
    min-width: 56px;
    height: 32px;
    align-self: center;
    margin: 0;
    padding: 0;
    align-items: center;
    justify-content: center;
  }

  :deep(.q-item__section--avatar::before) {
    position: absolute;
    z-index: 0;
    width: 56px;
    height: 32px;
    border-radius: 16px;
    content: "";
  }

  :deep(.q-item__section--avatar .q-icon) {
    z-index: 1;
    font-size: 24px;
  }

  :deep(.q-item__section:not(.q-item__section--avatar)) {
    display: flex;
    flex: none;
    width: 100%;
    min-height: 16px;
    margin: 4px 0 0;
    padding: 0;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 16px;
    white-space: normal;
  }

  &.menu-item--rail-active :deep(.q-item__section--avatar::before) {
    background: $active;
  }

  &:hover :deep(.q-item__section--avatar::before) {
    background: $surface-container-high;
  }

  &.menu-item--rail-active:hover :deep(.q-item__section--avatar::before) {
    background: $active;
  }
}
</style>
