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

