import { Horizon } from "@stellar/stellar-sdk"
import { retry } from "../../utils/sleep"
import { logger } from "../../utils/logger"
import { internalError } from "../../utils/error"
import { fixUrl } from "../../utils/net"

export const friendbot = async (url: string, horizonUrl: string, publicKey: string) => {
  const server = new Horizon.Server(horizonUrl)
  try {
    await retry(async() => {
      const response = await fetch(`${fixUrl(url)}?addr=${encodeURIComponent(publicKey)}`)
      if (!response.ok) {
        logger.warn(response, "Error response from friendbot. Retrying...")
        throw internalError("Error response from friendbot.", {details: response})
      }
      await response.json()
    }, 300000, 1000, 5000)
    await retry(() => server.loadAccount(publicKey), 30000, 250, 1000)
    logger.info(`Account ${publicKey} funded with 10,000 XLM with friendbot`)
  } catch (e) {
    logger.error(e)
    throw e
  }
}
