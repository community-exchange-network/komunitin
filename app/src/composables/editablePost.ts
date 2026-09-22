import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { KErrorCode } from '@/KError'
import type { Category, Need, Offer } from '@/store/model'
import { useResource } from './useResources'

/** Load an editable post and apply URL prefills to a copy after checking access. */
export const useEditablePost = <T extends Need>(
  type: 'needs' | 'offers',
  options: MaybeRefOrGetter<{ code: string, group: string }>
) => {
  const route = useRoute()
  const store = useStore()
  const canEdit = (post: Offer | Need, code: string) => Boolean(
    store.getters.isSuperadmin
    || post.relationships.member.data.id === store.getters.myMember?.id
    || (store.getters.isAdmin && store.getters.myGroup?.attributes.code === code)
  )
  const { resource, loaded, error, update } = useResource<T & { category: Category }>(type, () => ({
    ...toValue(options),
    include: 'category'
  }))
  const allowed = computed(() => resource.value && canEdit(resource.value, toValue(options).group))
  const notFound = computed(() =>
    error.value?.code === KErrorCode.NotFound
    || error.value?.code === KErrorCode.Forbidden
    || (loaded.value && resource.value && !allowed.value)
  )
  const post = computed(() => {
    let post = resource.value
    if (loaded.value && post && allowed.value) {
      // Apply URL query parameters to the post object.
      const attributes = { ...post.attributes }
      const params = route.query
      if (params.state === 'hidden' || params.state === 'published') {
        attributes.status = params.state
      }
      if (typeof params.expires === 'string') {
        const expires = new Date(params.expires)
        if (!isNaN(expires.getTime())) {
          attributes.expires = expires.toISOString()
        }
      }
      // Related-resource getters are non-enumerable, so copy category explicitly.
      post = { ...post, attributes, category: post.category }
    } else {
      post = undefined
    }
    return post
  })

  return { resource: post, notFound, update }
}
