import type { MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue"
import type { MemberState } from "../store/model"
import { useI18n } from "vue-i18n"

type T = ReturnType<typeof useI18n>['t']

const STATUS_MAP = {
  active: { color: 'green', icon: 'visibility', label: (t: T) => t('active'), text: (t: T) => t('activeAccountText') },
  disabled: { color: 'grey', icon: 'visibility_off', label: (t: T) => t('disabled'), text: (t: T) => t('disabledAccountText') },
  pending: { color: 'light-blue', icon: 'hourglass_empty', label: (t: T) => t('pending'), text: (t: T) => t('pendingAccountText') },
  suspended: { color: 'deep-orange', icon: 'block', label: (t: T) => t('suspended'), text: (t: T) => t('suspendedAccountText') },
}

export const useAccountStatus = (status: MaybeRefOrGetter<MemberState>) => {
  const { t } = useI18n()

  const entry = computed(() => STATUS_MAP[toValue(status)])
  const color = computed(() => entry.value?.color ?? 'blue-grey')
  const icon = computed(() => entry.value?.icon ?? 'help')
  const label = computed(() => entry.value?.label(t) ?? toValue(status))
  const text = computed(() => entry.value?.text(t) ?? '')

  return { color, icon, label, text }
}