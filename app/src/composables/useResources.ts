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

export const useResources = <T extends ResourceObject = ResourceObject>(type: string, options: LoadListPayload, config?: UseResourcesConfig) => {
  const store = useStore();
  const resources = computed<T[]>(() => store.getters[`${type}/currentList`] ?? []);
  const loading = ref(false);
  const lastOptions = ref<LoadListPayload>({ ...options });

  const load = async (overrides: Partial<LoadListPayload> = {}) => {
    const currentOptions = { ...options, ...overrides };
    lastOptions.value = currentOptions;
    loading.value = true;
    try {
      await store.dispatch(type + "/loadList", {
        ...currentOptions,
      });
    } finally {
      loading.value = false;
    }
  };
  const loadNext = async () => {
    try {
      loading.value = true;
      await store.dispatch(`${type}/loadNext`, lastOptions.value);
    } finally {
      loading.value = false;
    }
  };
  const hasNext = computed<boolean | undefined>(() => store.getters[`${type}/hasNext`]);

  // initially load the first page
  if (config?.immediate ?? true) {
    load();
  }
  
  return { resources, loadNext, hasNext, load, loading };
};

export type UseResourceOptions = Omit<LoadByIdPayload, 'id'> & {
  // Use undefined (or don't set) for loading resources without id: currency, currency settings, group etc.
  // Use null for not loading any resource.
  id?: MaybeRefOrGetter<string> | null;
}
  

export const useResource = <T extends ResourceObject = ResourceObject>(type: string, options: UseResourceOptions, config?: UseResourcesConfig) => {
  const store = useStore()
  
  const id = ref<string|null|undefined>(toValue(options.id))
  const resource = computed<T | null>(() => id.value ? store.getters[`${type}/one`](id.value) : null)

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