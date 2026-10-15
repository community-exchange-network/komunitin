import { onTestFinished } from "vitest"
import server from "@/server"
import { config } from "@/utils/config"
import { requireText } from "./index"

/** Create a payment to an existing member of the seeded external group. */
export const createExternalMemberTransfer = (payerId: string, memberIndex = 0) => {
  const group = server.schema.db.groups.findBy({ code: "GRP1" })
  const member = server.schema.db.members.where({ groupId: group.id })[memberIndex]
  const payee = server.schema.find("account", member.accountId)
  const originalMeta = server.schema.db.accounts.find(member.accountId).meta
  payee.update({ meta: {
    external: true,
    href: `${config.ACCOUNTING_URL}/GRP1/accounts/${payee.id}`
  } })
  const transfer = server.create("transfer")
  transfer.update({ payerId, payeeId: payee.id, updated: new Date().toISOString(), state: "committed" })
  onTestFinished(() => {
    transfer.destroy()
    payee.update({ meta: originalMeta })
  })
  return {
    accountId: payee.id,
    memberName: requireText(member.name, "External member name"),
    transferId: transfer.id
  }
}
