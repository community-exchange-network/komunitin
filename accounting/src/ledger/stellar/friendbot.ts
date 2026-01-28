import { retry } from "../../utils/sleep"
import { logger } from "../../utils/logger"
import { internalError } from "src/utils/error"
import { fixUrl } from "src/utils/net"

export const friendbot = async (url: string, publicKey: string) => {
  try {
    await retry(async() => {
      const response = await fetch(`${fixUrl(url)}?addr=${encodeURIComponent(publicKey)}`)
      if (!response.ok) {
        logger.warn(response, "Error response from friendbot. Retrying...")
        throw internalError("Error response from friendbot.", {details: response})
      }
      await response.json()
      logger.info(`Account ${publicKey} funded with 10,000 XLM with friendbot`)
    }, 300000, 1000, 5000)
  } catch (e) {
    logger.error(e)
  }
}