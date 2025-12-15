import { type LoadByIdPayload, type LoadListPayload } from "../store/resources";
import { watch, computed, type MaybeRefOrGetter, ref, toValue } from "vue";
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

export type UseResourceOptions = Omit<LoadByIdPayload, 'id'> & {
  // Use undefined for loading resources without id: currency, currency settings, group etc.
  // Use null for not loading any resource.
  id: MaybeRefOrGetter<string> | undefined | null;
}
  

export const useResource = <T extends ResourceObject = ResourceObject>(type: string, options: UseResourceOptions, config?: UseResourcesConfig) => {
  const store = useStore()
  
  const id = ref<string>(toValue(options.id))
  const resource = computed<T>(() => id.value ? store.getters[`${type}/one`](id.value) : null)

  const loading = ref(false)

  const load = async () => {
    if (id.value === null) {
      return
    }
    loading.value = true
    try {
      await store.dispatch(type + '/load', {
        ...options,
        id: id.value
      })

      // Update id in case it was not set initially
      const fetched = store.getters[`${type}/current`]
      if (fetched) {
        id.value = fetched.id
      }
      
    } finally {
      loading.value = false
    }
  }

  const update = async (data: DeepPartial<T>) => {
    loading.value = true
    try {
      await store.dispatch(type + '/update', {
        id: id.value,
        group: options.group,
        resource: data
      })
    } finally {
      loading.value = false
    }
  }

  // load resource initially and when id changes
  watch(() => toValue(options.id), () => {
    id.value = toValue(options.id)
    load()
  }, { immediate: config?.immediate ?? true })

  return { resource, load, update, loading }

}