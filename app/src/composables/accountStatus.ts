import { computed, MaybeRefOrGetter, toValue } from "vue"
import { MemberState } from "../store/model"
import { useI18n } from "vue-i18n"

export const useAccountStatus = (status: MaybeRefOrGetter<MemberState>) => {
  const color = computed(() => {
    switch (toValue(status)) {
      case 'active':
        return 'positive'
      case 'disabled':
        return 'grey-6'
      case 'pending':
        return 'info'
      case 'suspended':
        return 'warning'
      default:
        return 'blue-grey'
    }
  })

  const icon = computed(() => {
    switch (toValue(status)) {
      case 'active':
        return 'visibility'
      case 'disabled':
        return 'visibility_off'
      case 'pending':
        return 'hourglass_empty'
      case 'suspended':
        return 'block'
      default:
        return 'help'
    }
  })
  const { t } = useI18n()
  
  const label = computed(() => {
    switch (toValue(status)) {
      case 'active':
        return t('active')
      case 'disabled':
        return t('disabled')
      case 'pending':
        return t('pending')
      case 'suspended':
        return t('suspended')
      default:
        return toValue(status)
    }
  })

  const text = computed(() => {
    switch (toValue(status)) {
      case 'active':
        return t('activeAccountText')
      case 'disabled':
        return t('disabledAccountText')
      case 'pending':
        return t('pendingAccountText')
      case 'suspended':
        return t('suspendedAccountText')
      default:
        return ''
    }
  })

  return { color, icon, label, text }
}