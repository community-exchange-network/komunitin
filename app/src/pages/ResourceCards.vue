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
              :is="components[card]"
              v-if="card && components[card]"
              :[propName]="resource"
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
import Empty from "../components/Empty.vue";
import NeedCard from "../components/NeedCard.vue";
import OfferCard from "../components/OfferCard.vue";
import GroupCard from "../components/GroupCard.vue";
import { ResourceObject } from "../store/model";
import { ResourcesState } from "../store/resources"
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
  moduleName: string,
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
const state = computed(() => store.state[props.moduleName] as ResourcesState<ResourceObject>)
const resources = computed(() => {
  const resources = []
  if (state.value.currentPage !== null) {
    for (let i = 0; i <= state.value.currentPage; i++) {
      const page = store.getters[`${props.moduleName}/page`](i)
      if (page) {
        resources.push(...page)
      }
    }
  }
  return resources
})
const isEmpty = computed(() => resources.value.length === 0)
const isLoading = computed(() => {
  return (!ready.value || state.value.currentPage === null || (state.value.currentPage === 0 && state.value.next === undefined && isEmpty.value))
})

const fetchResources = async (search?: string) => {
  await store.dispatch(props.moduleName + "/loadList", {
    location: location.value,
    search,
    include: props.include,
    group: props.code,
    filter: props.filter,
    sort: props.sort,
    cache: props.cache
  });
  emit("page-loaded", 0);
}

const loadNext = async (index: number, done: (stop?: boolean) => void) => {
  if (store.getters[props.moduleName + "/hasNext"]) {
    await store.dispatch(props.moduleName + "/loadNext", {
      cache: props.cache
    });
    emit("page-loaded", state.value.currentPage as number);
  }
  // Stop loading if there is no next page. Note that we're not
  // stopping the infinite scrolling if hasNext returns undefined.
  done(store.getters[props.moduleName + "/hasNext"] === false);
}

// Refetch resources when any prop changes
watch(() => [props.query, props.code, props.filter, props.include, props.sort], () => {
  fetchResources(props.query)
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
