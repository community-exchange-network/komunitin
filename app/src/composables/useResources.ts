import { type LoadListPayload } from "../store/resources";
import { computed, ref } from "vue";
import { useStore } from "vuex";

export interface UseResourcesConfig {
  /**
   * If true, the first page will be loaded immediately. Otherwise, the user
   * has to call the load method manually. Default: true.
   */
  immediate?: boolean;
}

export const useResources = (type: string, options: LoadListPayload, config?: UseResourcesConfig) => {
  const store = useStore();
  const resources = computed(() => store.getters[`${type}/currentList`] ?? []);
  const loading = ref(false);
  const load = async (search?: string) => {
    loading.value = true;
    try {
      await store.dispatch(type + "/loadList", {
        ...options,
        ...(search ? { search } : {}),
      });
    } finally {
      loading.value = false;
    }
  };
  const loadNext = async () => {
    try {
      loading.value = true;
      await store.dispatch(`${type}/loadNext`, options);
    } finally {
      loading.value = false;
    }
  };
  const hasNext = computed(() => store.getters[`${type}/hasNext`]);

  // initially load the first page
  if (config?.immediate ?? true) {
    load();
  }
  
  return { resources, loadNext, hasNext, load, loading };
};

// export const useResources = (
//   type: string,
//   options?: { [key: string]: string }
// ) => {
//   const resources: Ref<ResourceObject[]> = ref([]);
//   const store = useStore();
//   const state = computed(
//     () => store.state[type] as ResourcesState<ResourceObject>
//   );

//   const hasNext = computed(() => store.getters[type + "/hasNext"]);
//   console.log({ type, hasNext: hasNext.value });

//   const loadNext = async (index: number, done: (stop?: boolean) => void) => {
//     console.log(store.state[type]);
//     console.log("loadNext", { hasNext: hasNext.value });
//     if (hasNext.value) {
//       await store.dispatch(type + "/loadNext", {
//         cache: options?.cache,
//       });
//       // emit("page-loaded", state.value.currentPage as number);
//     }
//     // Stop loading if there is no next page. Note that we're not
//     // stopping the infinite scrolling if hasNext returns undcefined.
//     done(hasNext.value === false);
//   };

//   if (state.value.currentPage !== null) {
//     console.log(state.value.currentPage);
//     for (let i = 0; i <= state.value.currentPage; i++) {
//       const page = store.getters[`${type}/page`](i);
//       if (page) {
//         resources.value.push(...page);
//       }
//     }
//   }

//   return {
//     resources,
//     hasNext: hasNext.value,
//     loadNext,
//   };
// };
