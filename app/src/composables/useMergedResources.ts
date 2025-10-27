import type { Ref } from "vue";
import { computed } from "vue";
import type { LoadListPayload } from "../store/resources";
import { useResources } from "./useResources";

export const useMergedResources = (
  types: string[],
  options: LoadListPayload
) => {
  // Call useResources for each type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeResources: Ref<any[]>[] = [];
  const typeLoadNexts: (() => Promise<void>)[] = [];
  const typeHasNexts: Ref<boolean>[] = [];
  const typeFetchResources: ((search?: string) => Promise<void>)[] = [];

  for (const type of types) {
    const { resources, loadNext, hasNext, fetchResources } = useResources(type, options);
    typeResources.push(resources);
    typeLoadNexts.push(loadNext);
    typeHasNexts.push(hasNext);
    typeFetchResources.push(fetchResources);
  }

  // Merge resources in a single resources array.
  const resources = computed(() => {
    const indexs = new Array(types.length).fill(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: any[] = [];

    // Determine sort field and order
    const sortField = options.sort?.startsWith("-") 
      ? options.sort.substring(1) 
      : (options.sort || "");
    const isDescending = options.sort?.startsWith("-") || false;

    const canContinue = () => {
      // Check if there's at least one non-exhausted array with data
      // We can only continue if there are actually items available to merge
      // (not based on hasNext, as that would cause items to appear out of order)
      return indexs.some((index, i) => 
        index < typeResources[i].value.length
      );
    };
    const next = () => {
      // Find the next type index by skipping exhausted arrays
      // and finding the one with the lower (or higher for descending) order field
      const availableTypeIndices = indexs
        .map((index, i) => i)
        .filter(i => indexs[i] < typeResources[i].value.length);
      
      if (availableTypeIndices.length === 0) {
        // This shouldn't happen if canContinue is correct, but handle it gracefully
        return null;
      }

      const nextTypeIndex = availableTypeIndices.reduce((bestIndex, currentIndex) => {
        const currentResource = typeResources[currentIndex].value[indexs[currentIndex]];
        const bestResource = typeResources[bestIndex].value[indexs[bestIndex]];
        
        // Access the sort field from attributes
        const currentValue = currentResource.attributes?.[sortField] ?? 
          (currentResource as Record<string, unknown>)[sortField];
        const bestValue = bestResource.attributes?.[sortField] ?? 
          (bestResource as Record<string, unknown>)[sortField];
        
        if (isDescending) {
          // For descending, we want the higher value (most recent)
          return currentValue > bestValue ? currentIndex : bestIndex;
        } else {
          // For ascending, we want the lower value
          return currentValue < bestValue ? currentIndex : bestIndex;
        }
      });
      
      const nextResource =
        typeResources[nextTypeIndex].value[indexs[nextTypeIndex]];
      indexs[nextTypeIndex]++;
      return nextResource;
    };

    while (canContinue()) {
      const resource = next();
      if (resource !== null) {
        merged.push(resource);
      } else {
        // No more resources available right now
        break;
      }
    }
    return merged;
  });

  const hasNext = computed(() => {
    return typeHasNexts.some((hasNext) => hasNext.value);
  });

  const loadNext = async () => {
    // Call loadNext for each type that has hasNext true.
    const loadNextPromises = typeHasNexts.map((hasNext, i) => {
      if (hasNext.value) {
        return typeLoadNexts[i]();
      } else {
        return Promise.resolve();
      }
    });
    await Promise.all(loadNextPromises);
  };

  const fetchResources = async (search?: string) => {
    // Call fetchResources for each type.
    const fetchPromises = typeFetchResources.map((fetchResources) =>
      fetchResources(search)
    );
    await Promise.all(fetchPromises);
  };

  return { resources, hasNext, loadNext, fetchResources };
};
