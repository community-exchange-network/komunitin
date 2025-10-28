import type { Ref } from "vue";
import { ref, computed, watchEffect } from "vue";
import { DEFAULT_PAGE_SIZE, type LoadListPayload } from "../store/resources";
import { useResources } from "./useResources";
import { type ResourceObject } from "../store/model";

export const useMergedResources = (
  types: string[],
  options: LoadListPayload
) => {
  // Call useResources for each type.
  const typeResources: Ref<ResourceObject[]>[] = [];
  const typeLoadNexts: (() => Promise<void>)[] = [];
  const typeHasNexts: Ref<boolean>[] = [];
  const typeLoads: ((search?: string) => Promise<void>)[] = [];
  
  for (const type of types) {
    const { resources, loadNext, hasNext, load } = useResources(type, options);
    typeResources.push(resources);
    typeLoadNexts.push(loadNext);
    typeHasNexts.push(hasNext);
    typeLoads.push(load);
  }

  // Determine sort field and order
  const sortField = options.sort?.startsWith("-") 
    ? options.sort.substring(1) 
    : (options.sort || "");
  const isDescending = options.sort?.startsWith("-") || false;

  // This indexs array has an entry for each type. Each entry indicates the
  // index of the next item to be taken from that type's resources array.
  const indexs = new Array(types.length).fill(0);
  const resources = ref<ResourceObject[]>([]);

  // This function checks if there are more items to merge without fetching
  // new pages. The condition is that, for all types:
  // - It has remaining items loaded (so we know the optimum next)
  // - OR it has hasNext to false (so we know there won't be more items)
  // Saying it differently, we can't continue if, for any type, we have
  // exhausted the loaded items and there are potentially more items to load 
  // because in this case the next optimum item could be in the next page.
  const canContinue = () => {
    // using hasNext === false because hasNext can be undefined if not known.
    const isPendingPage = indexs.some((index, i) => {
      return index >= typeResources[i].value.length && typeHasNexts[i].value !== false;
    })
    const isFinished = indexs.every((index, i) => {
      return index >= typeResources[i].value.length && (typeHasNexts[i].value === false);
    });
    return !isPendingPage && !isFinished;
  }
  
  // Select the next item in the merged array, knowing that canContinue() is true
  // and therefore the next item is among the currently loaded items.
  const next = () => {
    let bestIndex = -1
    for (let i = 0; i < types.length; i++) {
      // discard exhausted types
      if (indexs[i] < typeResources[i].value.length) {
        if (bestIndex === -1) {
          // choose the first non-exhausted type as best candidate
          bestIndex = i;
        } else {
          // change best candidate if current type has a better item based on sort field
          const best = typeResources[bestIndex].value[indexs[bestIndex]];
          const bestValue = best.attributes?.[sortField];
          const candidate = typeResources[i].value[indexs[i]];
          const candidateValue = candidate.attributes?.[sortField];
          if ((isDescending && candidateValue > bestValue)
            || (!isDescending && candidateValue < bestValue)) {
            bestIndex = i;
          }
        }
      }
    }
    // increment the index for the selected type and return the item
    const selectedIndex = indexs[bestIndex];
    indexs[bestIndex]++;
    return typeResources[bestIndex].value[selectedIndex];
  };

  // Merge resources in a single resources array.
  watchEffect(() => {
    while (canContinue()) {
      resources.value.push(next())
    }
  });

  const loadNext = async () => {
    // Call loadNext for each type that has hasNext true and has less than DEFAULT_PAGE_SIZE
    // loaded items still not merged.
    const promises = []
    for (let i = 0; i < types.length; i++) {
      if (typeHasNexts[i].value && (typeResources[i].value.length - indexs[i] < DEFAULT_PAGE_SIZE) ) {
        promises.push(typeLoadNexts[i]());
      }
    }
    await Promise.all(promises);
  };

  const hasNext = computed(() => {
    return typeHasNexts.some((hasNext) => hasNext.value) ? true 
    : (typeHasNexts.some((hasNext) => hasNext.value === undefined) ? undefined : false);
  });

  const load = async (search?: string) => {
    // Call load for each type.
    indexs.fill(0);
    resources.value = [];
    const promises = typeLoads.map((load) => load(search));
    await Promise.all(promises);
  };

  // We don't need to call load() initially because useResources already does it.

  return { resources, hasNext, loadNext, load };
};
