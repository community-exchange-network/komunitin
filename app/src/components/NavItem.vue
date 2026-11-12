<template>
  <q-item
    :id="id"
    class="nav-item"
    :class="{ 'nav-item--expanded': expanded }"
    :to="to"
    :active="active"
    active-class="nav-item--active"
    :aria-label="title"
  >
    <q-item-section avatar>
      <avatar
        v-if="avatarText"
        :img-src="avatarImage"
        :text="avatarText"
        size="32px"
      />
      <q-icon
        v-else
        :name="icon ?? ''"
        color="icon"
      />
    </q-item-section>
    <q-item-section class="nav-item__label text-label-medium text-on-surface-medium">
      {{ title }}
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import type { ImageObject } from "@/store/model";
import Avatar from "./Avatar.vue";

withDefaults(defineProps<{
  id: string,
  title: string,
  to: string,
  expanded: boolean,
  icon?: string,
  active?: boolean | null,
  avatarImage?: ImageObject | null,
  avatarText?: string
}>(), {
  active: null
})
</script>

<style lang="scss" scoped>
.nav-item__label {
  display: flex !important;
}

.nav-item {
  min-height: 56px;
  padding: 2px 0;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;

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
    pointer-events: none;
    content: "";
  }

  :deep(.q-avatar),
  :deep(.q-icon) {
    z-index: 1;
  }

  :deep(.q-icon) {
    font-size: 24px;
  }

  :deep(.q-item__section--main) {
    position: relative;
    z-index: 1;
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

  &.nav-item--active :deep(.q-item__section--avatar::before) {
    background: $active;
  }

  &.nav-item--active {
    .nav-item__label {
      color: $primary-variant;
    }

    :deep(.q-icon) {
      color: $primary;
    }
  }

  &:hover:not(:focus-visible) :deep(.q-focus-helper) {
    background: transparent;
    opacity: 0;
  }

  :deep(.q-item__section--avatar:hover::before) {
    background: $surface-container-high;
  }

  &.nav-item--active :deep(.q-item__section--avatar:hover::before) {
    background: $active;
  }

  &.nav-item--expanded {
    padding: 4px 16px;
    flex-direction: row;
    justify-content: flex-start;

    :deep(.q-item__section--avatar) {
      align-self: auto;
    }

    &.nav-item--active :deep(.q-item__section--avatar::before) {
      width: 224px;
      height: 40px;
      border-radius: 20px;
    }

    :deep(.q-item__section--main) {
      flex: 1;
      width: auto;
      margin: 0 0 0 16px;
      align-items: flex-start;
      justify-content: flex-start;
      text-align: left;
    }
  }
}

</style>
