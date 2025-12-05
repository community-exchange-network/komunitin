import { BaseControllerImpl } from "./base-controller"

export const initLedgerListener = (ledgerController: BaseControllerImpl) => {
  const ledger = ledgerController.ledger
  // Save the state of the currency in the DB when it changes.
  ledger.addListener("stateUpdated", async (ledgerCurrency, state) => {
    const code = ledgerCurrency.asset().code
    const currencyController = await ledgerController.getCurrencyController(code)
    await currencyController.updateState(state)
  })

  // Note: we update the account balances synchronously as part of the transfer process
  // so we can guarantee that the account balances are update once we return from the transfer
  // endpoint. However we could also update the account balances asynchronously here and
  // that would allow to take in count transfers done by third-party services.
  /*
  ledger.addListener("transfer", async (ledgerCurrency, transfer) => {
    const controller = await ledgerController.getCurrencyController(ledgerCurrency.asset().code)
    controller.handleTransferEvent(transfer)
  })

  ledger.addListener("incommingTransfer", async (ledgerCurrency, transfer) => {
    const code = ledgerCurrency.asset().code
    const currencyController = await ledgerController.getCurrencyController(code)
    await currencyController.handleIncommingTransferEvent(transfer)
  })

  ledger.addListener("outgoingTransfer", async (ledgerCurrency, transfer) => {
    const code = ledgerCurrency.asset().code
    const currencyController = await ledgerController.getCurrencyController(code)
    await currencyController.handleOutgoingTransferEvent(transfer)
  })
  */

}