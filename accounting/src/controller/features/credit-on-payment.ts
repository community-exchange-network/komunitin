import { FullTransfer } from "src/model";
import { systemContext } from "src/utils/context";
import { CurrencyPublicService, BaseService } from "..";
import { logger } from "../../utils/logger";

/**
 * Add support for updating the credit limit of an account when a payment is received,
 * based on the defaultOnPaymentCreditLimit setting of the currency and onPaymentCreditLimit
 * setting of the account.
 */
export const initUpdateCreditOnPayment = (controller: BaseService) => {
  const onTransferUpdated = async (transfer: FullTransfer, currencyController: CurrencyPublicService) => {
    try {
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
    } catch (error) {
      // Log the error but don't throw since this is fired asynchronously without awaiting it.
      logger.error({ err: error, transferId: transfer.id }, 'Error updating credit on payment')
    }
  }  

  controller.addListener("transferStateChanged", onTransferUpdated)
}