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

  console.log({typeResources});
  // Merge resources in a single resources array.
  const resources = computed(() => {
    const indexs = new Array(types.length).fill(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: any[] = [];

    const canContinue = () => {
      return indexs.every((index, i) => index < typeResources[i].value.length);
    };
    const next = () => {
      // The next resouce is the one from typeResources[indexs[i]] with lower order field.
      // When this function is called we know that we can safely access typeResources[i].value[indexes[i]] for every i.
      const nextTypeIndex = indexs.reduce((minIndex, currentIndex, i) => {
        if (
          typeResources[i].value[currentIndex][options.sort] <
          typeResources[minIndex].value[indexs[minIndex]][options.sort]
        ) {
          return i;
        } else {
          return minIndex;
        }
      }, 0);
      const nextResource =
        typeResources[nextTypeIndex].value[indexs[nextTypeIndex]];
      indexs[nextTypeIndex]++;
      return nextResource;
    };

    while (canContinue()) {
      merged.push(next());
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
