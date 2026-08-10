import { type LoadByIdPayload, type LoadListPayload } from "../store/resources";
import { watch, computed, type MaybeRefOrGetter, ref, toValue, type Ref } from "vue";
import { useStore } from "vuex";
import type { ResourceObject } from "../store/model";
import { type DeepPartial } from "quasar";
import KError, { KErrorCode } from "../KError";


export interface UseResourcesConfig {
  /**
   * If true, the first page will be loaded immediately. Otherwise, the user
   * has to call the load method manually. Default: true.
   */
  immediate?: boolean;
}

const captureError = (error: Ref<KError | undefined>, caught: unknown) => {
  const currentError = KError.getKError(caught);
  error.value = currentError;
  return currentError;
};

export const useResources = <T extends ResourceObject = ResourceObject>(type: string, options: MaybeRefOrGetter<LoadListPayload>, config?: UseResourcesConfig) => {
  const store = useStore();
  const resources = computed<T[]>(() => store.getters[`${type}/currentList`] ?? []);
  const loading = ref(false);
  const error = ref<KError>();
  const lastOptions = ref<LoadListPayload>({ ...toValue(options) });

  const load = async (overrides: Partial<LoadListPayload> = {}) => {
    const currentOptions = { ...toValue(options), ...overrides };
    lastOptions.value = currentOptions;
    loading.value = true;
    error.value = undefined;
    try {
      await store.dispatch(type + "/loadList", {
        ...currentOptions,
      });
    } catch (caught) {
      throw captureError(error, caught);
    } finally {
      loading.value = false;
    }
  };
  const loadNext = async () => {
    loading.value = true;
    error.value = undefined;
    try {
      await store.dispatch(`${type}/loadNext`, lastOptions.value);
    } catch (caught) {
      throw captureError(error, caught);
    } finally {
      loading.value = false;
    }
  };
  const hasNext = computed<boolean | undefined>(() => store.getters[`${type}/hasNext`]);

  watch(
    () => toValue(options),
    () => load(),
    { deep: true, immediate: config?.immediate ?? true }
  );
  
  return { resources, loadNext, hasNext, load, loading, error };
};

export type UseResourceOptions = Omit<LoadByIdPayload, 'id'> & {
  // Use undefined (or don't set) for loading resources without id: currency, currency settings, group etc.
  // Use null for not loading any resource.
  id?: string | null;
}
  

export const useResource = <T extends ResourceObject = ResourceObject>(type: string, options: MaybeRefOrGetter<UseResourceOptions>, config?: UseResourcesConfig) => {
  const store = useStore()
  
  const resourceId = ref<string>()
  const resource = computed<T | undefined>(() => resourceId.value
    ? store.getters[`${type}/one`](resourceId.value)
    : undefined
  )

  const loading = ref(false)
  const error = ref<KError>()

  const load = async () => {
    const currentOptions = { ...toValue(options) }
    error.value = undefined

    if (currentOptions.id === null) {
      resourceId.value = undefined
      return
    }

    resourceId.value = currentOptions.id
    loading.value = true
    try {
      const dispatched = store.dispatch(type + '/load', currentOptions) as Promise<string>

      // The store resolves cached identity synchronously before revalidation.
      resourceId.value = store.getters[`${type}/current`]?.id
      resourceId.value = await dispatched
    } catch (caught) {
      const currentError = captureError(error, caught)
      if (currentError.code === KErrorCode.NotFound) {
        resourceId.value = undefined
      }
      throw currentError
    } finally {
      loading.value = false
    }
  }

  const update = async (data: DeepPartial<T>) => {
    loading.value = true
    error.value = undefined
    try {
      await store.dispatch(type + '/update', {
        id: resourceId.value,
        group: toValue(options).group,
        resource: data
      })
    } catch (caught) {
      throw captureError(error, caught)
    } finally {
      loading.value = false
    }
  }

  watch(
    () => toValue(options),
    () => load(),
    { deep: true, immediate: config?.immediate ?? true }
  )

  return { resource, loading, error, load, update }

}

export const useAllResources = <T extends ResourceObject = ResourceObject>(
  type: string,
  options: MaybeRefOrGetter<LoadListPayload>,
  config?: UseResourcesConfig
) => {
  const { resources, hasNext, loadNext, load, loading, error } = useResources(type, options, config);

  const loadAll = async () => {
    await load();
    while (hasNext.value) {
      await loadNext();
    }
  };

  // Load all resources immediately if configured
  if (config?.immediate ?? true) {
    loadAll();
  }

  return { resources, loadAll, loading, error };
};
