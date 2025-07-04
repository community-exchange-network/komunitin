import { Router, Request, Response } from 'express';
import { checkExact, oneOf } from 'express-validator';
import { CreateMigration } from 'src/controller/migration/migration';
import { AccountSettings, CreateCurrency, CurrencySettings, InputAccount, InputTransfer, UpdateAccount, UpdateCurrency, UpdateTransfer } from 'src/model';
import { InputTrustline, UpdateTrustline } from 'src/model/trustline';
import { context } from 'src/utils/context';
import { badRequest } from 'src/utils/error';
import { MigrationController, SharedController } from '../controller';
import { anyAuth, externalAuth, noAuth, Scope, userAuth } from './auth';
import { asyncHandler, currencyCollectionHandler, currencyHandler, currencyInputHandler, currencyInputHandlerMultiple, currencyResourceHandler } from './handlers';
import { input } from './parse';
import { accountStatsParams, collectionParams, statsParams } from './request';
import { AccountSerializer, AccountSettingsSerializer, CurrencySerializer, CurrencySettingsSerializer, StatsSerializer, TransferSerializer, TrustlineSerializer } from './serialize';
import { Validators } from './validation';
import routeCache from 'route-cache'

export function getRoutes(controller: SharedController) {
  const router = Router()

  router.get('/', noAuth(), asyncHandler(async (req, res) => {
    res.json({ message: 'Welcome to the Komunitin accounting API.' })
  }))

  // Create currency
  router.post('/currencies', userAuth(Scope.Accounting), checkExact(Validators.isCreateCurrency()), asyncHandler(async (req, res) => {
    const data = input(req)
    if (Array.isArray(data)) {
      throw badRequest("Expected a single currency")
    }
    const currency = await controller.createCurrency(context(req), data as CreateCurrency)
    // Serialize currency to JSON:API
    const result = await CurrencySerializer.serialize(currency)
    res.status(201).json(result)
  }))

  // List currencies
  router.get('/currencies', noAuth(), asyncHandler(async (req,res) => {
    const params = collectionParams(req, {
      include: ["settings"],
      sort: ["code"],
      filter: ["code"]
    })
    const currencies = await controller.getCurrencies(context(req), params)
    const result = await CurrencySerializer.serialize(currencies, {
      include: params.include
    })
    res.status(200).json(result)
  }))

  // Get currency
  router.get('/:code/currency', noAuth(), currencyResourceHandler(controller, async (currencyController, ctx) => {
    return await currencyController.getCurrency(ctx)
  }, CurrencySerializer, {
    include: ["settings"]
  }))

  // Update currency
  router.patch('/:code/currency', userAuth(Scope.Accounting), checkExact(Validators.isUpdateCurrency()), 
    currencyInputHandler(controller, async (currencyController, ctx, data: UpdateCurrency) => {
      return await currencyController.updateCurrency(ctx, data)
    }, CurrencySerializer)
  )

  // Get currency settings
  router.get('/:code/currency/settings', userAuth([Scope.Accounting, Scope.AccountingReadAll]), 
    currencyResourceHandler(controller, async (currencyController, ctx) => {
      return await currencyController.getCurrencySettings(ctx)
    }, CurrencySettingsSerializer, {})
  )

  // Update currency settings
  router.patch('/:code/currency/settings', userAuth(Scope.Accounting), checkExact(Validators.isUpdateCurrencySettings()),
    currencyInputHandler(controller, async (currencyController, ctx, data: CurrencySettings) => {
      return await currencyController.updateCurrencySettings(ctx, data)
    }, CurrencySettingsSerializer)
  )

  // Create account
  router.post('/:code/accounts', userAuth(Scope.Accounting), checkExact(Validators.isCreateAccount()), 
    currencyInputHandler(controller, async (currencyController, ctx, data: InputAccount) => {
      return await currencyController.accounts.createAccount(ctx, data)
    }, AccountSerializer, 201)
  )

  // List accounts
  router.get('/:code/accounts', anyAuth(userAuth([Scope.Accounting, Scope.AccountingReadAll]), noAuth()), 
    currencyCollectionHandler(controller, async (currencyController, ctx, params) => {
      return await currencyController.accounts.getAccounts(ctx, params)
    }, AccountSerializer, {
      filter: ["id", "code", "tag"],
      sort: ["code", "balance", "creditLimit", "maximumBalance", "created", "updated"],
      include: ["currency", "settings"]
    })
  )

  // Get account. No auth required to get an account having its id. We need that for
  // external transactions.
  router.get('/:code/accounts/:id', anyAuth(userAuth([Scope.Accounting, Scope.AccountingReadAll]), noAuth()), 
    currencyResourceHandler(controller, async (currencyController, ctx, id) => {
      return await currencyController.accounts.getAccount(ctx, id)
    }, AccountSerializer, {
      include: ["currency", "settings", "currency.settings"]
    })
  )

  // Update account
  router.patch('/:code/accounts/:id', userAuth(Scope.Accounting), checkExact(Validators.isUpdateAccount()), 
    currencyInputHandler(controller, async (currencyController, ctx, data: UpdateAccount) => {
      return await currencyController.accounts.updateAccount(ctx, data)
    }, AccountSerializer)
  )

  // Get account settings
  router.get('/:code/accounts/:id/settings', userAuth([Scope.Accounting, Scope.AccountingReadAll]),
    currencyResourceHandler(controller, async (currencyController, ctx, id) => {
      return await currencyController.accounts.getAccountSettings(ctx, id)
    }, AccountSettingsSerializer, {})
  )

  // Update account settings
  router.patch('/:code/accounts/:id/settings', userAuth(Scope.Accounting), checkExact(Validators.isUpdateAccountSettings()),
    currencyInputHandler(controller, async (currencyController, ctx, data: AccountSettings) => {
      return await currencyController.accounts.updateAccountSettings(ctx, data)
    }, AccountSettingsSerializer)
  )
  // Delete account.
  router.delete('/:code/accounts/:id', userAuth(Scope.Accounting), asyncHandler(async (req, res) => {
    const currencyController = await controller.getCurrencyController(req.params.code)
    await currencyController.accounts.deleteAccount(context(req), req.params.id)
    res.status(204).end()
  }))

  // Create transfer. This endpoint can be accessed either from local users or from external accounts.
  router.post('/:code/transfers', anyAuth(userAuth(Scope.Accounting), externalAuth()), oneOf([Validators.isCreateTransfer(), Validators.isCreateTransfers()]), 
    currencyInputHandlerMultiple(controller, async (currencyController, ctx, data: InputTransfer|InputTransfer[]) => {
      if (Array.isArray(data)) {
        return await currencyController.transfers.createMultipleTransfers(ctx, data)
      } else {
        return await currencyController.transfers.createTransfer(ctx, data)
      }
    }, TransferSerializer, 201)
  )

  router.patch('/:code/transfers/:id', anyAuth(userAuth(Scope.Accounting), externalAuth()), checkExact(Validators.isUpdateTransfer()),
    currencyInputHandler(controller, async (currencyController, ctx, data: UpdateTransfer) => {
      return await currencyController.transfers.updateTransfer(ctx, data)
    }, TransferSerializer)
  )

  router.delete('/:code/transfers/:id', userAuth(Scope.Accounting), asyncHandler(async (req, res) => {
    const currencyController = await controller.getCurrencyController(req.params.code)
    await currencyController.transfers.deleteTransfer(context(req), req.params.id)
    res.status(204).end()
  }))

  router.get('/:code/transfers/:id', userAuth([Scope.Accounting, Scope.AccountingReadAll]), 
    currencyResourceHandler(controller, async (currencyController, ctx, id) => {
      return await currencyController.transfers.getTransfer(ctx, id)
    }, TransferSerializer, {
      include: ["payer", "payee", "currency"]
    })
  )

  router.get('/:code/transfers', userAuth([Scope.Accounting, Scope.AccountingReadAll]),
    currencyCollectionHandler(controller, async (currencyController, ctx, params) => {
      return await currencyController.transfers.getTransfers(ctx, params)
    }, TransferSerializer, {
      filter: ["payer", "payee", "account"],
      sort: ["created", "updated"],
      include: ["payer", "payee", "currency"]
    })
  )

  router.post('/:code/trustlines', userAuth(Scope.Accounting), checkExact(Validators.isCreateTrustline()),
    currencyInputHandler(controller, async (currencyController, ctx, data: InputTrustline) => {
      return await currencyController.createTrustline(ctx, data)
    }, TrustlineSerializer, 201)
  )

  router.get('/:code/trustlines/:id', userAuth([Scope.Accounting, Scope.AccountingReadAll]),
    currencyResourceHandler(controller, async (currencyController, ctx, id) => {
      return await currencyController.getTrustline(ctx, id)
    }, TrustlineSerializer, {
      include: ["currency", "trusted"]
    })
  )

  router.patch('/:code/trustlines/:id', userAuth(Scope.Accounting), checkExact(Validators.isUpdateTrustline()),
    currencyInputHandler(controller, async (currencyController, ctx, data: UpdateTrustline) => {
      return await currencyController.updateTrustline(ctx, data)
    }, TrustlineSerializer)
  )

  router.get('/:code/trustlines', userAuth([Scope.Accounting, Scope.AccountingReadAll]),
    currencyCollectionHandler(controller, async (currencyController, ctx, params) => {
      return await currencyController.getTrustlines(ctx, params)
    }, TrustlineSerializer, {
      sort: ["created", "updated"],
      include: ["currency", "trusted"]
    })
  )

  const successCache = (seconds: number) => routeCache.cacheSeconds(seconds, (req: Request, res: Response) => {
    // Cache only successful responses
    if (res.statusCode !== 200) {
      return null
    }
    // Cache based on the request URL
    return req.originalUrl || req.url
  })
  const publicStatsCache = successCache(4*60*60) // 4 hours

  router.get('/currencies/stats/amount', noAuth(), publicStatsCache, asyncHandler(async (req, res) => {
    const params = statsParams(req)
    const ctx = context(req)
    const stats = await controller.stats.getAmount(ctx, params)
    const result = await StatsSerializer.serialize(stats)
    res.status(200).json(result)
  }))

  router.get('/currencies/stats/accounts', noAuth(), publicStatsCache, asyncHandler(async (req, res) => {
    const params = accountStatsParams(req)
    const ctx = context(req)
    const stats = await controller.stats.getAccounts(ctx, params)
    const result = await StatsSerializer.serialize(stats)
    res.status(200).json(result)
  }))
  
  router.get('/currencies/stats/transfers', noAuth(), publicStatsCache, asyncHandler(async (req, res) => {
    const params = statsParams(req)
    const ctx = context(req)
    const stats = await controller.stats.getTransfers(ctx, params)
    const result = await StatsSerializer.serialize(stats)
    res.status(200).json(result)
  }))

  const currencyStatsCache = successCache(10*60) // 10 minutes

  router.get('/:code/stats/amount', userAuth([Scope.Accounting, Scope.AccountingReadAll]), currencyStatsCache,
    currencyHandler(controller, async (currencyController, ctx, req) => {
      const params = statsParams(req)
      const stats = await currencyController.stats.getAmount(ctx, params)
      return StatsSerializer.serialize(stats)
    })
  )

  router.get('/:code/stats/accounts', userAuth([Scope.Accounting, Scope.AccountingReadAll]), currencyStatsCache,
    currencyHandler(controller, async (currencyController, ctx, req) => {
      const params = accountStatsParams(req)
      const stats = await currencyController.stats.getAccounts(ctx, params)
      return StatsSerializer.serialize(stats)
    }
  ))

  router.get('/:code/stats/transfers', userAuth([Scope.Accounting, Scope.AccountingReadAll]), currencyStatsCache,
    currencyHandler(controller, async (currencyController, ctx, req) => {
      const params = statsParams(req)
      const stats = await currencyController.stats.getTransfers(ctx, params)
      return StatsSerializer.serialize(stats)
    })
  )

  // Migrations (WIP)
  router.post('/migrations', userAuth(Scope.Accounting), checkExact(Validators.isCreateMigration()), asyncHandler(async (req, res) => {
    const data = input(req)
    const migration = new MigrationController(controller)
    const result = await migration.createMigration(context(req), data as CreateMigration)
    res.status(201).json(result)
  }))

  return router

}