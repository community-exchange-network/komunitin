<template>
  <div>
    <q-infinite-scroll
      v-if="!isLoading"
      @load="loadNextResources"
    >
      <empty v-if="isEmpty" />
      <slot
        v-else
        :resources="resources"
      >
        <div class="q-pa-md row q-col-gutter-md">
          <div
            v-for="resource of resources"
            :key="resource.id"
            class="col-12 col-sm-6 col-md-4"
          >
            <!-- this v-if is superfluous, since when this slot is rendered, card is always defined.
            But setting it prevents an unexpected exception in vue-test-utils -->
            <component
              :is="components[card]"
              v-if="card && propName && components[card]"
              :[propName]="resource"
              :code="code"
            />
            <OfferCard
              v-else-if="resource.type === 'offers'"
              :offer="resource"
              :code="code"
            />
            <NeedCard
              v-else-if="resource.type === 'needs'"
              :need="resource"
              :code="code"
            />
          </div>
        </div>
      </slot>
      <template #loading>
        <div class="row justify-center q-my-md">
          <!-- 42px is the default size of q-inner-loading -->
          <q-spinner
            color="icon-dark"
            size="42px"
          />
        </div>
      </template>
    </q-infinite-scroll>
    <q-inner-loading
      :showing="isLoading"
      color="icon-dark"
    />
  </div>
</template>

<script setup lang="ts">
import { type Component, computed, ref, watch } from "vue";
import { useStore } from "vuex";
import Empty from "../components/Empty.vue";
import NeedCard from "../components/NeedCard.vue";
import OfferCard from "../components/OfferCard.vue";
import GroupCard from "../components/GroupCard.vue";
import { type ResourceObject } from "../store/model";
import { type ResourcesState } from "../store/resources"
import { useMergedResources } from "../composables/useMergedResources";

const props = withDefaults(defineProps<{
  /**
   * The group code
   */
  code: string,
  /**
   * The item Vue Component Name
   */
  card?: string | null,
  /**
   * The name of the property that should be send 
   * to the item Vue components.
   */
  propName?: string | null,
  /**
   * The name of the vuex resources module.
   */
  moduleName: string | string[],
  /**
   * The include parameter string when fetching resources.
   */
  include?: string,
  /**
   * The sort parameter string when fetching resources.
   */
  sort?: string,
  /**
   * Filter object. Each pair `key => value` will be added as a
   * query parameter `filter[key]=value`.
   */
  filter?: Record<string, string | number>,
  /**
   * Search query
   */
  query?: string,
  /**
   * Cache time in milliseconds.
   */
  cache?: number | undefined
}>(), {
  card: null,
  propName: "",
  include: "",
  sort: "",
  filter: () => ({}),
  query: "",
  cache: undefined
});

const emit = defineEmits<{
  (e: 'page-loaded', page: number): void
}>()

// Register components for dynamic usage
const components: Record<string, Component> = {
  NeedCard,
  OfferCard,
  GroupCard
}

const store = useStore()
const ready = ref(false)
const location = computed(() => store.state.me.location)

// If props.moduleName is already an array, just return it, otherwise wrap it in an array
const moduleNames = Array.isArray(props.moduleName) ? props.moduleName : [props.moduleName];

const { resources, hasNext, loadNext, fetchResources } = useMergedResources(moduleNames, {
  search: props.query,
  location: location.value,
  include: props.include,
  group: props.code,
  filter: props.filter,
  sort: props.sort,
  cache: props.cache
});

const loadNextResources = async (index: number, done: (stop?: boolean) => void) => {
  if (hasNext.value) {
      await loadNext();
      // emit("page-loaded", state.value.currentPage as number);
    }
    // Stop loading if there is no next page. Note that we're not
    // stopping the infinite scrolling if hasNext returns undcefined.
    done(hasNext.value === false);
}

const isEmpty = computed(() => resources.value.length === 0);
const isLoading = computed(() => {
  const state = store.state[props.moduleName] as ResourcesState<ResourceObject>;
  return !ready.value || state?.currentPage === null || (state?.currentPage === 0 && state?.next === undefined && isEmpty.value);
});

// Refetch resources when any prop changes
watch([() => [props.query, props.code, props.include, props.sort]], () => {
  fetchResources(props.query)
})
watch(() => props.filter, (newFilter, oldFilter) => {
  if (JSON.stringify(newFilter) !== JSON.stringify(oldFilter)) {
    fetchResources(props.query)
  }
})

const init = async () => {
  await fetchResources(props.query);
  emit("page-loaded", 0);
  ready.value = true
}

init()

defineExpose({
  fetchResources,
  loadNext
})
</script>
