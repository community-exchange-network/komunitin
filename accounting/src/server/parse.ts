import {matchedData, validationResult} from "express-validator"
import {Request} from "express"
import {badRequest} from "../utils/error"
import { RelatedResource } from "src/model/resource"

export type Resource = {
  id?: string
  [key: string]: any
}

// Note that here D refers to the model type (Currency, Account, etc.)
export function mount<D extends Resource>(data: Resource, included?: Resource[]): D
export function mount<D extends Resource>(data: Resource[], included?: Resource[]): D[]
export function mount<D extends Resource>(data: Resource|Resource[], included?: Resource[]) : D|D[] {
  if (Array.isArray(data)) {
    return data.map(resource => mountResource(resource, included))
  } else {
    return mountResource(data, included)
  }
}

const mountResource = <D extends Resource>(data: Resource, included?: Resource[], depth=0): D => {
  if (depth > 3) {
    throw badRequest("Too deep relationships")
  }

  // build relationships
  let relationships: Resource = {}
  if (data.relationships) {
    Object.entries(data.relationships).forEach(([key, value]: [string, any]) => {
      if (value && value.data) {
        // If the relationship includes linkage data, try finding the included resource from the included array.
        const includedResource = (resourceId: RelatedResource) => {
          const resource = included?.find(resource => resource.id === resourceId.id && resource.type === resourceId.type)
          return resource ? mountResource(resource, included, depth + 1) : resourceId
        }
        const includedResources = (resourceIds: RelatedResource[]) => {
          return resourceIds.map(resourceId => includedResource(resourceId))
        }
        relationships[key] = Array.isArray(value.data) ? includedResources(value.data) : includedResource(value.data)
      }
    })
  }

  const resource = {
    ...data.attributes,
    ...relationships,
    // overwrite undefined id and type in attributes from validation
    id: data.id,
    type: data.type,
  }

  return resource
}

export const validateInput = (req: Request) => {
  // Get validated input from express-validator.
  validationResult(req).throw()
  const input = matchedData(req)
  // The validation process deletes the data key if it is completely empty, 
  // but that may be a valid input sometimes.
  if (!input.data) {
    input.data = {}
  }
  return input
}

/**
 * Returns an object from a validated json:api input resource object.
 * Sets the id from the route, sets the attributes as top-level keys and
 * sets the relationships as loaded objects or just identifiers using
 * the relationship name as key.
 * 
 * @return The data object with 
 */
export const input = <D extends Resource>(req: Request): D|D[] => {
  
  const input = validateInput(req)
  const data = mount<D>(input.data, input.included)
  // Check id.
  if (req.params.id && !Array.isArray(data)) {
    if (data.id && req.params.id !== data.id) {
      throw badRequest("Route 'id' does not match with resource 'id")
    }
    data.id = req.params.id
  }

  return data
}