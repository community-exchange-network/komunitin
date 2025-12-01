import { body } from "express-validator";
import { jsonApiDoc, isResourceId, isNonNegativeIntOrFalse, isBooleanOrNull } from "../server/validation";

export namespace TopupValidators {
  export const isCreateTopup = () => [
    ...jsonApiDoc("topups"),
    body("data.attributes.depositAmount").isInt({ gt: 0 }),
    body("data.attributes.depositCurrency").isString().isLength({ min: 3, max: 3 }),
    body("data.attributes.receiveAmount").optional().isInt({ gt: 0 }),
    body("data.attributes.status").optional().isIn(["new"]),
    body("data.attributes.meta.description").optional().isString(),
    
    ...isResourceId("data.relationships.account", "accounts")
  ]

  export const isUpdateTopup = () => [
    ...jsonApiDoc("topups"),
    body("data.id").optional().isString(),
    body("data.attributes.status").optional().isIn(["new", "pending", "canceled", "transfer_completed"]),
    body("data.attributes.depositAmount").optional().isFloat({ gt: 0 }),
    body("data.attributes.depositCurrency").optional().isString().isLength({ min: 3, max: 3 }),
    body("data.attributes.meta.description").optional().isString(),
  ]
  
  const isUpdateTopupSettingsAttributes = (path: string) => [
    body(`${path}.enabled`).optional().isBoolean(),
    body(`${path}.defaultAllowTopup`).optional().isBoolean(),
    body(`${path}.depositCurrency`).optional().isString().isLength({ min: 3, max: 3 }),
    body(`${path}.meta.description`).optional().isString(),
    body(`${path}.rate.n`).optional().isInt({min: 1}),
    body(`${path}.rate.d`).optional().isInt({min: 1}),
    body(`${path}.paymentProvider`).optional().isString().isLength({min: 3}),
    body(`${path}.minAmount`).optional().isInt({min: 0}),
    body(`${path}.maxAmount`).optional().custom(isNonNegativeIntOrFalse)
  ]
  
  export const isUpdateTopupSettings = () => [
    ...jsonApiDoc("topup-settings"),
    ...isUpdateTopupSettingsAttributes("data.attributes")
  ]

  export const isUpdateAccountTopupSettings = () => [
    ...jsonApiDoc("account-topup-settings"),
    body("data.attributes.allowTopup").optional().custom(isBooleanOrNull)
  ]

}

