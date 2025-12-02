// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Server, ModelInstance} from "miragejs";
import { Model, Factory, Response, belongsTo, hasMany, Collection } from "miragejs";
import faker from "faker";
import { config } from "src/utils/config";
import ApiSerializer from "./ApiSerializer";
import { filter, sort, search } from "./ServerUtils";
import { inflections } from "inflected"
import { v4 as uuid } from "uuid";


const urlAccounting = config.ACCOUNTING_URL;
inflections("en", function (inflect) {
  inflect.irregular("accountSettings", "accountSettings")
  inflect.irregular("currencySettings", "currencySettings")
  inflect.irregular("topupSettings", "topupSettings")
  inflect.irregular("accountTopupSettings", "accountTopupSettings")
})

export default {
  serializers: {
    currency: ApiSerializer.extend({
      alwaysIncludeLinkageData: true, // include admins.
      selfLink: (model: { code: string }) => `${urlAccounting}/${model.code}/currency`,
    }),
    currencySettings: ApiSerializer.extend({
      selfLink: (model: any) => `${urlAccounting}/${model.currency.code}/currency/settings`
    }),
    account: ApiSerializer.extend({
      selfLink: (account: any) => `${urlAccounting}/${account.currency.code}/accounts/${account.id}`
    }),
    accountSettings: ApiSerializer.extend({
      selfLink: (model: any) => `${urlAccounting}/${model.account.currency.code}/accounts/${model.account.code}/settings`
    }),
    transfer: ApiSerializer.extend({
      selfLink: (model: any) => `${urlAccounting}/${model.payer.currency.code}/transfers/${model.id}`
    }),
    trustline: ApiSerializer.extend({
      selfLink: (model: any) => `${urlAccounting}/${model.currency.code}/trustlines/${model.id}`
    }),
    topupSettings: ApiSerializer.extend({
      selfLink: (model: any) => `${urlAccounting}/${model.currency.code}/currency/topup-settings`
    }),
    accountTopupSettings: ApiSerializer.extend({
      selfLink: (model: any) => `${urlAccounting}/${model.account.currency.code}/accounts/${model.account.id}/topup-settings`
    }),
    topups: ApiSerializer.extend({
      selfLink: (model: any) => `${urlAccounting}/${model.account.currency.code}/topups/${model.id}`
    }),
  },
  models: {
    currency: Model.extend({
      settings: belongsTo("currencySettings"),
      admins: hasMany("user"),
      trustlines: hasMany({inverse: "currency"}),
      topupSettings: belongsTo("topupSettings"),
    }),
    currencySettings: Model.extend({
      currency: belongsTo(),
    }),
    account: Model.extend({
      currency: belongsTo(),
      settings: belongsTo("accountSettings"),
      transfers: hasMany(),
      topupSettings: belongsTo("accountTopupSettings"),
    }),
    transfer: Model.extend({
      payer: belongsTo("account", {inverse: null}),
      payee: belongsTo("account", {inverse: null}),
      // currency missing
    }),
    accountSettings: Model.extend({
      account: belongsTo(),
    }),
    trustline: Model.extend({
      currency: belongsTo("currency", {inverse: "trustlines"}),
      trusted: belongsTo("currency", {inverse: null}) //should be external resource
    }),
    topupSettings: Model.extend({
      currency: belongsTo("currency"),
    }),
    accountTopupSettings: Model.extend({
      account: belongsTo("account"),
    }),
    topup: Model.extend({
      account: belongsTo("account"),
      transfer: belongsTo("transfer")
    })
  },
  factories: {
    currency: Factory.extend({
      codeType: "CEN",
      code: (i: number) => `CUR${i}`,
      name: () => faker.hacker.noun(),
      namePlural: () => faker.hacker.noun() + "s",
      symbol: () => faker.finance.currencySymbol(),
      decimals: 2,
      rate: (i: number) => ({
        n: 1,
        d: (10 ** i)
      }),
      scale: 4,
    }),
    currencySettings: Factory.extend({
      defaultInitialCreditLimit: 100000,
      defaultInitialMaximumBalance: false,
      defaultAllowPayments: true,
      defaultAllowPaymentRequests: true,
      defaultAcceptPaymentsAutomatically: true,
      defaultAcceptPaymentsWhitelist: [],
      defaultAllowSimplePayments: true,
      defaultAllowSimplePaymentRequests: true,
      defaultAllowQrPayments: true,
      defaultAllowQrPaymentRequests: true,
      defaultAllowMultiplePayments: true,
      defaultAllowMultiplePaymentRequests: true,
      defaultAllowTagPayments: true,
      defaultAllowTagPaymentRequests: true,
      defaultAcceptPaymentsAfter: 2*7*24*60*60,
      defaultOnPaymentCreditLimit: false,
      defaultAllowExternalPayments: true,
      defaultAllowExternalPaymentRequests: true,
      defaultAcceptExternalPaymentsAutomatically: false,
      enableExternalPayments: true,
      enableExternalPaymentRequests: (i: number) => (i < 3),
      enableCreditCommonsPayments: false,
      externalTraderCreditLimit: 1000000,
      externalTraderMaximumBalance: 1000000
    }),
    account: Factory.extend({
      code: (i: number) => `account-${i}`,
      status: "active",
      balance: () => faker.random.number({ max: 10000000, min: -5000000, precision: 100 }),
      creditLimit: 1000000,
      maximumBalance: 5000000
    }),
    transfer: Factory.extend({
      amount: () => faker.random.number({min: 0.1*10000, max: 100*10000, precision: 100}),
      meta: () => ({
        description: faker.company.catchPhrase(),
      }),
      state: (i: number) => (i < 3 ? "pending" : (i % 8 == 0) ? "rejected" : "committed"),
      created: (i: number) => faker.date.recent(i % 5).toJSON(),
      updated: (i: number) => faker.date.recent(i % 5).toJSON(),
      expires() {
        return this.state == "pending" ? faker.date.future().toJSON() : undefined;
      }
    }),
    accountSettings: Factory.extend({
      acceptPaymentsAutomatically: true,
      allowTagPayments: true,
      allowTagPaymentRequests: true,
      tags: (i: number) => (i == 2 ? [{
        id: "tag1",
        name: "Tag 1",
        updated: new Date().toJSON(),
        __value__: "31:83:47:8a",
      }] : []),
    }),
    trustline: Factory.extend({
      balance: 0,
      limit: 100000,
      created: new Date().toJSON(),
      updated: new Date().toJSON(),
    }),
    topupSettings: Factory.extend({
      enabled: false,
      defaultAllowTopup: false,
      depositCurrency: "EUR",
      paymentProvider: "mollie",
      rate: {n: 1, d: 100},
      minAmount: 100,
      maxAmount: 100000,
    }),
    accountTopupSettings: Factory.extend({
      allowTopup: false,
    }),
    topup: Factory.extend({
      depositAmount: 200,
      depositCurrency: "EUR",
      receiveAmount: 20000,
      status: "transfer_completed",
      meta: { description: "Mock topup" },
      paymentProvider: "mollie",
      paymentData: {
        paymentId: uuid(),
        checkoutUrl: "https://example.com/checkout/" + uuid(),
        status: "paid"
      },
      created: new Date().toJSON(),
      updated: new Date().toJSON(),
    }),
  },
  /**
   * Needs to be called after SocialServer.seeds.
   * @param server
   */
  seeds(server: any) {
    faker.seed(2029);
    // Create a currency for each group
    server.schema.groups
      .all()
      .models.forEach((group: ModelInstance<Record<string, any>>) => {
        const currency = server.create("currency", { code: group.code });
        group.update({ currency });
        // currency settings
        server.create("currencySettings", {currency});
        server.create("topupSettings", {currency});
      });
    // Create an account with settings for each member
    server.schema.members
      .all()
      .models.forEach(
        (member: ModelInstance<Record<string, any>>, i: number) => {
          const code = member.group.code;
          const accountCode = code + `${i}`.padStart(4, "0");
          const account = server.create("account", {
            code: accountCode,
            currency: server.schema.currencies.findBy({ code }),
          });
          member.update({ account });
        }
      );

    // Generate 25 transactions between the first account and the following 5 accounts.
    const accounts = server.schema.accounts.all();
    const account = accounts.models[0];
    for (let i = 1; i < 6; i++) {
      const other = accounts.models[i];
      server.createList("transfer", 2, {
        payer: account,
        payee: other,
      });
      server.createList("transfer", 3, {
        payer: other,
        payee: account,
      });
    }
    // Generate account settings.
    server.schema.accounts.all().models.forEach((account: any) => {
      server.create("accountSettings", {account});
      server.create("accountTopupSettings", {account});
    })
    // Generate some accounts for GRP2.
    server.createList("account", 5, {
      code: (i: number) => `GRP2${(i % 5).toString().padStart(4, "0")}`,
      currency: server.schema.currencies.findBy({ code: "GRP2" }),
    })

    // Define some trustlines ()
    const trustlines = [{
      currency: "GRP0",
      trusted: "GRP1"
    }, {
      currency: "GRP0",
      trusted: "GRP2"
    }, {
      currency: "GRP1",
      trusted: "GRP0"
    }, {
      currency: "GRP3",
      trusted: "GRP0"
    }]
    trustlines.forEach((trustline) => {
      server.create("trustline", {
        currency: server.schema.currencies.findBy({ code: trustline.currency }),
        trusted: server.schema.currencies.findBy({ code: trustline.trusted }),
      })
    })

    // Set currency admin user
    server.schema.currencies.first().update({admins: [server.schema.users.first()]})

    // generate transactions between user 1 and 2 (to check admin access)
    const account1 = accounts.models[1];
    const account2 = accounts.models[2];
    server.create("transfer", {
      payer: account1,
      payee: account2,
    });
    server.create("transfer", {
      payer: account2,
      payee: account1,
    });

    // set an account to zero balance to test deleting
    server.schema.accounts.all().models[15].update({balance: 0});

  },
  routes(server: Server) {
    // Single currency
    server.get(urlAccounting + "/:code/currency", (schema: any, request) => {
      return schema.currencies.findBy({ code: request.params.code });
    });
    // Update currency
    server.patch(urlAccounting + "/:code/currency", (schema: any, request: any) => {
      const currency = schema.currencies.findBy({ code: request.params.code })
      const body = JSON.parse(request.requestBody)
      currency.update(body.data.attributes)
      return currency
    })
    // List currencies
    server.get(urlAccounting + "/currencies", (schema: any, request) => {
      return filter(schema.currencies.all(), request);
    });
    // Currency settings
    server.get(`${urlAccounting}/:code/currency/settings`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.code});
      return currency.settings
    });

    // Edit currency settings
    server.patch(`${urlAccounting}/:code/currency/settings`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.code});
      const settings = currency.settings;
      const body = JSON.parse(request.requestBody);
      settings.update(body.data.attributes);
      return settings
    });

    // Accounts list
    server.get(urlAccounting + "/:code/accounts", (schema: any, request) => {
      const currency = schema.currencies.findBy({ code: request.params.code });
      const all = schema.accounts.where({ currencyId: currency.id })
      if (request.queryParams["filter[tag]"]) {
        return all.filter((account: any) => {
          return account.settings.tags.some((tag: any) => tag.__value__ == request.queryParams["filter[tag]"])
        })
      }
      return filter(all, request);
    });
    // Single account
    server.get(
      urlAccounting + "/:currency/accounts/:id",
      (schema: any, request) => {
        const currency = schema.currencies.findBy({
          code: request.params.currency
        });
        return schema.accounts.findBy({
          id: request.params.id,
          currencyId: currency.id
        });
      }
    );
    // Edit account
    server.patch(`${urlAccounting}/:currency/accounts/:id`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.currency});
      const account = schema.accounts.findBy({id: request.params.id, currencyId: currency.id});
      const body = JSON.parse(request.requestBody);
      account.update(body.data.attributes);
      return account;
    })
      
    // Account settings
    server.get(`${urlAccounting}/:currency/accounts/:id/settings`, (schema: any, request) => {
      const currency = schema.currencies.findBy({code: request.params.currency});
      const account = schema.accounts.findBy({id: request.params.id, currencyId: currency.id});
      return schema.accountSettings.findBy({accountId: account.id});
    });
      
    // Account transfers.
    server.get(`${urlAccounting}/:currency/transfers`,
      (schema: any, request: any) => {
        if (request.queryParams["filter[account]"]) {
          // Custom filtering.
          const accountId = request.queryParams["filter[account]"];
          let transfers = schema.transfers.where((transfer: any) => transfer.payerId == accountId || transfer.payeeId == accountId);
          transfers = search(transfers, request);
          transfers = sort(transfers, request);
          return transfers;
        } else {
          throw new Error("Unexpected request!");
        }
      }
    );
    // Single transfer
    server.get(`${urlAccounting}/:currency/transfers/:id`,
      (schema: any, request: any) => {
        return schema.transfers.find(request.params.id);
      }
    )
    // Create transfer
    server.post(`${urlAccounting}/:currency/transfers`,
      (schema: any, request: any) => {
        const body = JSON.parse(request.requestBody)
        const data = body.data;

        const dbResource = (resource: any) => ({
          id: resource.id, 
          type: resource.type, 
          ...resource.attributes,
          payer: schema.accounts.find(resource.relationships.payer.data.id),
          payee: schema.accounts.find(resource.relationships.payee.data.id),
        })

        let created
        if (Array.isArray(data)) {
          created = data.map((resource: any) => 
            schema.transfers.create(dbResource(resource))
          )
          // eslint-disable-next-line
          // @ts-ignore
          created = new Collection("transfer", created)
        } else {
          created = schema.transfers.create(dbResource(data))
        }
        
        return new Response(201, undefined, created)
      }
    )
    // Edit account settings
    server.patch(`${urlAccounting}/:currency/accounts/:id/settings`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.currency});
      const account = schema.accounts.findBy({id: request.params.id, currencyId: currency.id});
      const settings = schema.accountSettings.findBy({accountId: account.id});
      const body = JSON.parse(request.requestBody);
      settings.update(body.data.attributes);
      return new Response(200, undefined, settings);
    });

    // Get trustlines
    server.get(`${urlAccounting}/:currency/trustlines`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.currency});
      return currency.trustlines
    })
    // Create trustline
    server.post(`${urlAccounting}/:currency/trustlines`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.currency});
      const body = JSON.parse(request.requestBody);
      const trustline = schema.trustlines.create({
        ...body.data.attributes,
        currency,
        trusted: schema.currencies.find(body.data.relationships.trusted.data.id)
      })
      return new Response(201, undefined, trustline)
    })
    // Edit trustline
    server.patch(`${urlAccounting}/:currency/trustlines/:id`, (schema: any, request: any) => {
      const trustline = schema.trustlines.find(request.params.id);
      const body = JSON.parse(request.requestBody);
      trustline.update(body.data.attributes);
      return new Response(200, undefined, trustline);
    })

    // Stats
    server.get(`${urlAccounting}/:currency/stats/amount`, (schema: any, request: any) => {
      const query = request.queryParams
      const values = query.interval ? [120510000, 132150000, 140560000, 135120000, 148230000] : [query.to ? 102340000 : 120880000]
      return {data: {
        type: "currency-stats",
        id: uuid(),
        attributes: {
          values
        }
      }}
    })

    server.get(`${urlAccounting}/:currency/stats/accounts`, (schema: any, request: any) => {
      const query = request.queryParams
      const minTransfers = query.minTransfers ? parseInt(query.minTransfers) : 1
      const data = [120, 110, 115, 60, 82, 132, 128, 139].map(value => Math.ceil(value/(minTransfers + 1)))
      const values = query.interval ? data : [query.to ? 123 : 121]
      return {data: {
        type: "currency-stats",
        id: uuid(),
        attributes: {
          values
        }
      }}
    })

    server.get(`${urlAccounting}/:currency/cc/addresses/:id`, (schema: any, request: any) => {
      const id = request.params.id
      const currency = request.params.currency
      return {
        komunitin: `${urlAccounting}/${currency}/accounts/${id}`,
      }
    })

    server.get(`${urlAccounting}/:currency/currency/topup-settings`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.currency});
      return currency.topupSettings
    });

    server.get(`${urlAccounting}/:currency/accounts/:id/topup-settings`, (schema: any, request: any) => {
      const currency = schema.currencies.findBy({code: request.params.currency});
      const account = schema.accounts.findBy({id: request.params.id, currencyId: currency.id});
      return account.topupSettings;
    });
  }
};
