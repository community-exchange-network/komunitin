//import { translator } from './i18n'
import { MessagePayload } from 'firebase/messaging/sw'
/*
function truncate(text: string, length: number) {
  return (text.length <= length) ? text : text.slice(0, length - 2) + '...'
}*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function notificationBuilder() {
  return async (payload: MessagePayload) => {
    /*if (payload.data) {
      const {t,c} = await translator()
      // Get event name.
      const event = payload.data.event
      const group = payload.data.code
      let title = null as string | null
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      let options = {} as Record<string, any>
      switch (event) {
        case "TransferCommitted":
        case "TransferPending":
        case "TransferRejected": {
          // Get transfer details.
          await store.dispatch("transfers/load", {
            id: payload.data.transfer,
            group,
            include: "currency,payer,payee"
          })
          const transfer = store.getters["transfers/current"]
          const myAccount = store.getters["myAccount"]
          
          const currency = transfer.currency.attributes
          const amount = c(transfer.attributes.amount, currency.symbol, currency.decimals, currency.scale)
  
          if (transfer.payer.id === myAccount.id) {
            // I'm the payer. Get payee info.
            await store.dispatch("members/loadList", {
              group,
              filter: { account: transfer.payee.id },
              onlyResources: true
            })
            const name = transfer.payee.member.attributes.name
            
            if (event === "TransferCommitted") {
              title = t('newPurchase')
              options.body = t('newPurchaseText', {name, amount})
            } else if (event === "TransferPending") {
              title = t('paymentPending')
              options.body = t('paymentPendingText', {name, amount})
            }
            options.icon = transfer.payee.member.attributes.image || "/icons/icon-512x512.png"
          } else if (transfer.payee.id === myAccount.id) {
            // I'm the payee. Get payer info.
            await store.dispatch("members/loadList", {
              group,
              filter: { account: transfer.payer.id },
              onlyResources: true
            })
            const name = transfer.payer.member.attributes.name
            
            if (event === "TransferCommitted") {
              title = t('paymentReceived')
              options.body = t('paymentReceivedText', {name, amount})
            } else if (event === "TransferRejected") {
              title = t('paymentRejected')
              options.body = t('paymentRejectedText', {name, amount})
            }
            options.icon = transfer.payer.member.attributes.image || "/icons/icon-512x512.png"
          }
          
          if (!title) {
            throw new Error("Unexpected event received from push message: " + JSON.stringify(payload.data))
          }
  
          options.data = {
            url: `/groups/${group}/transactions/${transfer.id}`
          }
          break;
        }
        case "OfferPublished": {
          // Get offer details.
          await store.dispatch("offers/load", {
            id: payload.data.offer,
            group,
            include: "member"
          })
          const offer = store.getters["offers/current"]
          title = t('newOfferFrom', {name: offer.member.attributes.name})
          options = {
            body: offer.attributes.name + ' - ' + offer.attributes.content,
            icon: offer.member.attributes.image || "/icons/icon-512x512.png",
            image: offer.attributes.images && offer.attributes.images.length ? offer.attributes.images[0] : undefined,
            data: {
              url: `/groups/${group}/offers/${offer.attributes.code}`
            } 
          }
          break;
        }
        case "NeedPublished": {
          // Get need details.
          await store.dispatch("needs/load", {
            id: payload.data.need,
            group,
            include: "member"
          })
          const need = store.getters["needs/current"]
          title = t('newNeedFrom', {name: need.member.attributes.name})
          options = {
            body: need.attributes.content,
            icon: need.member.attributes.image || "/icons/icon-512x512.png",
            image: need.attributes.images && need.attributes.images.length ? need.attributes.images[0] : undefined,
            data: {
              url: `/groups/${group}/needs/${need.attributes.code}`
            }
          }
          break;
        }
        case "OfferExpired": {
          await store.dispatch("offers/load", {
            id: payload.data.offer,
            group
          })
          const offer = store.getters["offers/current"]
          title = t('offerExpired')
          options = {
            body: t('offerExpiredText', {title: offer.attributes.name}),
            icon: "/icons/icon-512x512.png",
            image: offer.attributes.images && offer.attributes.images.length ? offer.attributes.images[0] : undefined,
            data: {
              url: `/groups/${group}/offers/${offer.attributes.code}`
            }
          }
          break;
        }
        case "NeedExpired": {
          await store.dispatch("needs/load", {
            id: payload.data.need,
            group
          })
          const need = store.getters["needs/current"]
          title = t('needExpired')
          options = {
            body: t('needExpiredText', {content: truncate(need.attributes.content, 20)}),
            icon: "/icons/icon-512x512.png",
            image: need.attributes.images && need.attributes.images.length ? need.attributes.images[0] : undefined,
            data: {
              url: `/groups/${group}/needs/${need.attributes.code}`
            }
          }
          break;
        }
        case "MemberJoined": {
          // Get member details.
          await store.dispatch("members/load", {
            id: payload.data.member,
            group,
            include: "group"
          })
          const member = store.getters["members/current"]
          title = t('newMemberInGroup', {name: member.attributes.name, group: member.group.attributes.name})
          options = {
            body: t('newMemberLocation', {location: member.attributes.location?.name}),
            icon: member.attributes.image || "/icons/icon-512x512.png",
            data: {
              url: `/groups/${group}/members/${member.attributes.code}`
            }
          }
          break;
        }
        default:
          throw new Error("Unexpected event received from push message: " + JSON.stringify(payload.data))
      }
      // Show notification.
      return {
        title,
        options
      }
    } else {
      throw new Error("Unexpected push message: " + JSON.stringify(payload))
    }
    */
    throw new Error("Push notifications are not implemented yet")
  }
}

