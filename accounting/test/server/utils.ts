import assert from "node:assert"
import { logger } from "../../src/utils/logger"
import { sleep } from "../../src/utils/sleep"

export async function waitFor(fn: () => Promise<Boolean>, msg = "timeout", timeout = 5000, interval = 200) {
  const start = Date.now()
  let count = 0
  while (Date.now() - start < timeout) {
    if (await fn()) {
      assert.ok(true)
      return
    }
    logger.debug(`Waiting for: ${msg} (${count++})`)
    await sleep(interval)
  }
  return assert.fail(msg)
}