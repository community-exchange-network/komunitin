import type { MaybeRefOrGetter} from "@vueuse/shared";
import { toValue } from "@vueuse/shared";
import type { Member, User, UserSettings } from "src/store/model";
import { ref, watch } from "vue";
import { useStore } from "vuex";

/**
 * Load member, user and user settings. Return member and user refs. If groupCode or memberCode are not provided, use logged in user.
 * @param groupCode 
 * @param memberCode 
 */
export const useFullMemberByCode = (groupCode: MaybeRefOrGetter<string|undefined>, memberCode: MaybeRefOrGetter<string|undefined>) => {
  const store = useStore()
  
  const user = ref<User & {settings: UserSettings}>()
  const member = ref<Member>()

  watch([() => toValue(groupCode), () => toValue(memberCode), () => (store.getters.myMember as Member)], async ([groupCodeStr, memberCodeStr, myMember]) => {
    // Wait for initialization
    if (!myMember) return

    if (groupCodeStr && memberCodeStr && memberCodeStr !== myMember.attributes.code) {
      // Load member from server
      await store.dispatch("members/load", {
        code: memberCodeStr,
        group: groupCodeStr,
        include: "contacts"
      })
      member.value = store.getters["members/current"]

      // load user from server (only one user supported for now)
      await store.dispatch("users/loadList", {
        filter: {
          members: member.value?.id
        },
        include: "settings",
      })
      user.value = store.getters["users/currentList"][0]

    } else {
      // use data from logged in user
      user.value = store.getters.myUser
      member.value = myMember
      // load settings.
      await store.dispatch("user-settings/load", {
        id: user.value?.id,
        group: groupCodeStr,
      })
    }
  }, {immediate: true})

  return {
    user,
    member
  }
}