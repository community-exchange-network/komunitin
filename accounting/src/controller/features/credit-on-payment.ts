import { FullTransfer } from "src/model";
import { systemContext } from "src/utils/context";
import { CurrencyController, SharedController } from "..";

/**
 * Add support for updating the credit limit of an account when a payment is received,
 * based on the defaultOnPaymentCreditLimit setting of the currency and onPaymentCreditLimit
 * setting of the account.
 */
export const initUpdateCreditOnPayment = (controller: SharedController) => {
  const onTransferUpdated = async (transfer: FullTransfer, currencyController: CurrencyController) => {
    // Only handle committed transfers.
    if (transfer.state !== "committed") {
      return
    }
    const ctx = systemContext()
    const currency = await currencyController.getCurrency(ctx)
    // Check if the currency supports this feature.
    if (!currency.settings.defaultOnPaymentCreditLimit) {
      return
    }
    // Do the job.
    // We are interested in the destination account of the transaction.
    const account = transfer.payee
    const maxLimit = account.settings.onPaymentCreditLimit ?? currency.settings.defaultOnPaymentCreditLimit
    if (account.creditLimit < maxLimit) {
      const newLimit = Math.min(maxLimit, account.creditLimit + transfer.amount)
      await currencyController.accounts.updateAccount(ctx, {
        id: account.id,
        creditLimit: newLimit
      })
    }
  }  

  controller.addListener("transferStateChanged", onTransferUpdated)
}