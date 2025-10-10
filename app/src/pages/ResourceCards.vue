<template>
  <div>
    <q-infinite-scroll
      v-if="!isLoading"
      @load="loadNext"
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
              :is="components[cardComponent(resource)]"
              v-if="cardComponent(resource) && components[cardComponent(resource)]"
              v-bind="getCardProps(resource)"
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
import { type Component, computed, ref, watch, useAttrs } from "vue";
import Empty from "../components/Empty.vue";
import NeedCard from "../components/NeedCard.vue";
import OfferCard from "../components/OfferCard.vue";
import GroupCard from "../components/GroupCard.vue";
import type { ResourceObject } from "../store/model";
import type { ResourcesState } from "../store/resources"
import { useStore } from "vuex";

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
  propName?: string,
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
const attrs = useAttrs()
const location = computed(() => store.state.me.location)

// If props.moduleName is already an array, just return it, otherwise wrap it in an array
const moduleNames = computed(() =>
  Array.isArray(props.moduleName) ? props.moduleName : [props.moduleName]
);

// Helper to get resources for a module
function getModuleResources(moduleName: string) {
  const state = store.state[moduleName] as ResourcesState<ResourceObject>;
  const resources: ResourceObject[] = [];
  if (state?.currentPage !== null) {
    for (let i = 0; i <= state.currentPage; i++) {
      const page = store.getters[`${moduleName}/page`](i);
      if (page) {
        resources.push(...page);
      }
    }
  }
  return resources;
}

// Merge resources from all modules
const resources = computed(() => {
  return moduleNames.value.flatMap(getModuleResources);
});

type ResourceComponent = {
  componentName: string | undefined,
  propName: string,
}
const cardResourceMap: Record<string, ResourceComponent> = {
  offers: {componentName: OfferCard.name, propName: 'offer'},
  needs: {componentName: NeedCard.name, propName: 'need'},
  groups: {componentName: GroupCard.name, propName: 'group'},
}
// Return props.card if set, otherwise return the card belonging to the resource type
const cardComponent = (resource:ResourceObject) => props.card ?? cardResourceMap[resource.type]?.componentName;

// Return props.propName if set, otherwise return the propName belonging to the resource type
const cardPropName = (resource:ResourceObject) => 'propName' in attrs ? props.propName : cardResourceMap[resource.type]?.propName;
const getCardProps = (resource:ResourceObject) => {
  const propName = cardPropName(resource);
  return {
    [propName]: resource
  };
};

const isEmpty = computed(() => resources.value.length === 0);
const isLoading = computed(() => {
  // Consider loading if any module is loading
  return !ready.value || moduleNames.value.some(moduleName => {
    const state = store.state[moduleName] as ResourcesState<ResourceObject>;
    return state?.currentPage === null || (state?.currentPage === 0 && state?.next === undefined && isEmpty.value);
  });
});

// Fetch resources for all modules
const fetchResources = async (search?: string) => {
  await Promise.all(moduleNames.value.map(moduleName =>
    store.dispatch(moduleName + "/loadList", {
      location: location.value,
      search,
      include: props.include,
      group: props.code,
      filter: props.filter,
      sort: props.sort,
      cache: props.cache
    })
  ));
  emit("page-loaded", 0);
}

// Load next page for all modules
const loadNext = async (index: number, done: (stop?: boolean) => void) => {
  await Promise.all(moduleNames.value.map(async moduleName => {
    if (store.getters[moduleName + "/hasNext"]) {
      await store.dispatch(moduleName + "/loadNext", {
        cache: props.cache
      });
      const state = store.state[moduleName] as ResourcesState<ResourceObject>;
      emit("page-loaded", state.value.currentPage);
    }
  }));
  // Stop loading if all modules have no next page
  done(moduleNames.value.every(moduleName => store.getters[moduleName + "/hasNext"] === false));
}

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
  await fetchResources(props.query)
  ready.value = true
}

init()

defineExpose({
  fetchResources,
  loadNext
})
</script>
