import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue"
import { useStore } from "vuex"

import type { Group, Member, MemberUser, User } from "../store/model"
import { useResource } from "./useResources"

export type EditableMember = Member & {group: Group}
type EditableMemberUser = MemberUser & {user: User}

/** Load the member targeted by an edit page, defaulting to the current member. */
export const useEditableMember = (
  groupCode: MaybeRefOrGetter<string | undefined>,
  memberCode: MaybeRefOrGetter<string | undefined>
) => {
  const store = useStore()
  const myMember = computed<EditableMember | undefined>(() => store.getters.myMember)

  // Keep resource options independent from member attributes updated by GET/PATCH responses.
  const myMemberId = computed(() => myMember.value?.id)
  const myMemberGroupCode = computed(() => myMember.value?.group.attributes.code)
  const options = computed(() => {
    const group = toValue(groupCode)
    const code = toValue(memberCode)

    return group && code
      ? {
          code,
          group,
          include: "group"
        }
      : {
          id: myMemberId.value ?? null,
          group: myMemberGroupCode.value ?? "",
          include: "group"
        }
  })

  const resource = useResource<EditableMember>("members", options)
  const isSelf = computed(() =>
    resource.resource.value?.id !== undefined
    && resource.resource.value.id === myMemberId.value
  )

  return { ...resource, isSelf }
}

/** Load the member-user targeted by an edit page, defaulting to the current relation. */
export const useEditableMemberUser = (
  member: MaybeRefOrGetter<EditableMember | undefined>,
  isSelf: MaybeRefOrGetter<boolean>
) => {
  const store = useStore()
  const targetMemberUserId = ref<string>()

  const myMemberUserId = computed<string | undefined>(() => store.getters.myMemberUser?.id)
  const memberId = computed(() => toValue(member)?.id)
  const groupCode = computed(() => toValue(member)?.group.attributes.code)
  const resourceId = computed(() => toValue(isSelf)
    ? myMemberUserId.value
    : targetMemberUserId.value
  )
  const resource = computed<EditableMemberUser | undefined>(() => resourceId.value
    ? store.getters["member-users/one"](resourceId.value)
    : undefined
  )

  // Load the member-user relation for the targeted member, if not self.
  watch([memberId, groupCode, () => toValue(isSelf)], async ([id, group, self]) => {
    targetMemberUserId.value = undefined
    if (id && group && !self) {
      await store.dispatch("member-users/loadList", {
        group,
        filter: { member: id },
        include: "user",
        sort: "id",
        pageSize: 1
      })
      const relations = store.getters["member-users/currentList"] as EditableMemberUser[] | undefined
      targetMemberUserId.value = relations?.[0]?.id
    }
  }, {immediate: true})

  return { resource }
}
