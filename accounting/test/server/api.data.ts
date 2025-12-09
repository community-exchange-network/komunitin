import { Scope } from "src/server/auth"
import { CreditCommonsNode } from "../../src/model/creditCommons"

export const testCurrency = (props?: any) => {
  props = {
    ...props,
    settings: {
      defaultInitialCreditLimit: 1000,
      ...props?.settings
    },
  }
  const {settings, ...attributes} = props

  return {
    data: {
      type: "currencies",
      attributes: {
        code: "TEST",
        name: "Testy",
        namePlural: "Testies",
        symbol: "T$",
        decimals: 2,
        scale: 4,
        rate: {n: 1, d: 10},
        ...attributes
      },
      relationships: {
        settings: {
          data: { type: "currency-settings", id: "anything-works" }
        }
      }
    },
    included: [{
      type: "currency-settings",
      id: "anything-works",
      attributes: { ...settings }
    }]
  }
}

export const testAccount = (userId: string) => ({
  data: {
    relationships: {
      users: { data: [{ type: "users", id: userId }] }
    }
  },
  included: [{ type: "users", id: userId }]
})

export const testTransfer = (payerId: string, payeeId: string, amount: number, description: string, state: string) => ({
  data: {
    attributes: {
      amount,
      meta: {
        description
      },
      state
    },
    relationships: {
      payer: { data: { type: "accounts", id: payerId }},
      payee: { data: { type: "accounts", id: payeeId }}
    }
  }
})

export const testCreditCommonsNeighbour = (neighbour: CreditCommonsNode) => ({
  data: {
    attributes: neighbour,
    relationships: {
      vostro: { data: { type: "accounts", id: neighbour.vostroId }}
    }
  }
})

export const userAuth = (userId: string, scopes?: Scope[]) => ({
  user: userId,
  scopes: scopes ?? [Scope.Accounting]
})


