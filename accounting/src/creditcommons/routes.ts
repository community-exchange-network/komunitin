import { ErrorRequestHandler, Router, type Response } from 'express'
import { checkExact } from 'express-validator'
import { BaseService } from '../controller'
import { CreditCommonsNode } from '../model'
import { lastHashAuth, noAuth, Scope, userAuth } from '../server/auth'
import { getKError } from '../server/errors'
import { asyncHandler, currencyInputHandler } from '../server/handlers'
import { context } from '../utils/context'
import { logger } from '../utils/logger'
import { CreditCommonsValidators } from './validation'

import {
  CreditCommonsNodeSerializer
} from './serialize'

export const ccErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  logger.error(err)
  const kerror = getKError(err) // from errors.ts
  const errorObj = { errors: [ kerror.message ] }
  sendCcJson(res, kerror.getStatus(), errorObj)
}

function sendCcJson(res: Response, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload).toString(),
    ...headers,
  })
  res.end(payload)
}

/**
 * Implements the routes for the credit commons federation protocol
 * https://gitlab.com/credit-commons/cc-php-lib/-/blob/master/docs/credit-commons-openapi3.yml
 * 
 * @param controller 
 */
export function getRoutes(controller: BaseService) {
  const router = Router()

  /**
   * Configure the trunkward CC node. Requires admin.
   * This route is not part of the CC API, so it uses Komunitin's standard auth and error handling
   */
  router.post('/:code/cc/nodes',
    userAuth([Scope.Accounting, Scope.Superadmin]),
    checkExact(CreditCommonsValidators.isGraft()),
    currencyInputHandler(controller, async (currencyController, ctx, data: CreditCommonsNode) => {
      // setResponseTrace(req, res)
      return await currencyController.creditCommons.createNode(ctx, data)
    }, CreditCommonsNodeSerializer, {status: 201}),
  )

  /**
   * Retrieve a welcome message. Requires last-hash auth.
   */
  router.get('/:code/cc/',
    lastHashAuth(),
    asyncHandler(async (req, res) => {
      const ctx = context(req)
      const currencyController = await controller.getCurrencyController(req.params.code)
      const response = await currencyController.creditCommons.getWelcome(ctx)
      sendCcJson(res, 200, response)
    }),
   
    ccErrorHandler
  )

  /**
   * CC API endpoint to create a transaction. Requires last-hash auth.
   */
  router.post('/:code/cc/transaction/relay',
    lastHashAuth(),
    asyncHandler(async (req, res) => {
      const ctx = context(req)
      const currencyController = await controller.getCurrencyController(req.params.code)
      const response = await currencyController.creditCommons.createTransaction(ctx, req.body)
      sendCcJson(res, 201, response.body, { 'cc-node-trace': response.trace })
    }),
    ccErrorHandler
  )

  /**
   * Update transaction status. Requires last-hash auth.
   */
  router.patch('/:code/cc/transaction/:transId/:newState',
    lastHashAuth(),
    asyncHandler(async (req, res) => {
      const ctx = context(req)
      const currencyController = await controller.getCurrencyController(req.params.code)
      await currencyController.creditCommons.updateTransaction(ctx, req.params.transId, req.params.newState)
      // TODO: return the patched transaction and set the response trace
      res.status(201).end()
    }),
    ccErrorHandler
  )

  /**
   * Retrieve account status. Requires last-hash auth.
   */
  router.get('/:code/cc/account',
    lastHashAuth(),
    asyncHandler(async (req, res) => {
      const ctx = context(req)
      const currencyController = await controller.getCurrencyController(req.params.code)
      const response = await currencyController.creditCommons.getAccount(ctx, (req.query as { acc_path: string }).acc_path)
      sendCcJson(res, 200, response.body, { 'cc-node-trace': response.trace })
    }),
    ccErrorHandler
  )

  /**
   * Retrieve account history. Requires last-hash auth.
   */
  router.get('/:code/cc/account/history',
    lastHashAuth(),
    asyncHandler(async (req, res) => {
      const ctx = context(req)
      const currencyController = await controller.getCurrencyController(req.params.code)
      const response = await currencyController.creditCommons.getAccountHistory(ctx, (req.query as { acc_path: string }).acc_path)
      sendCcJson(res, 200, response.body, { 'cc-node-trace': response.trace })
    }),
    ccErrorHandler
  )

  /**
   * Return the list of different payment protocols supported by the account. It always returns the
   * "komunitin" entry and also the "creditCommons" entry if the currency supports it.
  */
  router.get('/:code/cc/addresses/:id', noAuth(), asyncHandler(async (req, res) => {
    const ctx = context(req)
    const currencyController = await controller.getCurrencyController(req.params.code)
    const response = await currencyController.creditCommons.getAccountAddresses(ctx, req.params.id)
    sendCcJson(res, 200, response)
  }))

  return router
}
