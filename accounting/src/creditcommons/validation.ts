import { body } from "express-validator"

export namespace CreditCommonsValidators {
  export const isGraft = () => [
    body("data.attributes.peerNodePath").isString(),
    body("data.attributes.ourNodePath").isString(),
    body("data.attributes.lastHash").isString(),
    body("data.attributes.url").isString(),
    body("data.attributes.vostroId").isString(),
    body("data.relationships.vostro.data.type").isString(),
    body("data.relationships.vostro.data.id").isString(),
  ]
  export const isTransaction = () => [
    body("data.attributes.uuid").isString(),
    body("data.attributes.state").isString(),
    body("data.attributes.workflow").isString(),
    body("data.attributes.entries").isArray(),
  ]
}