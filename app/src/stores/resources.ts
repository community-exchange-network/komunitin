import { defineStore } from "pinia";
import { ResourceObject } from "../store/model";
import { ref } from "vue";


export const createResourceStore = <T extends ResourceObject>(name: string) => {
  const store = defineStore(name, () =>{
    /**    resources: {},
    pages: {},
    currentId: null,
    next: undefined,
    prev: undefined,
    currentPage: null,
    currentQueryKey: null,
    timestamps: {} */
    /**
     * Dictionary of resources indexed by id.
     */
    const resources = ref<Record<string, T>>({})
    /**
     * Queried object ids. Concretely:
     * pages[group][query][page] = [id1, id2, ...]
     */
    const pages = ref<Record<string, string[][]>>({})
    /**
     * Current resource id.
     */
    const currentId = ref<string | null>(null)
    /**
     * Next page url for the current query.
     */
    const next = ref<string | null | undefined>(undefined)
    /**
     * Previous page url for the current query.
     */
    const prev = ref<string | null | undefined>(undefined)
    /**
     * Current page number for the current query.
     */
    const currentPage = ref<number | null>(null)
    /**
     * Current query key.
     */
    const currentQueryKey = ref<string | null>(null)
    /**
     * Dictionary of timestamps when a resource was last fetched.
     * The keys are the strings "resources/:id" or "pages/:query/:page".
     * 
     * Note that the persist plugin has its own timestamps and cache invalidation mechanism.
     */
    const timestamps = ref<Record<string, number>>({})

    return {
      resources,
      pages,
      currentId,
      next,
      prev,
      currentPage,
      currentQueryKey,
      timestamps
    }


  })
}