import { readonly, shallowRef } from "vue"
import type { ConfirmedAuthUser } from "src/plugins/Auth"

const confirmation = shallowRef<ConfirmedAuthUser>()

function setConfirmation(user: ConfirmedAuthUser) {
  confirmation.value = user
}

function clearConfirmation() {
  confirmation.value = undefined
}

export function useEmailConfirmation() {
  return {
    confirmation: readonly(confirmation),
    setConfirmation,
    clearConfirmation
  }
}
