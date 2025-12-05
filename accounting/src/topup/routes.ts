import { Router, urlencoded } from 'express'
import { Scope, userAuth } from '../server/auth'
import { checkExact } from 'express-validator'
import { TopupValidators } from './validation'
import { asyncHandler, currencyInputHandler, currencyResourceHandler } from '../server/handlers'
import { TopupAccountSettingsSerializer, TopupSerializer, TopupSettingsSerializer } from './serialize'
import { AccountTopupSettings, InputTopup, InputTopupSettings, UpdateTopup } from './model'
import { TopupController } from './controller'
import { BaseService, CurrencyService } from '../controller'

const createTopupService = (currencyService: CurrencyService) => new TopupController(currencyService)

export function getRoutes(controller: BaseService) {
  const router = Router()

  router.post('/:code/topups',
    userAuth([Scope.Accounting, Scope.Superadmin]), 
    checkExact(TopupValidators.isCreateTopup()),
    currencyInputHandler(controller, async (currencyController, context, data: InputTopup) => {
      const topups = createTopupService(currencyController)
      const topup = await topups.createTopup(context, {
        ...data
      })
      return topup
    }, TopupSerializer, {status: 201})
  )

  router.get('/:code/topups/:id',
    userAuth([Scope.Accounting, Scope.Superadmin]),
    currencyResourceHandler(controller, (currencyController, context, id: string) => {
      const topups = createTopupService(currencyController)
      return topups.getTopup(context, id)
    }, TopupSerializer, {
      include: ['user', 'account', 'transfer']
    })
  )

  router.patch('/:code/topups/:id',
    userAuth([Scope.Accounting, Scope.Superadmin]),
    checkExact(TopupValidators.isUpdateTopup()),
    currencyInputHandler(controller, async (currencyController, context, data: UpdateTopup) => { 
      const topups = createTopupService(currencyController)
      const topup = await topups.updateTopup(context, data)
      return topup
    }, TopupSerializer, {})
  )

  router.post('/:code/topups/:id/hooks/mollie',
    // No auth, this is called by Mollie
    urlencoded({ extended: true }),
    asyncHandler(async (req, res) => {
      const currencyController = await controller.getCurrencyController(req.params.code)
      const topups = createTopupService(currencyController)
      const result = await topups.handleMollieWebhook(req.params.id, req.body)
      res.status(200).json(result)
    })
  )

  router.patch('/:code/currency/topup-settings', 
    userAuth([Scope.Accounting, Scope.Superadmin]),
    checkExact(TopupValidators.isUpdateTopupSettings()),
    currencyInputHandler(controller, async (currencyController, context, data: InputTopupSettings) => {
      const topups = createTopupService(currencyController)
      const settings = await topups.updateCurrencyTopupSettings(context, data)
      return settings
    }, TopupSettingsSerializer, {})
  )

  router.get('/:code/currency/topup-settings', 
    userAuth([Scope.Accounting, Scope.Superadmin]),
    currencyResourceHandler(controller, async (currencyController, context) => {
      const topups = createTopupService(currencyController)
      const settings = await topups.getCurrencyTopupSettings(context)
      return settings
    }, TopupSettingsSerializer, {})
  )

  router.get('/:code/accounts/:id/topup-settings', 
    userAuth([Scope.Accounting, Scope.Superadmin]),
    currencyResourceHandler(controller, async (currencyController, context, id: string) => {
      const topups = createTopupService(currencyController)
      const settings = await topups.getAccountTopupSettings(context, id)
      return settings
    }, TopupAccountSettingsSerializer, {})
  )

  router.patch('/:code/accounts/:id/topup-settings', 
    userAuth([Scope.Accounting, Scope.Superadmin]),
    checkExact(TopupValidators.isUpdateAccountTopupSettings()),
    currencyInputHandler(controller, async (currencyController, context, data: AccountTopupSettings) => {
      const topups = createTopupService(currencyController)
      const settings = await topups.updateAccountTopupSettings(context, data)
      return settings
    }, TopupAccountSettingsSerializer, {})
  )

  return router

}