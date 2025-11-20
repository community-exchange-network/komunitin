import { body } from "express-validator";
import { jsonApiDoc, isResourceId, isNonNegativeIntOrFalse, isBooleanOrNull } from "../server/validation";

export namespace TopupValidators {
  export const isCreateTopup = () => [
    ...jsonApiDoc("topups"),
    body("data.attributes.depositAmount").isFloat({ gt: 0 }),
    body("data.attributes.depositCurrency").isString().isLength({ min: 3, max: 3 }),
    ...isResourceId("data.relationships.account", "accounts")
  ]
  
  const isUpdateTopupSettingsAttributes = (path: string) => [
    body(`${path}.enabled`).optional().isBoolean(),
    body(`${path}.defaultAllowTopup`).optional().isBoolean(),
    body(`${path}.depositCurrency`).optional().isString().isLength({ min: 3, max: 3 }),
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

