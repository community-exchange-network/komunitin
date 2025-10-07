import { MaybeRefOrGetter, toValue } from "vue";
import { useResource, UseResourceOptions } from "./useResource";
import { User } from "../store/model";

// Handy wappers for the useResource composable

export const useUser = (id: MaybeRefOrGetter<string|null>, include: string[]) => {
  return useResource<User>("users", () => ({
    group: toValue(id) ?? undefined,
    include,
    
  } as UseResourceOptions))
}