import { config } from '../../config'
import { ToManyRelator } from '../../server/jsonapi-serialize'
import type { PostRelationshipMeta } from './types'

type PostRelationshipSource = {
  id: string
  tenantId: string
  relationshipMeta: PostRelationshipMeta
}

const postRelationship = <Source extends PostRelationshipSource>(
  filter: 'category' | 'member',
  type: 'offers' | 'needs',
) => new ToManyRelator<Source>(
  type,
  (source) => `${config.API_BASE_URL}/${source.tenantId}/posts?filter[${filter}]=${source.id}&filter[type]=${type}&filter[status]=published`,
  (source) => source.relationshipMeta[type]
)

export const postRelationships = <Source extends PostRelationshipSource>(filter: 'category' | 'member') => ({
  offers: postRelationship<Source>(filter, 'offers'),
  needs: postRelationship<Source>(filter, 'needs'),
})
