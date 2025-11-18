import { CurrencyControllerImpl } from "./currency-controller";

/**
 * Provide some handy tools for controllers in a currency.
 */
export class AbstractCurrencyController {
  constructor(readonly currencyController: CurrencyControllerImpl) {}

  currency() {
    return this.currencyController.model
  }

  db() {
    return this.currencyController.db
  }

  users() {
    return this.currencyController.users
  }

  keys() {  
    return this.currencyController.keys
  }

  accounts() {
    return this.currencyController.accounts
  }

  transfers() {
    return this.currencyController.transfers
  }

  externalResources() {
    return this.currencyController.externalResources
  }

}