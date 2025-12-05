import { body } from "express-validator"


const jsonApiAnyResource = (path: string) => [
  body(`${path}.id`).optional().isString().notEmpty(),
]
const jsonApiResource = (path: string, type: string) => [
  ...jsonApiAnyResource(path),
  body(`${path}.type`).optional().isString().equals(type),
]

export const jsonApiDoc = (type: string) => [
    ...jsonApiResource("data", type),
    ...jsonApiAnyResource("included.*"),
  ]

export const jsonApiDocArray = (type: string) => [
  body("data").isArray(),
  ...jsonApiResource("data.*", type),
]

export const isResourceId = (path: string, type: string) => [
  body(`${path}.data.id`).isUUID(),
  body(`${path}.data.type`).equals(type),
]

export const isBooleanOrNull = (value: any) => {
  return value === null || value === true || value === false
}

export const isNonNegativeIntOrFalse = (value: any) => {
  return value === false || (typeof value === "number" && Number.isInteger(value) && value >= 0)
}
export namespace Validators {

  const isUpdateCurrencySettingsAttributes = (path: string) => [
    body(`${path}.defaultInitialCreditLimit`).optional().isInt({min: 0}).default(0),
    body(`${path}.defaultInitialMaximumBalance`).optional().custom(value => isNonNegativeIntOrFalse(value)),
    body(`${path}.defaultAllowPayments`).optional().isBoolean(),
    body(`${path}.defaultAllowPaymentRequests`).optional().isBoolean(),
    body(`${path}.defaultAcceptPaymentsAutomatically`).optional().isBoolean(),
    body(`${path}.defaultAcceptPaymentsWhitelist`).optional().isArray(),
    body(`${path}.defaultAllowSimplePayments`).optional().isBoolean(),
    body(`${path}.defaultAllowSimplePaymentRequests`).optional().isBoolean(),
    body(`${path}.defaultAllowQrPayments`).optional().isBoolean(),
    body(`${path}.defaultAllowQrPaymentRequests`).optional().isBoolean(),
    body(`${path}.defaultAllowMultiplePayments`).optional().isBoolean(),
    body(`${path}.defaultAllowMultiplePaymentRequests`).optional().isBoolean(),
    body(`${path}.defaultAllowTagPayments`).optional().isBoolean(),
    body(`${path}.defaultAllowTagPaymentRequests`).optional().isBoolean(),
    body(`${path}.defaultAcceptPaymentsAfter`).optional().custom(value => isNonNegativeIntOrFalse(value)),
    body(`${path}.defaultOnPaymentCreditLimit`).optional().custom(value => isNonNegativeIntOrFalse(value)),
    body(`${path}.defaultAllowExternalPayments`).optional().isBoolean(),
    body(`${path}.defaultAllowExternalPaymentRequests`).optional().isBoolean(),
    body(`${path}.defaultAcceptExternalPaymentsAutomatically`).optional().isBoolean(),
    body(`${path}.enableExternalPayments`).optional().isBoolean(),
    body(`${path}.enableExternalPaymentRequests`).optional().isBoolean(),
    body(`${path}.enableCreditCommonsPayments`).optional().isBoolean(),
    body(`${path}.externalTraderCreditLimit`).optional().isInt({min: 0}),
    body(`${path}.externalTraderMaximumBalance`).optional().custom(value => isNonNegativeIntOrFalse(value)),
    body(`${path}.defaultHideBalance`).optional().isBoolean()
  ]

  const isUpdateCurrencyAttributes = (path: string) => [
    body(`${path}.code`).optional().isString().trim().matches(/^[A-Z0-9]{4}$/), // code optional as provided in path.
    body(`${path}.status`).optional().isIn(['active', 'disabled']),
    body(`${path}.name`).optional().isString().trim().notEmpty(),
    body(`${path}.namePlural`).optional().isString().trim().notEmpty(),
    body(`${path}.symbol`).optional().isString().trim().isLength({max: 3, min: 1}),
    body(`${path}.decimals`).optional().isInt({max: 8, min: 0}),
    body(`${path}.scale`).optional().isInt({max: 12, min: 0}),
    body(`${path}.rate.n`).optional().isInt({min: 1}).default(1),
    body(`${path}.rate.d`).optional().isInt({min: 1}).default(1),
  ]

  const isCreateCurrencyAttributesExist = (path: string) => [
    // Mandatory attributes.
    body(`${path}.code`).exists(),
    body(`${path}.name`).exists(),
    body(`${path}.namePlural`).exists(),
    body(`${path}.symbol`).exists(),
    body(`${path}.decimals`).exists(),
    body(`${path}.scale`).exists(),
    body(`${path}.rate`).exists(),
    body(`${path}.rate.n`).exists(),
    body(`${path}.rate.d`).exists(),
    body(`${path}.settings.defaultInitialCreditLimit`).default(0)
  ]

  const isCollectionRelationship = (path: string, name: string, type: string) => [
    body(`${path}.relationships.${name}`).optional(),
    body(`${path}.relationships.${name}.data.*.id`).isString().notEmpty(),
    body(`${path}.relationships.${name}.data.*.type`).equals(type),
  ]

  const isSingleRelationship = (path: string, name: string, type: string) => [
    body(`${path}.relationships.${name}`).optional(),
    body(`${path}.relationships.${name}.data.id`).isString().notEmpty(),
    body(`${path}.relationships.${name}.data.type`).equals(type),
  ]

  const isIncludedTypes = (types: string[]) => [
    body("included.*.type").isIn(types),
    body("included.*.id").isString().notEmpty(),
    body("included.*.attributes").optional().isObject(),
  ]

  export const isCreateCurrency = () => [
    ...jsonApiDoc("currencies"),
    ...isCreateCurrencyAttributesExist("data.attributes"),
    ...isUpdateCurrencyAttributes("data.attributes"),
    ...isCollectionRelationship("data", "admins", "users"),
    ...isSingleRelationship("data", "settings", "currency-settings"),
    ...isIncludedTypes(["users", "currency-settings"]),

    // TODO: Add validation for included currency-settings attributes.
    // It happens that express-validator is not well suited for nested
    // validation so we should switch to a more flexible library.
    body("included.*")
      .if(value => typeof value === 'object' && value.type === "currency-settings")
      .customSanitizer(value => {
        return {
          ...value,
          attributes: {
            ...value.attributes,
            defaultInitialCreditLimit: value.attributes.defaultInitialCreditLimit || 0
          }
        }
      })
  ]

  export const isUpdateCurrency = () => [
    ...jsonApiDoc("currencies"),
    body("data.id").optional().isUUID(), // id optional as currency is identified by route.
    ...isUpdateCurrencyAttributes("data.attributes"),
  ]

  export const isUpdateCurrencySettings = () => [
    ...jsonApiDoc("currency-settings"),
    body("data.id").optional().isUUID(), // id optional as currency is identified by route.
    ...isUpdateCurrencySettingsAttributes("data.attributes"),
  ]

  const isUpdateAccountAttributes = (path: string) => [
    body(`${path}.code`).optional(),
    body(`${path}.maximumBalance`).optional().isInt({min: 0}),
    body(`${path}.creditLimit`).optional().isInt({min: 0}),
    body(`${path}.status`).optional().isIn(["active", "disabled", "suspended"]),
  ]

  export const isUpdateAccount = () => [
    ...jsonApiDoc("accounts"),
    body("data.id").optional().isUUID(), // id optional as currency is identified by route.
    ...isUpdateAccountAttributes("data.attributes"),
    ...isCollectionRelationship("data", "users", "users")
  ]

  export const isCreateAccount = () => [
    ...jsonApiDoc("accounts"),
    ...isUpdateAccountAttributes("data.attributes"),
    ...isCollectionRelationship("data", "users", "users"),
    ...isIncludedTypes(["users"]),
  ]

  const isCreateTransferAttributes = (path: string) => [
    body(`${path}.meta`).custom((value => {
      return value && typeof value === "object" && !Array.isArray(value) && typeof value.description === "string"
    })),
    body(`${path}.amount`).isInt({gt: 0}),
    body(`${path}.state`).isIn(["new", "committed"]),
    body(`${path}.hash`).optional().isString(),
    body(`${path}.authorization`).optional().custom((value, {req}) => {
      return value.type === "tag" && typeof value.value === "string" && value.value.length > 0
    }),
    body(`${path}.created`).optional(),
    body(`${path}.updated`).optional(),
  ]

  const isOptionalResourceId = (path: string, type: string) => [
    body(`${path}.data.id`).optional().isUUID(),
    body(`${path}.data.type`).optional().equals(type)
  ]

  const isExternal = (path: string) => [
    body(`${path}.data.meta.external`).equals("true"),
    body(`${path}.data.meta.href`).isString().notEmpty(),
  ]

  const isOptionallyExternal = (path: string) => [
    body(`${path}.data.meta.external`).optional().equals("true"),
    body(`${path}.data.meta.href`).optional().isString().notEmpty(),
  ]

  const isExternalResourceId = (path: string, type: string) => [
    ...isResourceId(path, type),
    ...isExternal(path)
  ]

  // Resource id that is optionally external
  const isRelatedResourceId = (path: string, type: string) => [
    ...isResourceId(path, type),
    ...isOptionallyExternal(path)
  ]

  // Optional resource id that is optionally external
  const isOptionalRelatedResourceId = (path: string, type: string) => [
    ...isOptionalResourceId(path, type),
    ...isOptionallyExternal(path),
    body(`${path}`).optional().isObject()
  ]

  const isCreateTransferRelationships = (path: string) => [
    ...isRelatedResourceId(`${path}.payer`, "accounts"),
    ...isOptionalRelatedResourceId(`${path}.payee`, "accounts"),
    ...isOptionalResourceId(`${path}.currency`, "currencies"),
  ]

  export const isCreateTransfer = () => [
    ...jsonApiDoc("transfers"),
    body("data.id").optional().isUUID(), // Support client-defined UUID.
    ...isCreateTransferAttributes("data.attributes"),
    ...isCreateTransferRelationships("data.relationships")
  ]

  export const isCreateTransfers = () => [
    ...jsonApiDocArray("transfers"),
    ...isCreateTransferAttributes("data.*.attributes"),
    ...isCreateTransferRelationships("data.*.relationships")
  ]

  const isUpdateTransferAttributes = (path: string) => [
    body(`${path}.meta`).optional().custom((value => {
      return value && typeof value === "object" && !Array.isArray(value) && typeof value.description === "string";
    })),
    body(`${path}.amount`).optional().isInt({gt: 0}),
    body(`${path}.hash`).optional().isString(),
    body(`${path}.state`).optional().isIn(["new", "committed", "rejected", "deleted"]),
  ]

  const isUpdateTransferRelationships = (path: string) => [
    ...isOptionalResourceId(`${path}.payer`, "accounts"),
    ...isOptionalResourceId(`${path}.payee`, "accounts"),
    ...isOptionalResourceId(`${path}.currency`, "currencies"),
  ]

  export const isUpdateTransfer = () => [
    ...jsonApiDoc("transfers"),
    body("data.id").optional().isUUID(), // id optional as currency is identified by route.
    ...isUpdateTransferAttributes("data.attributes"),
    ...isUpdateTransferRelationships("data.relationships")
  ]
  const isUpdateAccountSettingsAttributes = (path: string) => [
    body(`${path}.allowPayments`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowPaymentRequests`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowSimplePayments`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowSimplePaymentRequests`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowQrPayments`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowQrPaymentRequests`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowMultiplePayments`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowMultiplePaymentRequests`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowTagPayments`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowTagPaymentRequests`).optional().custom(value => isBooleanOrNull(value)),
    
    body(`${path}.acceptPaymentsAutomatically`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.acceptPaymentsAfter`).isInt({min: 0}).optional(),
    body(`${path}.acceptPaymentsWhitelist`).isArray().optional(),
    body(`${path}.onPaymentCreditLimit`).isInt({min: 0}).optional(),
    
    body(`${path}.allowExternalPayments`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.allowExternalPaymentRequests`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.acceptExternalPaymentsAutomatically`).optional().custom(value => isBooleanOrNull(value)),
    body(`${path}.hideBalance`).optional().isBoolean(),
    
    body(`${path}.tags.*.name`).notEmpty().optional(),
    body(`${path}.tags.*.value`).isString().notEmpty().optional(),
    body(`${path}.tags.*.id`).isUUID().optional(),
    body(`${path}.tags`).isArray().optional(),
  ]

  export const isUpdateAccountSettings = () => [
    ...jsonApiDoc("account-settings"),
    body("data.id").optional().isUUID(), // id optional as currency is identified by route.
    ...isUpdateAccountSettingsAttributes("data.attributes"),
  ]

  const isCreateMigrationAttributes = (path: string) => [
    body(`${path}.code`).isString().notEmpty(),
    body(`${path}.source.url`).isString().notEmpty(),
    body(`${path}.source.platform`).isString().notEmpty(),
    body(`${path}.source.access_token`).isString().notEmpty(),
  ]
  export const isCreateMigration = () => [
    ...jsonApiDoc("migrations"),
    ...isCreateMigrationAttributes("data.attributes"),
  ]

  export const isUpdateTrustline = () => [
    ...jsonApiDoc("trustlines"),
    body("data.id").optional().isUUID(),
    body("data.attributes.limit").isInt({min: 0}),
  ]

  export const isCreateTrustline = () => [
    ...isUpdateTrustline(),
    ...isExternalResourceId("data.relationships.trusted", "currencies"),
  ]
}
