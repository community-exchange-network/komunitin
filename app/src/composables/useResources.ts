import { type LoadByIdPayload, type LoadListPayload } from "../store/resources";
import { computed, ref } from "vue";
import { useStore } from "vuex";
import type { ResourceObject } from "../store/model";
import { type DeepPartial } from "quasar";

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

export const useResource = <T extends ResourceObject = ResourceObject>(type: string, options: LoadByIdPayload, config?: UseResourcesConfig) => {
  const store = useStore()
  const resource = computed<T>(() => store.getters[`${type}/one`](options.id))
  const loading = ref(false)
  const load = async () => {
    loading.value = true
    try {
      await store.dispatch(type + '/load', options)
    } finally {
      loading.value = false
    }
  }

  const update = async (data: DeepPartial<T>) => {
    loading.value = true
    try {
      await store.dispatch(type + '/update', {
        id: options.id,
        group: options.group,
        resource: data
      })
    } finally {
      loading.value = false
    }
  }

  // initially load the resource
  if (config?.immediate ?? true) {
    load()
  }

  return { resource, load, update, loading }

}