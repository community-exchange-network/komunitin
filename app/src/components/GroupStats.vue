<template>
  <q-card
    v-bind="cardClickAttrs"
    flat
    bordered
  >
    <q-card-section class="q-pb-none q-pt-sm">
      <div class="text-overline text-onsurface-m">
        <q-icon
          :name="icon"
          size="xs"
          color="icon-dark"
        />
        {{ title }}
      </div>
    </q-card-section>
    <q-card-section horizontal>
      <q-card-section class="col-4">
        <h2 class="q-mt-none q-mb-md">
          {{ content }}
        </h2>
        <div class="k-inset-actions-md">
          <q-btn
            :to="href"
            flat
            color="primary"
            :label="$t('explore')"
          />
        </div>
      </q-card-section>
      <q-card-section class="col-8 text-onsurface-m">
        <ul class="q-pa-none q-ma-none">
          <li
            v-for="(item, i) in items"
            :key="i"
          >
            {{ item }}
          </li>
        </ul>
      </q-card-section>
    </q-card-section>
  </q-card>
</template>
<script lang="ts">
import { defineComponent } from "vue";
import { useCardClickTo } from "src/composables/useCardClickTo"

/**
 * This component wraps a card with a predefined structure to be used in
 * Group view. It has a title, a big short value, a list of items and
 * finally and Explore button.
 *
 * +-----------------------+
 * | [icon] title          |
 * |               item[0] |
 * | CONTENT       item[1] |
 * |               item[2] |
 * | Explore               |
 * +-----------------------+
 *
 */
export default defineComponent({
  name: "GroupStats",
  props: {
    icon: {
      type: String,
      default: "",
      required: true
    },
    title: {
      type: String,
      default: "",
      required: true
    },
    content: {
      type: [String, Number],
      default: 0,
      required: true
    },
    items: {
      type: Array,
      default: undefined,
      required: true
    },
    href: {
      type: String,
      default: "",
      required: true
    }
  },
  setup(props) {
    return {
      cardClickAttrs: useCardClickTo(() => props.href)
    }
  }
});
</script>
