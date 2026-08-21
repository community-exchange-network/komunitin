import type { MaybeRefOrGetter} from "@vueuse/shared";
import { toValue } from "@vueuse/shared";
import type { Member, MemberUser, User } from "src/store/model";
import { computed, ref, watch } from "vue";
import { useStore } from "vuex";

/**
 * Load a member and its first UUID-sorted member-user relation. If groupCode or
 * memberCode are not provided, use the logged-in user's current member.
 * @param groupCode 
 * @param memberCode 
 */
export const useFullMemberByCode = (groupCode: MaybeRefOrGetter<string|undefined>, memberCode: MaybeRefOrGetter<string|undefined>) => {
  const store = useStore()
  type FullMemberUser = MemberUser & {user: User}

  const user = ref<User>()
  const memberUser = ref<FullMemberUser>()
  const memberId = ref<string>()
  const member = computed(() => memberId.value
    ? store.getters["members/one"](memberId.value) as Member
    : undefined
  )

  watch([
    () => toValue(groupCode),
    () => toValue(memberCode),
    () => store.getters.myMember,
    () => store.getters.myUser,
    () => store.getters.myMemberUser,
  ], async ([groupCodeStr, memberCodeStr, myMember, myUser, myMemberUser], _, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })

    // Wait for initialization
    if (!myUser) return

    if (groupCodeStr && memberCodeStr && memberCodeStr !== myMember?.attributes.code) {
      // Load member from server
      await store.dispatch("members/load", {
        code: memberCodeStr,
        group: groupCodeStr
      })
      if (cancelled) return
      const targetMember = store.getters["members/current"] as Member

      // Only one linked user is presented for now. Pick the first UUID-sorted
      // relation so the selection remains stable until a linked-user picker exists.
      await store.dispatch("member-users/loadList", {
        group: groupCodeStr,
        filter: {
          member: targetMember.id,
        },
        include: "user",
        sort: "id",
      })
      if (cancelled) return

      memberId.value = targetMember.id
      memberUser.value = store.getters["member-users/currentList"][0]
      user.value = memberUser.value?.user
    } else {
      // use data from logged in user
      user.value = myUser
      memberId.value = myMember?.id
      memberUser.value = myMemberUser
    }
  }, {immediate: true})

  return {
    user,
    member,
    memberUser,
  }
}
