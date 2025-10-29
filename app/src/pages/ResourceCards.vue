<template>
  <div>
    <q-infinite-scroll
      @load="loadNextResources"
    >
      <empty v-if="isEmpty" />
      <slot v-else :resources="resources">
        <div class="q-pa-md row q-col-gutter-md">
          <div
            v-for="resource of resources"
            :key="resource.id"
            class="col-12 col-sm-6 col-md-4"
          >
            <!-- if card and propName props are defined, render the dynamic component -->
            <component
              :is="components[resource.type].component"
              v-bind="{
                [components[resource.type].propName]: resource, 
                code
              }"
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
      :showing="loading"
      color="icon-dark"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useStore } from "vuex";
import Empty from "../components/Empty.vue";
import NeedCard from "../components/NeedCard.vue";
import OfferCard from "../components/OfferCard.vue";
import GroupCard from "../components/GroupCard.vue";
import { useMergedResources } from "../composables/useMergedResources";

const props = defineProps<{
  /**
   * The group code
   */
  code: string,
  /**
   * The name of the vuex resources module.
   */
  type: string | string[],
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
  filter?: Record<string, string | string[]>,
  /**
   * Search query
   */
  query?: string,
  /**
   * Cache time in milliseconds.
   */
  cache?: number | undefined
}>();

const emit = defineEmits<{
  (e: 'page-loaded', page: number): void
}>()

// Register components for dynamic usage
const components = {
  "needs": {
    component: NeedCard,
    propName: "need"
  },
  "offers": {
    component: OfferCard,
    propName: "offer"
  },
  "groups": {
    component: GroupCard,
    propName: "group"
  }
}

const store = useStore()
const location = computed(() => store.state.me.location)
const currentPage = ref(0)

// If props.moduleName is already an array, just return it, otherwise wrap it in an array
const types = Array.isArray(props.type) ? props.type : [props.type];

const { resources, hasNext, loadNext, load, loading } =  useMergedResources(types, {
  search: props.query,
  location: location.value,
  include: props.include,
  group: props.code,
  filter: props.filter,
  sort: props.sort,
  cache: props.cache
}, { immediate: false });

const loadNextResources = async (index: number, done: (stop?: boolean) => void) => {
  if (hasNext.value && !loading.value) {
    await loadNext();
    currentPage.value += 1;
    emit("page-loaded", currentPage.value);
  }
  // Stop loading if there is no next page. Note that we're not
  // stopping the infinite scrolling if hasNext returns undcefined.
  done(!hasNext.value);
}

const isEmpty = computed(() => resources.value.length === 0 && !loading.value && hasNext.value === false);

const loadResources = async () => {
  await load(props.query);
  currentPage.value = 0;
  emit("page-loaded", currentPage.value);
}
// Refetch resources when any prop changes
watch([() => [props.query, props.code, props.include, props.sort]], loadResources)
watch(() => props.filter, (newFilter, oldFilter) => {
  if (JSON.stringify(newFilter) !== JSON.stringify(oldFilter)) {
    loadResources();
  }
})

const init = async () => {
  await loadResources();
}
init()

defineExpose({
  // Load method is called when searching or filtering
  load: loadResources
})
</script>
