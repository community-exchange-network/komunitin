import type {
  ExternalResourceIdentifierObject,
  RelatedResource
} from "./model"

function isExternalRelationship(
  relationship: RelatedResource
): relationship is Extract<
  RelatedResource,
  { data: ExternalResourceIdentifierObject }
> {
  return relationship.data.meta?.external === true
}

export function resolveRelationshipUrl(relationship: RelatedResource) {
  if (isExternalRelationship(relationship)) {
    return relationship.data.meta.href
  }
  return relationship.links.related
}
