import { useStore } from "vuex"
import type { Need, Offer } from "src/store/model"

/** Match post ownership or administration in the selected community. */
export const usePostPermissions = () => {
  const store = useStore()
  return (post: Offer | Need, code: string) => Boolean(
    store.getters.isSuperadmin
    || post.relationships.member.data.id === store.getters.myMember?.id
    || (store.getters.isAdmin && store.getters.myGroup?.attributes.code === code)
  )
}
