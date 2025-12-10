import { CurrencyPublicService, BaseService } from "..";
import { systemContext } from "src/utils/context";
import { config } from "src/config";
import { FullTransfer, User } from "src/model";
import { Relator, Serializer } from "ts-japi";
import { UserSerializer } from "src/server/serialize";
import { fixUrl } from "src/utils/net";

export enum EventName {
  TransferCommitted = "TransferCommitted",
  TransferPending = "TransferPending",
  TransferRejected = "TransferRejected",
}

export type Event = {
  name: EventName
  source: string
  time: string
  code: string
  data: Record<string, any>
  user: User
}

const event = (name: EventName, code: string, data: Record<string, any>, user: User): Event => ({
  name,
  source: config.API_BASE_URL,
  time: new Date().toISOString(),
  code,
  data,
  user
})

const EventSerializer = new Serializer<Event>("events", {
  relators: {
    user: new Relator<Event, User>(async (event) => event.user, UserSerializer, { 
      relatedName: "user",
    })
  },
})

const sendEvent = async (event: Event) => {
  const doc = await EventSerializer.serialize(event)
  const body = JSON.stringify(doc)
  // Send event to notifications service
  const url = `${config.NOTIFICATIONS_API_URL}/events`
  const basicAuth = Buffer.from(`${config.NOTIFICATIONS_API_USERNAME}:${config.NOTIFICATIONS_API_PASSWORD}`).toString("base64")
  await fetch(fixUrl(url), {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.api+json",
      Authorization: `Basic ${basicAuth}`
    },
    body
  })
}

/**
 * Send events to the notifications service when a transfer changes state.
 */
export const initNotifications = (controller: BaseService) => {
  // These are the states that we want to notify
  const notifiedStates = {
    committed: EventName.TransferCommitted,
    pending: EventName.TransferPending,
    rejected: EventName.TransferRejected
  }

  const onTransferChanged = async (transfer: FullTransfer, currencyController: CurrencyPublicService) => {
    const state = transfer.state
    if (state in notifiedStates) {
      const ctx = systemContext()
      const currency = await currencyController.getCurrency(ctx)
      const data = {
        transfer: transfer.id,
        payer: transfer.payer.id,
        payee: transfer.payee.id
      }
      const eventName = notifiedStates[state as keyof typeof notifiedStates]
      const e = event(eventName, currency.code, data, transfer.user)
      await sendEvent(e)
    }
  }

  controller.addListener("transferStateChanged", onTransferChanged)
}