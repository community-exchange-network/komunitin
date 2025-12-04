<template>
  <collapsible-header
    :collapsible-height="200"
    :fixed-height="72"
  >
    <div class="row q-py-lg text-onsurface-m bg-active collapsible-content">
      <div class="col-md-4 col-6 q-px-md">
        <img
          v-if="props.group.attributes.image"
          class="group-image q-mx-auto"
          :src="props.group.attributes.image"
        >
        <div
          v-else
          class="group-image q-mx-auto"
        >
          <fit-text update>
            <avatar
              :text="props.group.attributes.name"
              size="inherit"
            />
          </fit-text>
        </div>
      </div>
      <div class="col column">
        <div>
          <div class="text-overline text-uppercase text-onsurface-d">
            GROUP
          </div>
          <div 
            v-if="props.group" 
            class="text-h6 text-onsurface"
          >
            {{ props.group.attributes.name }}
          </div>
        </div>
      </div>
    </div>
    <template #fixed>
      <q-tabs
        :model-value="props.tab"
        active-bg-color="active"
        active-color="primary"
        class="bg-surface text-onsurface-m full-width"
        align="justify"
        @update:model-value="tabChange"
      >
        <q-tab
          name="overview"
          icon="account_circle"
          :label="$t('profile')"
        />
        <q-tab
          name="foo"
          icon="account_circle"
          :label="$t('foo')"
        />
      </q-tabs>
    </template>
  </collapsible-header>
</template>
<script lang="ts" setup>

import { defineProps } from 'vue';
import Avatar from 'src/components/Avatar.vue';
import FitText from 'src/components/FitText.vue';
import type { Group } from 'src/store/model';
import CollapsibleHeader from "../../layouts/CollapsibleHeader.vue";

const props = defineProps<{
  group: Group,
  tab: string,
}>();

const emit = defineEmits<{
  (e: 'tab-change', value: string): void
}>();

const tabChange = (value: string) => {
  emit('tab-change', value);
};
</script>

<style lang="scss" scoped>
// Style image:
.group-image {
  display: block;
  width: 100%;
  max-height: 152px;
  max-width: 152px;
  border-radius: 76px;
  line-height: 0;
  object-fit: cover;
  aspect-ratio: 1/1;
}
.collapsible-content {
  height: 200px;
}
</style>
