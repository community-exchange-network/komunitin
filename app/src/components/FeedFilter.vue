<template>
  <div class="filter-bar row no-wrap items-center q-px-md q-py-sm bg-surface text-onsurface-m">
    <q-chip
      v-for="opt in typeOptions"
      :key="opt.value"
      clickable
      :outline="type !== opt.value"
      :selected="type === opt.value"
      :color="type === opt.value ? 'active' : undefined"
      :text-color="type === opt.value ? 'primary' : 'onsurface-m'"
      :icon="opt.icon"
      @click="$emit('update:type', opt.value)"
    >
      {{ $t(opt.label) }}
    </q-chip>

    <q-chip
      clickable
      selected
      color="active"
      text-color="primary"
      icon="sort"
      icon-right="arrow_drop_down"
    >
      {{ $t(currentSortLabel) }}
      <q-menu>
        <q-list>
          <q-item
            v-for="opt in sortOptions"
            :key="opt.value"
            v-close-popup
            clickable
            :active="sort === opt.value"
            active-class="bg-active text-primary"
            @click="$emit('update:sort', opt.value)"
          >
            <q-item-section avatar>
              <q-icon :name="opt.icon" />
            </q-item-section>
            <q-item-section>{{ $t(opt.label) }}</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-chip>
  </div>
</template>
<script setup lang="ts">
/**
 * Filter bar for the home feed: a type toggle (All / Offers / Wants) and a sort-order
 * dropdown chip (Date / Distance). Category and date-range filtering live in
 * AdvancedFilters.vue instead, opened from the page header. Emits
 * ids/keys rather than full resources so the parent can pass them straight into
 * ResourceCards' `type` and `sort` props. Laid out as a single non-wrapping,
 * horizontally scrollable row so every chip stays reachable on mobile widths.
 */
import { computed } from "vue";

export type FeedType = "all" | "offers" | "needs";
/**
 * How the feed is ordered: by creation date (newest first) or by distance to the
 * current location.
 */
export type SortOption = "date" | "distance";

const typeOptions: { value: FeedType, label: string, icon: string }[] = [
  { value: "all", label: "allTypes", icon: "apps" },
  { value: "offers", label: "offers", icon: "local_offer" },
  { value: "needs", label: "needs", icon: "loyalty" },
]

const sortOptions: { value: SortOption, label: string, icon: string }[] = [
  { value: "date", label: "date", icon: "schedule" },
  { value: "distance", label: "distance", icon: "near_me" },
]

const props = defineProps<{
  type: FeedType,
  sort: SortOption
}>()

defineEmits<{
  (e: "update:type", value: FeedType): void,
  (e: "update:sort", value: SortOption): void
}>()

const currentSortLabel = computed(() => sortOptions.find(opt => opt.value === props.sort)?.label ?? "date")

</script>
<style lang="scss" scoped>
.filter-bar {
  overflow-x: auto;
  // Hide the scrollbar while keeping the row scrollable: all the chips stay
  // reachable by a swipe on mobile without a rail taking up filter-bar height.
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }

  > * {
    flex-shrink: 0;
  }
}
</style>
