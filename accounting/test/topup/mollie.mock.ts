import { before } from "node:test"
import { addHandlers } from "../server/net.mock"
import { http, HttpResponse } from "msw"
import { config } from "../../src/config"
import {type Express } from "express"
import request, { Response, Request } from "supertest"
import assert from "node:assert"

const MOLLIE_API_URL = 'https://api.mollie.com/v2'
const MOLLIE_CHECKOUT_URL = 'https://www.mollie.com/payscreen/select-method/mock-payment'

const payments = [] as any[]

export const mockMollie = (app: Express) => {
  addHandlers(
    http.post(`${MOLLIE_API_URL}/payments`, async ({ request }) => {
      const body = await request.json() as any
      const payment = {
        resource: 'payment',
        id: 'tr_mock_id',
        mode: 'test',
        status: 'open',
        amount: body.amount,
        description: body.description,
        redirectUrl: body.redirectUrl,
        webhookUrl: body.webhookUrl,
        _links: {
          checkout: {
            href: MOLLIE_CHECKOUT_URL,
            type: 'text/html'
          }
        }
      }
      payments.push(payment)
      return HttpResponse.json(payment, { status: 201 })
    }),
    http.get(`${MOLLIE_API_URL}/payments/:id`, ({ params }) => {
      const payment = payments.find(p => p.id === params.id)
      if (!payment) {
        return HttpResponse.json({ status: 'error', message: 'Payment not found' }, { status: 404 })
      }
      return HttpResponse.json(payment, { status: 200 })
    }),
    http.get(MOLLIE_CHECKOUT_URL, async () => {
      const payment = payments.findLast(p => p.status === 'open')
      if (!payment) {
        return HttpResponse.text('Not found', { status: 404 })
      }
      payment.status = 'paid'
      // Call the webhook URL to notify payment success
      const webhookPath = payment.webhookUrl.replace(config.WEBHOOKS_BASE_URL, '')
      const body = "id=" + encodeURIComponent(payment.id)
      const response = await request(app).post(webhookPath).send(body).set('Content-Type', 'application/x-www-form-urlencoded')
      assert.equal(response.status, 200)
      return HttpResponse.text(`<html><body>
        <div>Mock Mollie Checkout Page</div>
        <a href="${payment.redirectUrl}">Paid</a>
        </body></html>`)
    }),
    http.get(`${MOLLIE_API_URL}/methods`, () => {
      const methods = {
        "count": 1,
        "_embedded": {
          "methods": [
            {
              "resource": "method",
              "id": "creditcard",
              "description": "Credit card",
              "minimumAmount": {
                "value": "0.01",
                "currency": "EUR"
              },
              "maximumAmount": {
                "value": "2000.00",
                "currency": "EUR"
              },
              "image": {
                "size1x": "https://mollie.com/external/icons/payment-methods/creditcard.png",
                "size2x": "https://mollie.com/external/icons/payment-methods/creditcard%402x.png",
                "svg": "https://mollie.com/external/icons/payment-methods/creditcard.svg"
              },
              "status": "activated",
              "_links": {
                "self": {
                  "href": "...",
                  "type": "application/hal+json"
                }
              }
            }
          ]
        },
        "_links": {
          "self": {
            "href": "...",
            "type": "application/hal+json"
          },
          "documentation": {
            "href": "...",
            "type": "text/html"
          }
        }
      }
      return HttpResponse.json(methods, { status: 200 })
    })
  )
}